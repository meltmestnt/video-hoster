import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApplicationIntegrationType,
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { GifsService } from "../gifs/gifs.service";
import { MediaService } from "../media/media.service";
import { UsersService } from "../users/users.service";
import { FoldersService } from "../folders/folders.service";
import { DiscordLinkService } from "./discord-link.service";
import { DiscordPrefService } from "./discord-pref.service";

const AUTOCOMPLETE_MAX = 25;
const MAX_TITLE_LEN = 200;
const MAX_TAGS = 10;

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
   * Returns the link code + the install URL the website hands the
   * user. Returns null when the bot isn't configured so the UI can
   * hide the connect button.
   */
  buildStartLink(
    userId: string,
  ): { code: string; inviteUrl: string | null; clientId: string } | null {
    if (!this.client || !this.clientId) return null;
    const code = this.links.issueLinkToken(userId);
    const inviteUrl = this.buildInviteUrl();
    return { code, inviteUrl, clientId: this.clientId };
  }

  /**
   * Build the OAuth2 install URL with the right scopes + permissions
   * for both guild + user-install flows. The `applications.commands`
   * scope is the only one we need — we run on Gateway events with
   * application commands; no message-content or member intents.
   */
  private buildInviteUrl(): string | null {
    if (!this.clientId) return null;
    const scopes = ["applications.commands", "bot"].join("%20");
    // 0 permissions — we only post via interaction replies, which don't
    // require channel-level perms beyond what the slash-command framing
    // grants. Keeps the install dialog uncluttered with checkboxes the
    // user shouldn't have to evaluate.
    return `https://discord.com/oauth2/authorize?client_id=${this.clientId}&permissions=0&scope=${scopes}`;
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

    return [gif, link, unlink, folder, upload].map((c) => c.toJSON());
  }

  // ─── Dispatch ──────────────────────────────────────────────────────

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      await this.onAutocomplete(interaction);
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
    // Autocomplete handed us the gif id as the option value; if the
    // user typed something free-form and submitted before picking a
    // suggestion, the value will be that string and we have to fall
    // back to a search-and-pick-the-first-match path so the command
    // still produces a sensible result instead of erroring out.
    const queryOrId = interaction.options.getString("query", true);
    const discordUserId = interaction.user.id;
    let gifId: string | null = null;
    if (isUuid(queryOrId)) {
      gifId = queryOrId;
    } else {
      const link = await this.links
        .findByDiscordUserId(discordUserId)
        .catch(() => null);
      let restrictToFolderId: string | null = null;
      if (link) {
        const folderId = await this.prefs
          .getActiveFolderId(discordUserId)
          .catch(() => null);
        if (folderId) {
          try {
            const f = await this.folders.findOwned(folderId, link.userId);
            restrictToFolderId = f.id;
          } catch {
            // Stale active-folder pref — fall back to public search.
          }
        }
      }
      const items = await this.gifs.searchInlineForBot({
        q: queryOrId,
        limit: 1,
        restrictToFolderId,
      });
      gifId = items[0]?.id ?? null;
    }
    if (!gifId) {
      await interaction.reply({
        content: `No GIFs matched **${truncate(queryOrId, 80)}**. Try a different search.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const url = await this.media.signUrl({ kind: "mpeg4", id: gifId });
    if (!url) {
      await interaction.reply({
        content: "That GIF isn't available right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Discord auto-embeds video URLs as inline players, so the cleanest
    // post is just the URL — no embed object, no attachment fetch on
    // our side. Discordbot's UA is on our hotlink allow-list so the
    // initial fetch + Discord-CDN cache works without auth headers.
    await interaction.reply({ content: url });
    this.logger.log(
      `discord./gif from=${discordUserId} gifId=${gifId} q="${truncate(queryOrId, 60)}"`,
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
