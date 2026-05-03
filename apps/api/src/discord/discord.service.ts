import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { GifsService } from "../gifs/gifs.service";
import { MediaService } from "../media/media.service";
import { UsersService } from "../users/users.service";
import { FoldersService } from "../folders/folders.service";
import { TranscoderService } from "../transcoder/transcoder.service";
import { looksLikeGif, looksLikeVideo } from "../s3/file-signatures";
import { DiscordLinkService } from "./discord-link.service";
import { DiscordPrefService } from "./discord-pref.service";

const AUTOCOMPLETE_MAX = 25;
const MAX_TITLE_LEN = 200;
const MAX_TAGS = 10;
// Gallery shown when /gif is submitted with free-text instead of an
// autocomplete-picked UUID. Discord allows up to 10 embeds + 5 buttons
// per row; 5 keeps both within budget and the message scannable. The
// embed shows the actual animated GIF as its image — Discord auto-
// plays animated images in embeds, which is the visual preview that
// slash-command autocomplete can't render itself.
const GALLERY_RESULTS = 5;
// Discord lets free users attach up to 25 MiB and Nitro tiers higher
// still. We accept up to 50 MiB for non-GIF inputs so a moderately
// long video has room to transcode down — the post-transcode buffer
// is what gets validated against the 20 MiB GIF cap inside
// gifs.createFromBuffer, so a too-large source video is rejected
// only after the encode work, but a clearly-abusive 100 MiB upload
// is bounced at the door.
const MAX_DISCORD_ATTACHMENT_BYTES = 50 * 1024 * 1024;

@Injectable()
export class DiscordService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DiscordService.name);
  private client: Client | null = null;
  private clientId: string | null = null;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    private readonly gifs: GifsService,
    private readonly media: MediaService,
    private readonly users: UsersService,
    private readonly folders: FoldersService,
    private readonly transcoder: TranscoderService,
    private readonly links: DiscordLinkService,
    private readonly prefs: DiscordPrefService,
  ) {}

  /**
   * Active-folder accessors exposed to the tRPC router so the web app
   * can read/write a Discord-linked user's folder selection without
   * importing DiscordPrefService directly. Null when no row exists,
   * matching the bot's "no folder = full library" default.
   */
  async getActiveFolderId(discordUserId: string): Promise<string | null> {
    return this.prefs.getActiveFolderId(discordUserId);
  }
  async setActiveFolder(
    discordUserId: string,
    folderId: string | null,
  ): Promise<void> {
    return this.prefs.setActiveFolderId(discordUserId, folderId);
  }
  async clearActiveFolder(discordUserId: string): Promise<void> {
    return this.prefs.setActiveFolderId(discordUserId, null);
  }

  /**
   * Public-side helper used by the tRPC `discord.startLink` procedure.
   * Returns the link code + both install URLs (user-install for DM
   * use, guild-install for adding to a server) so the UI can offer
   * both flows. Returns null when the bot isn't configured.
   */
  buildStartLink(
    userId: string,
  ): {
    code: string;
    userInstallUrl: string | null;
    guildInstallUrl: string | null;
    clientId: string;
  } | null {
    if (!this.client || !this.clientId) return null;
    const code = this.links.issueLinkToken(userId);
    return {
      code,
      userInstallUrl: this.buildUserInstallUrl(),
      guildInstallUrl: this.buildGuildInstallUrl(),
      clientId: this.clientId,
    };
  }

  /**
   * User-install URL — adds the bot to the user's account so /gif
   * works in DMs and any server they're in (without admin rights). No
   * `bot` scope (that forces guild-install mode) and no `permissions`
   * param (irrelevant for user installs). `integration_type=1` biases
   * the picker toward the user-install context.
   *
   * Requires "User Install" to be enabled in the Discord Developer
   * Portal under Installation → Installation Contexts. Without it,
   * the OAuth dialog renders with only "Add to server" no matter
   * what URL we send.
   */
  private buildUserInstallUrl(): string | null {
    if (!this.clientId) return null;
    return `https://discord.com/oauth2/authorize?client_id=${this.clientId}&scope=applications.commands&integration_type=1`;
  }

  /**
   * Guild-install URL — the classic "add to server" flow. Server
   * admins use this to install the bot for everyone in their guild.
   * 0 permissions — we only post via interaction replies, which
   * don't require channel-level perms beyond what slash-command
   * framing already grants.
   */
  private buildGuildInstallUrl(): string | null {
    if (!this.clientId) return null;
    const scopes = ["applications.commands", "bot"].join("%20");
    return `https://discord.com/oauth2/authorize?client_id=${this.clientId}&permissions=0&scope=${scopes}&integration_type=0`;
  }

  /**
   * Boot the gateway connection only when the token is configured. In
   * dev we'll often run without DISCORD_BOT_TOKEN; the API still comes
   * up fine — the bot just no-ops and `discord.startLink` returns
   * PRECONDITION_FAILED so the UI hides the connect button.
   */
  async onApplicationBootstrap(): Promise<void> {
    const token = this.config.get<string>("DISCORD_BOT_TOKEN");
    const clientId = this.config.get<string>("DISCORD_CLIENT_ID");
    if (!token || !clientId) {
      this.logger.log(
        "DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID not set — Discord bot disabled",
      );
      return;
    }
    this.clientId = clientId;
    this.client = new Client({
      // Slash commands only — no need for Guilds beyond a minimal intent
      // for the gateway to accept the connection. We never read messages
      // or member lists.
      intents: [GatewayIntentBits.Guilds],
    });

    this.client.once(Events.ClientReady, (c) => {
      this.logger.log(
        `discord.bot ready as ${c.user.tag} (id=${c.user.id})`,
      );
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      // Errors thrown out of an event handler take down the client.
      // Catch + log so a bad input or stale interaction doesn't crash
      // the whole bot.
      this.handleInteraction(interaction).catch((err) => {
        this.logger.warn(
          `discord.interaction failed: ${(err as Error).message}`,
        );
      });
    });

    try {
      await this.registerCommands(token, clientId);
    } catch (err) {
      this.logger.error(
        `discord.registerCommands failed: ${(err as Error).message}`,
      );
    }

    try {
      await this.client.login(token);
    } catch (err) {
      this.logger.error(
        `discord.bot login failed: ${(err as Error).message}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.client) {
      await this.client.destroy().catch(() => {});
    }
  }

  /**
   * Register the slash command set globally on every boot. Discord's
   * commands endpoint is a PUT (full replacement), so this is
   * idempotent. Global commands can take up to ~1h to propagate to
   * client caches the first time; subsequent edits are usually
   * sub-minute. For dev iteration, set DISCORD_DEV_GUILD_ID to scope
   * commands to one guild — those propagate instantly.
   */
  private async registerCommands(
    token: string,
    clientId: string,
  ): Promise<void> {
    const commands = this.buildCommands();
    const rest = new REST({ version: "10" }).setToken(token);
    const devGuild = this.config.get<string>("DISCORD_DEV_GUILD_ID");
    if (devGuild) {
      await rest.put(Routes.applicationGuildCommands(clientId, devGuild), {
        body: commands,
      });
      this.logger.log(
        `discord.registerCommands ok (guild=${devGuild}, count=${commands.length})`,
      );
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      this.logger.log(
        `discord.registerCommands ok (global, count=${commands.length})`,
      );
    }
  }

  /**
   * Slash-command schema. Every command is registered for both guild
   * and user installs — `/gif` in particular makes the most sense as a
   * user-install (works in any DM/server the user is in without
   * needing admin rights to add the bot). Returns the wire JSON so
   * the variant builder types (SlashCommandBuilder vs the
   * options/subcommands-only narrowed siblings) don't poison the
   * caller with a tagged-union to satisfy.
   */
  private buildCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
    const bothInstalls = [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ];
    const allContexts = [
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ];

    const gif = new SlashCommandBuilder()
      .setName("gif")
      .setDescription("Search and post a GIF from vidsandgifs.xyz")
      .addStringOption((o) =>
        o
          .setName("query")
          .setDescription("Search by title or tag")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const link = new SlashCommandBuilder()
      .setName("link")
      .setDescription("Connect your vidsandgifs.xyz account")
      .addStringOption((o) =>
        o
          .setName("code")
          .setDescription("Code from vidsandgifs.xyz/settings")
          .setRequired(true),
      )
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const unlink = new SlashCommandBuilder()
      .setName("unlink")
      .setDescription("Disconnect your vidsandgifs.xyz account")
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const folder = new SlashCommandBuilder()
      .setName("folder")
      .setDescription("Manage your active folder for /gif search")
      .addSubcommand((s) =>
        s.setName("list").setDescription("List your folders"),
      )
      .addSubcommand((s) =>
        s
          .setName("use")
          .setDescription("Set the active folder")
          .addStringOption((o) =>
            o
              .setName("name")
              .setDescription("Folder name")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((s) =>
        s.setName("clear").setDescription("Clear the active folder"),
      )
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const upload = new SlashCommandBuilder()
      .setName("upload")
      .setDescription("Upload a GIF from a URL to vidsandgifs.xyz")
      .addStringOption((o) =>
        o
          .setName("url")
          .setDescription("Direct URL to a .gif")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("title")
          .setDescription("Title for the GIF")
          .setRequired(true)
          .setMaxLength(MAX_TITLE_LEN),
      )
      .addStringOption((o) =>
        o
          .setName("tags")
          .setDescription("Optional comma-separated tags")
          .setRequired(false)
          .setMaxLength(200),
      )
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const uploadFile = new SlashCommandBuilder()
      .setName("upload-file")
      .setDescription("Upload a GIF (or video — auto-converted) by attaching a file")
      .addAttachmentOption((o) =>
        o
          .setName("file")
          .setDescription("GIF, MP4, MOV, WebM, or MKV")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("title")
          .setDescription("Title for the GIF")
          .setRequired(true)
          .setMaxLength(MAX_TITLE_LEN),
      )
      .addStringOption((o) =>
        o
          .setName("tags")
          .setDescription("Optional comma-separated tags")
          .setRequired(false)
          .setMaxLength(200),
      )
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    const help = new SlashCommandBuilder()
      .setName("help")
      .setDescription("How to use the vidsandgifs bot")
      .setIntegrationTypes(bothInstalls)
      .setContexts(allContexts);

    return [gif, link, unlink, folder, upload, uploadFile, help].map((c) =>
      c.toJSON(),
    );
  }

  // ─── Dispatch ──────────────────────────────────────────────────────

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      await this.onAutocomplete(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("gif:send:")) {
        await this.onGifSendButton(interaction);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    switch (interaction.commandName) {
      case "gif":
        await this.onGif(interaction);
        return;
      case "link":
        await this.onLink(interaction);
        return;
      case "unlink":
        await this.onUnlink(interaction);
        return;
      case "folder":
        await this.onFolder(interaction);
        return;
      case "upload":
        await this.onUpload(interaction);
        return;
      case "upload-file":
        await this.onUploadFile(interaction);
        return;
      case "help":
        await this.onHelp(interaction);
        return;
    }
  }

  // ─── Autocomplete ──────────────────────────────────────────────────

  private async onAutocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    if (interaction.commandName === "gif") {
      await this.autocompleteGif(interaction);
      return;
    }
    if (
      interaction.commandName === "folder" &&
      interaction.options.getSubcommand(false) === "use"
    ) {
      await this.autocompleteFolder(interaction);
      return;
    }
  }

  private async autocompleteGif(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused();
    const discordUserId = interaction.user.id;
    let restrictToFolderId: string | null = null;
    try {
      const link = await this.links.findByDiscordUserId(discordUserId);
      if (link) {
        const folderId = await this.prefs
          .getActiveFolderId(discordUserId)
          .catch(() => null);
        if (folderId) {
          try {
            const f = await this.folders.findOwned(folderId, link.userId);
            restrictToFolderId = f.id;
          } catch {
            // Folder gone — clear stale pref and fall through to the
            // unrestricted public search rather than dead-ending the
            // user on an empty autocomplete.
            await this.prefs
              .setActiveFolderId(discordUserId, null)
              .catch(() => {});
          }
        }
      }
    } catch {
      // Best-effort folder resolution — fall back to public search
      // rather than rejecting the autocomplete.
    }

    let items: Array<{ id: string; title: string }> = [];
    try {
      items = await this.gifs.searchInlineForBot({
        q: focused,
        limit: AUTOCOMPLETE_MAX,
        restrictToFolderId,
      });
    } catch (err) {
      this.logger.warn(
        `discord.autocomplete gif search failed: ${(err as Error).message}`,
      );
    }
    // Discord requires every autocomplete option to have a non-empty
    // name + value, both ≤100 chars. Truncate titles defensively
    // (uploads cap titles at 200 chars).
    const choices = items.slice(0, AUTOCOMPLETE_MAX).map((g) => ({
      name: truncate(g.title || "(untitled)", 100),
      value: g.id,
    }));
    await interaction.respond(choices).catch(() => {
      // Discord rejects responses after the 3s window — log and move
      // on. The user just sees an empty autocomplete and can retype.
    });
    this.logger.log(
      `discord.autocomplete gif from=${discordUserId} q="${focused}" returned=${choices.length} folderId=${restrictToFolderId ?? "none"}`,
    );
  }

  private async autocompleteFolder(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase();
    const discordUserId = interaction.user.id;
    const link = await this.links
      .findByDiscordUserId(discordUserId)
      .catch(() => null);
    if (!link) {
      await interaction.respond([]).catch(() => {});
      return;
    }
    const folders = await this.folders
      .listForOwner(link.userId)
      .catch(() => []);
    const filtered = folders.filter(
      (f) => !focused || f.name.toLowerCase().includes(focused),
    );
    const choices = filtered.slice(0, AUTOCOMPLETE_MAX).map((f) => ({
      name: truncate(`${f.name} (${f.gifCount})`, 100),
      value: f.id,
    }));
    await interaction.respond(choices).catch(() => {});
  }

  // ─── /gif ──────────────────────────────────────────────────────────

  private async onGif(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const queryOrId = interaction.options.getString("query", true);
    if (isUuid(queryOrId)) {
      // Autocomplete fast path — user picked a specific gif from the
      // suggestion list, so we know exactly what to send. No preview
      // step needed.
      await this.postGifDirectly(interaction, queryOrId, queryOrId);
      return;
    }
    // Free-text submit (user typed and hit enter without picking a
    // suggestion): show a visual preview gallery so they can see what
    // they're about to send. Discord's slash-command autocomplete is
    // text-only — this gallery flow is the closest equivalent to the
    // Telegram inline picker's GIF-thumbnail grid.
    await this.replyWithGifGallery(interaction, queryOrId);
  }

  /**
   * Resolve the active-folder restriction for a Discord user. Shared
   * between the autocomplete handler and both /gif paths so the same
   * "linked + active folder = scope to that folder" rules apply
   * uniformly. Stale prefs (folder deleted out from under the user)
   * are silently cleared and treated as no-restriction.
   */
  private async resolveGifScope(
    discordUserId: string,
  ): Promise<{ restrictToFolderId: string | null }> {
    const link = await this.links
      .findByDiscordUserId(discordUserId)
      .catch(() => null);
    if (!link) return { restrictToFolderId: null };
    const folderId = await this.prefs
      .getActiveFolderId(discordUserId)
      .catch(() => null);
    if (!folderId) return { restrictToFolderId: null };
    try {
      const f = await this.folders.findOwned(folderId, link.userId);
      return { restrictToFolderId: f.id };
    } catch {
      await this.prefs
        .setActiveFolderId(discordUserId, null)
        .catch(() => {});
      return { restrictToFolderId: null };
    }
  }

  /**
   * Single-shot: turn a known gif id into a public reply containing
   * the website's /gifs/{id} page URL. Discord fetches the page,
   * parses OGP, and renders a rich embed using og:image (.gif) and
   * og:video. Posting the page URL (not the bare .gif URL) is what
   * makes Discord treat the result as a video-type embed, which on
   * most clients renders with auto-play — direct .gif URL embeds
   * fall under the "Automatically play GIFs" accessibility toggle
   * which a non-trivial fraction of users have disabled.
   *
   * If the gif isn't ready, fall back to the signed gif URL so the
   * user still gets a functional result (with the auto-play caveat).
   */
  private async postGifDirectly(
    interaction: ChatInputCommandInteraction,
    gifId: string,
    query: string,
  ): Promise<void> {
    // Probe the gif resolution first so we can short-circuit on
    // "not available" without a wasted reply round-trip. The page
    // URL itself doesn't need a signed token — the gif page is
    // public and the GIF media URL inside its OGP is signed by the
    // page's own SSR.
    const key = await this.media.resolveKey("gif", gifId);
    if (!key) {
      await interaction.reply({
        content: "That GIF isn't available right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const webOrigin =
      this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
    const pageUrl = `${webOrigin}/gifs/${gifId}`;
    await interaction.reply({ content: pageUrl });
    this.logger.log(
      `discord./gif direct from=${interaction.user.id} gifId=${gifId} q="${truncate(query, 60)}"`,
    );
  }

  /**
   * Visual preview gallery — replies ephemerally with up to 5
   * embeds (each rendered as the auto-playing animated GIF) plus a
   * row of numbered buttons. Click a button → onGifSendButton posts
   * the chosen gif into the channel publicly.
   *
   * Ephemeral keeps the gallery visible only to the invoking user;
   * Discord scrubs it on dismiss. Custom IDs (`gif:send:<id>`)
   * encode the chosen gif so the click handler doesn't need any
   * server-side state — buttons survive bot restarts as long as
   * Discord still routes the interaction (15-min default).
   */
  private async replyWithGifGallery(
    interaction: ChatInputCommandInteraction,
    query: string,
  ): Promise<void> {
    const discordUserId = interaction.user.id;
    const { restrictToFolderId } = await this.resolveGifScope(discordUserId);
    const items = await this.gifs.searchInlineForBot({
      q: query,
      limit: GALLERY_RESULTS,
      restrictToFolderId,
    });
    if (items.length === 0) {
      await interaction.reply({
        content: `No GIFs matched **${truncate(query, 80)}**. Try a different search.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const enriched = await Promise.all(
      items.map(async (g) => ({
        id: g.id,
        title: g.title,
        url: await this.media.signUrl({ kind: "gif", id: g.id }),
      })),
    );
    const valid = enriched.filter(
      (e): e is { id: string; title: string; url: string } => !!e.url,
    );
    if (valid.length === 0) {
      await interaction.reply({
        content: "No matches available right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const embeds = valid.map((g, i) =>
      new EmbedBuilder()
        .setTitle(`${i + 1}. ${truncate(g.title || "(untitled)", 200)}`)
        .setImage(g.url)
        // iris-9 from the Radix palette — matches the brand color used
        // in the website's Discord-related UI rows.
        .setColor(0x5b5bd6),
    );
    const buttons = valid.map((g, i) =>
      new ButtonBuilder()
        .setCustomId(`gif:send:${g.id}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Primary),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    await interaction.reply({
      content:
        "Pick one to send into the chat (only you can see this preview):",
      embeds,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    this.logger.log(
      `discord./gif gallery from=${discordUserId} q="${truncate(query, 60)}" returned=${valid.length} folderId=${restrictToFolderId ?? "none"}`,
    );
  }

  /**
   * Click handler for the gallery's "send #N" buttons. Pulls the gif
   * id out of `customId`, mints a fresh signed URL, and posts it into
   * the channel publicly via `channel.send` so everyone in the
   * conversation sees it (the original gallery was ephemeral and
   * doesn't suit a "broadcast" semantic).
   *
   * Falls back gracefully when the bot can't post publicly — that's
   * the user-installed-in-non-member-guild case where Discord
   * forbids public bot messages. We surface the URL in the ephemeral
   * so the user can copy + paste it themselves.
   */
  private async onGifSendButton(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const prefix = "gif:send:";
    const gifId = interaction.customId.slice(prefix.length);
    if (!isUuid(gifId)) {
      await interaction
        .update({
          content: "That button is malformed.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }
    const key = await this.media.resolveKey("gif", gifId);
    if (!key) {
      await interaction
        .update({
          content: "That GIF isn't available anymore.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }
    const webOrigin =
      this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
    const pageUrl = `${webOrigin}/gifs/${gifId}`;
    let postedPublicly = false;
    try {
      // `channel.send` posts a regular (non-ephemeral) message in the
      // current channel. Works in DMs and servers where the bot is a
      // member; throws on permission denied (user-installed app in a
      // guild the bot isn't part of).
      if (interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send({ content: pageUrl });
        postedPublicly = true;
      }
    } catch {
      // expected in user-install non-member contexts — handled below
    }
    if (postedPublicly) {
      await interaction.update({
        content: "✓ Sent",
        embeds: [],
        components: [],
      });
    } else {
      // Fallback when the bot can't post publicly: surface the URL in
      // the ephemeral so the user can copy + paste it themselves.
      await interaction.update({
        content: `Couldn't post here directly — copy & paste:\n${pageUrl}`,
        embeds: [],
        components: [],
      });
    }
    this.logger.log(
      `discord./gif gallery picked from=${interaction.user.id} gifId=${gifId} postedPublicly=${postedPublicly}`,
    );
  }

  // ─── /link ─────────────────────────────────────────────────────────

  private async onLink(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const code = interaction.options.getString("code", true).trim();
    const discordUserId = interaction.user.id;
    const userId = this.links.redeemLinkToken(code);
    if (!userId) {
      await interaction.reply({
        content:
          "That code is expired or invalid. Open vidsandgifs.xyz/settings and click **Connect Discord** for a fresh code.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const account = await this.users.findById(userId).catch(() => null);
    if (!account) {
      await interaction.reply({
        content: "Couldn't find that account. Try a fresh code.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await this.links.link({
      discordUserId,
      userId,
      discordUsername: interaction.user.username ?? null,
    });
    await interaction.reply({
      content: `Linked to **${account.name}**. Try \`/gif query:cat\` to search your library.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─── /unlink ───────────────────────────────────────────────────────

  private async onUnlink(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const discordUserId = interaction.user.id;
    const link = await this.links.findByDiscordUserId(discordUserId);
    if (!link) {
      await interaction.reply({
        content: "You're not linked yet — nothing to unlink.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await this.links.unlinkByDiscordUserId(discordUserId);
    await this.prefs.setActiveFolderId(discordUserId, null).catch(() => {});
    await interaction.reply({
      content: "Unlinked. `/link` again with a fresh code anytime.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─── /folder ───────────────────────────────────────────────────────

  private async onFolder(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const sub = interaction.options.getSubcommand(true);
    const discordUserId = interaction.user.id;
    const link = await this.links.findByDiscordUserId(discordUserId);
    if (!link) {
      await interaction.reply({
        content:
          "Connect your account first with `/link code:<from-website>` to use folders.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const folders = await this.folders.listForOwner(link.userId);
      if (folders.length === 0) {
        await interaction.reply({
          content:
            "No folders yet. Create one at vidsandgifs.xyz, then come back and `/folder use`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const activeId = await this.prefs.getActiveFolderId(discordUserId);
      const lines = folders.map((f, i) => {
        const mark = f.id === activeId ? "  ← active" : "";
        return `${i + 1}. **${f.name}** — ${f.gifCount} gif${f.gifCount === 1 ? "" : "s"}${mark}`;
      });
      const header =
        "**Your folders**\nUse `/folder use name:<…>` to scope `/gif` search to one of these.";
      await interaction.reply({
        content: `${header}\n\n${lines.join("\n")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "use") {
      // The autocomplete handler hands us the folder id as the value.
      // If a user submits before the autocomplete populates (e.g.
      // typed-and-hit-enter on a slow connection), the value is the
      // raw text instead — fall back to a name lookup so the command
      // still works.
      const raw = interaction.options.getString("name", true);
      const folders = await this.folders.listForOwner(link.userId);
      let target = folders.find((f) => f.id === raw);
      if (!target) {
        const lower = raw.toLowerCase();
        target = folders.find((f) => f.name.toLowerCase() === lower);
      }
      if (!target) {
        await interaction.reply({
          content: `No folder named **${truncate(raw, 80)}**. Use \`/folder list\` to see your folders.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await this.prefs.setActiveFolderId(discordUserId, target.id);
      await interaction.reply({
        content: `Active folder set to **${target.name}**. \`/gif\` will now search inside it.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "clear") {
      await this.prefs.setActiveFolderId(discordUserId, null);
      await interaction.reply({
        content:
          "Active folder cleared. `/gif` will now search the full public library.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // ─── /upload ───────────────────────────────────────────────────────

  private async onUpload(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const url = interaction.options.getString("url", true).trim();
    const title = interaction.options.getString("title", true).trim();
    const rawTags = interaction.options.getString("tags", false) ?? "";
    const tagNames = rawTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS);
    const discordUserId = interaction.user.id;
    const link = await this.links.findByDiscordUserId(discordUserId);
    if (!link) {
      await interaction.reply({
        content:
          "Connect your account first with `/link code:<from-website>` to upload.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const account = await this.users.findById(link.userId);
    if (!account) {
      await interaction.reply({
        content: "Account not found. Try `/unlink` then `/link` again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (account.status !== "verified") {
      await interaction.reply({
        content:
          "Verify your email at vidsandgifs.xyz first to enable bot uploads.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // The URL fetch + magic-byte check + compression can take several
    // seconds. Defer immediately so we don't blow the 3s response
    // window — Discord shows a "thinking…" pip until we send the
    // followup.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await this.gifs.uploadFromUrl({
        ownerId: account.id,
        ownerStatus: account.status,
        ownerApproved: account.approved,
        url,
        title,
        description: "",
        tagNames,
        visibility: "public",
      });
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      // Drop the new gif into the user's active folder, if one is set
      // — same convenience the Telegram bot offers.
      const folderId = await this.prefs.getActiveFolderId(discordUserId);
      if (folderId) {
        await this.folders
          .addGif(account.id, folderId, result.gifId)
          .catch(() => {});
      }
      await interaction.editReply({
        content: `Uploaded **${truncate(title, 80)}** → ${webOrigin}/gifs/${result.gifId}`,
      });
      this.logger.log(
        `discord./upload from=${discordUserId} userId=${account.id} gifId=${result.gifId}`,
      );
    } catch (err) {
      const message = (err as Error).message ?? "Upload failed.";
      await interaction.editReply({
        content: `Upload failed: ${truncate(message, 200)}`,
      });
    }
  }

  // ─── /upload-file ──────────────────────────────────────────────────

  private async onUploadFile(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const attachment = interaction.options.getAttachment("file", true);
    const title = interaction.options.getString("title", true).trim();
    const rawTags = interaction.options.getString("tags", false) ?? "";
    const tagNames = rawTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS);
    const discordUserId = interaction.user.id;
    const link = await this.links.findByDiscordUserId(discordUserId);
    if (!link) {
      await interaction.reply({
        content:
          "Connect your account first with `/link code:<from-website>` to upload.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const account = await this.users.findById(link.userId);
    if (!account) {
      await interaction.reply({
        content: "Account not found. Try `/unlink` then `/link` again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (account.status !== "verified") {
      await interaction.reply({
        content:
          "Verify your email at vidsandgifs.xyz first to enable bot uploads.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (attachment.size > MAX_DISCORD_ATTACHMENT_BYTES) {
      const mb = Math.round(MAX_DISCORD_ATTACHMENT_BYTES / 1024 / 1024);
      await interaction.reply({
        content: `That file is over ${mb} MB. Trim it down and try again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Download + magic-byte sniff + optional video transcode can take
    // several seconds on a worst-case input. Defer immediately so we
    // don't blow the 3 s interaction-response window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let downloaded: Buffer;
    try {
      // Attachment URLs are scoped to cdn.discordapp.com — Discord's
      // own CDN, not user-controlled — so no SSRF surface to harden
      // against here. The size cap above already bounded the body.
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`download returned ${response.status}`);
      }
      downloaded = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      this.logger.warn(
        `discord./upload-file download failed userId=${account.id}: ${(err as Error).message}`,
      );
      await interaction.editReply({
        content: `Couldn't fetch that attachment: ${truncate((err as Error).message ?? "", 160)}`,
      });
      return;
    }

    // Same sniff-then-transcode pipeline the Telegram bot uses: trust
    // the bytes, not the Content-Type, since Discord clients can label
    // the same file as image/gif, video/mp4, or application/octet-stream
    // depending on how it was attached. GIF → use as-is (createFromBuffer
    // re-compresses to SD internally). Video → transcode to GIF first
    // via the existing palette pipeline. Anything else → reject.
    const head16 = downloaded.subarray(0, 16);
    let gifBuffer: Buffer = downloaded;
    if (looksLikeGif(head16)) {
      // happy path
    } else if (looksLikeVideo(head16)) {
      try {
        gifBuffer = await this.transcoder.compressGifToSd(downloaded);
      } catch (err) {
        this.logger.warn(
          `discord./upload-file video→gif failed userId=${account.id}: ${(err as Error).message}`,
        );
        await interaction.editReply({
          content:
            "Couldn't convert that video to a GIF. Try a shorter or simpler clip.",
        });
        return;
      }
    } else {
      await interaction.editReply({
        content:
          "That file doesn't look like a GIF or supported video (MP4, MOV, WebM, MKV).",
      });
      return;
    }

    try {
      const gif = await this.gifs.createFromBuffer({
        ownerId: account.id,
        ownerStatus: account.status,
        ownerApproved: account.approved,
        title,
        buffer: gifBuffer,
        tagNames,
      });
      const folderId = await this.prefs.getActiveFolderId(discordUserId);
      if (folderId) {
        await this.folders
          .addGif(account.id, folderId, gif.id)
          .catch(() => {});
      }
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      await interaction.editReply({
        content: `Uploaded **${truncate(title, 80)}** → ${webOrigin}/gifs/${gif.id}`,
      });
      this.logger.log(
        `discord./upload-file from=${discordUserId} userId=${account.id} gifId=${gif.id} sourceBytes=${downloaded.length} storedBytes=${gifBuffer.length}`,
      );
    } catch (err) {
      const message = (err as Error).message ?? "Upload failed.";
      await interaction.editReply({
        content: `Upload failed: ${truncate(message, 200)}`,
      });
    }
  }

  // ─── /help ─────────────────────────────────────────────────────────

  private async onHelp(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const webOrigin =
      this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
    const lines = [
      "**vidsandgifs bot — commands**",
      "",
      "`/gif query:<…>` — search and post a GIF (autocompletes as you type)",
      "`/link code:<…>` — connect your account (get the code at " +
        `${webOrigin}/settings)`,
      "`/unlink` — disconnect your account",
      "`/folder list` — list your folders",
      "`/folder use name:<…>` — scope `/gif` to one folder",
      "`/folder clear` — clear the active folder",
      "`/upload url:<…> title:<…> tags:<…>` — upload a GIF from a URL",
      "`/upload-file file:<…> title:<…> tags:<…>` — upload a GIF or video file",
      "",
      `Open the website: ${webOrigin}`,
    ];
    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}
