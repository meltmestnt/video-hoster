import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

type Transport =
  | { kind: "smtp"; mailer: Transporter }
  | { kind: "ses"; client: SESv2Client }
  | { kind: "resend"; client: Resend };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transport;
  private readonly fromAddress: string;
  private readonly adminEmails: string[];

  constructor(private readonly config: ConfigService) {
    this.fromAddress = config.getOrThrow<string>("MAIL_FROM");
    this.adminEmails = (config.get<string>("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const kind = (
      config.get<string>("MAIL_TRANSPORT") ?? "resend"
    ).toLowerCase();

    if (kind === "smtp") {
      this.transport = {
        kind: "smtp",
        mailer: nodemailer.createTransport({
          host: config.getOrThrow<string>("SMTP_HOST"),
          port: Number(config.get<string>("SMTP_PORT") ?? 2525),
          auth: {
            user: config.getOrThrow<string>("SMTP_USER"),
            pass: config.getOrThrow<string>("SMTP_PASS"),
          },
        }),
      };
    } else if (kind === "ses") {
      this.transport = {
        kind: "ses",
        client: new SESv2Client({
          region: config.getOrThrow<string>("AWS_REGION"),
          credentials: {
            accessKeyId: config.getOrThrow<string>("AWS_ACCESS_KEY_ID"),
            secretAccessKey: config.getOrThrow<string>("AWS_SECRET_ACCESS_KEY"),
          },
        }),
      };
    } else if (kind === "resend") {
      this.transport = {
        kind: "resend",
        client: new Resend(config.getOrThrow<string>("RESEND_API_KEY")),
      };
    } else {
      throw new Error(
        `Unknown MAIL_TRANSPORT: ${kind}. Use "smtp", "ses", or "resend".`,
      );
    }
    this.logger.log(`Mail transport: ${this.transport.kind}`);
  }

  async sendConfirmation(toEmail: string, link: string): Promise<void> {
    const subject = "Confirm your account on vids&gifs";
    const { html, text } = renderEmail({
      preheader: "Confirm your email to unlock uploads, comments, and reactions.",
      heading: "Confirm your email",
      bodyHtml: `<p style="margin:0 0 12px;">Tap the button below to verify your email and finish setting up your vids&amp;gifs account.</p>`,
      bodyText:
        "Tap the link below to verify your email and finish setting up your vids&gifs account.",
      cta: { label: "Confirm email", url: link },
      footerNote: "Didn't sign up? You can ignore this email.",
    });

    await this.send([toEmail], subject, html, text);
    this.logger.log(`Sent confirmation email to ${toEmail}`);
  }

  /**
   * Reminder version of sendConfirmation, sent by the daily cron when a
   * user signed up but never clicked the link. Carries which attempt this
   * is so the copy can escalate ("first reminder" vs "last reminder").
   */
  async sendConfirmationReminder(args: {
    toEmail: string;
    link: string;
    attempt: number;
    maxAttempts: number;
  }): Promise<void> {
    const isLast = args.attempt >= args.maxAttempts;
    const subject = isLast
      ? "Last reminder: confirm your vids&gifs account"
      : "Reminder: confirm your vids&gifs account";
    const headingText = isLast
      ? "Last chance to confirm"
      : "Confirm your email";
    const introText = isLast
      ? "This is the last reminder we'll send. Without confirmation your account stays read-only — you can sign in and watch, but you can't upload, comment, or react."
      : "You signed up for vids&gifs but haven't confirmed your email yet. Until you do, your account is limited to watching.";
    const { html, text } = renderEmail({
      preheader: introText,
      heading: headingText,
      bodyHtml: `<p style="margin:0;">${escapeHtml(introText)}</p>`,
      bodyText: introText,
      cta: { label: "Confirm email", url: args.link },
      footerNote: "Didn't sign up? You can ignore these emails.",
    });

    await this.send([args.toEmail], subject, html, text);
    this.logger.log(
      `Sent confirmation reminder ${args.attempt}/${args.maxAttempts} to ${args.toEmail}`,
    );
  }

  /**
   * Tell a user that an admin manually verified their account. Fires
   * from adminVerifyUser when the status actually flips from
   * unverified → verified, so a re-verify on someone who already had
   * the badge doesn't double-mail. Copy mirrors the unlocks that
   * verification grants (uploads, comments, reactions) so the user
   * knows what changed.
   */
  async sendAccountVerifiedByAdmin(args: {
    toEmail: string;
    name: string;
    webOrigin: string;
  }): Promise<void> {
    const subject = "Your vids&gifs account is verified";
    const intro =
      "An admin just verified your vids&gifs account. You can now upload videos, GIFs, and screenshots, leave comments, and react — no email confirmation needed.";
    const { html, text } = renderEmail({
      preheader: "You're verified — uploads, comments, and reactions are open.",
      heading: `Welcome aboard, ${args.name}`,
      bodyHtml: `<p style="margin:0;">${escapeHtml(intro)}</p>`,
      bodyText: intro,
      cta: { label: "Open vids&gifs", url: args.webOrigin },
    });
    await this.send([args.toEmail], subject, html, text);
    this.logger.log(`Sent admin-verified email to ${args.toEmail}`);
  }

  /** Email every admin in ADMIN_EMAILS that a new user just signed up. */
  async notifyAdminsOfSignup(user: {
    name: string;
    email: string;
  }): Promise<void> {
    if (this.adminEmails.length === 0) return;
    const subject = `New sign-up: ${user.name}`;
    const safeName = escapeHtml(user.name);
    const safeEmail = escapeHtml(user.email);
    const { html, text } = renderEmail({
      preheader: `${user.name} (${user.email}) just signed up.`,
      heading: "New sign-up",
      bodyHtml: `${detailRowHtml("Name", safeName)}${detailRowHtml("Email", safeEmail)}`,
      bodyText: `Name: ${user.name}\nEmail: ${user.email}`,
    });
    await this.send(this.adminEmails, subject, html, text);
    this.logger.log(
      `Notified ${this.adminEmails.length} admin(s) of signup ${user.email}`,
    );
  }

  /** Email every admin that a user just published a video. */
  async notifyAdminsOfVideoUpload(args: {
    user: { name: string; email: string };
    video: { id: string; title: string; visibility: string };
  }): Promise<void> {
    if (this.adminEmails.length === 0) return;
    const origin = this.config.get<string>("WEB_ORIGIN") ?? "";
    const link = origin ? `${origin}/videos/${args.video.id}` : args.video.id;
    const subject = `New video: ${args.video.title}`;
    const safeTitle = escapeHtml(args.video.title);
    const safeName = escapeHtml(args.user.name);
    const safeEmail = escapeHtml(args.user.email);
    const safeVisibility = escapeHtml(args.video.visibility);
    const { html, text } = renderEmail({
      preheader: `${args.video.title} — by ${args.user.name}.`,
      heading: "New video uploaded",
      bodyHtml: `${detailRowHtml("Title", safeTitle)}${detailRowHtml(
        "By",
        `${safeName} (${safeEmail})`,
      )}${detailRowHtml("Visibility", safeVisibility)}`,
      bodyText: `Title: ${args.video.title}\nBy: ${args.user.name} (${args.user.email})\nVisibility: ${args.video.visibility}`,
      cta: link ? { label: "Open video", url: link } : undefined,
    });
    await this.send(this.adminEmails, subject, html, text);
    this.logger.log(
      `Notified ${this.adminEmails.length} admin(s) of video upload ${args.video.id}`,
    );
  }

  private async send(
    to: string[],
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    if (to.length === 0) return;
    const recipients = to.join(", ");
    this.logger.log(
      `→ mail send via ${this.transport.kind} from=${this.fromAddress} to=[${recipients}] subject="${subject}"`,
    );
    const startedAt = Date.now();
    try {
      if (this.transport.kind === "smtp") {
        await this.transport.mailer.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
          text,
        });
      } else if (this.transport.kind === "ses") {
        await this.transport.client.send(
          new SendEmailCommand({
            FromEmailAddress: this.fromAddress,
            Destination: { ToAddresses: to },
            Content: {
              Simple: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: {
                  Html: { Data: html, Charset: "UTF-8" },
                  Text: { Data: text, Charset: "UTF-8" },
                },
              },
            },
          }),
        );
      } else {
        const { error } = await this.transport.client.emails.send({
          from: this.fromAddress,
          to,
          subject,
          html,
          text,
        });
        if (error) {
          throw new Error(`Resend send failed: ${error.message}`);
        }
      }
      const ms = Date.now() - startedAt;
      this.logger.log(
        `✓ mail sent to=[${recipients}] subject="${subject}" (${ms}ms)`,
      );
    } catch (err) {
      const ms = Date.now() - startedAt;
      this.logger.error(
        `✗ mail send to=[${recipients}] subject="${subject}" failed after ${ms}ms: ${
          (err as Error).message
        }`,
      );
      throw err;
    }
  }
}

// User-supplied strings (name, email, title) land in HTML — sanitize before
// interpolating so a `<` or `"` in a name can't break out of the template.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Brand colours pulled from the Radix iris palette the webapp uses
// (Theme accentColor="iris"). Hex-coded here because email clients
// strip CSS variables and most don't honour @media queries reliably.
// Light-only — Gmail's dark-mode auto-invert handles night reading.
const BRAND = {
  bg: "#f4f4f6",
  card: "#ffffff",
  border: "#e8e8ec",
  hairline: "#ececf0",
  text: "#1a1a1f",
  muted: "#6e6e80",
  accent: "#5b5bd6", // iris-9 light
  accentInk: "#ffffff",
  font:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
} as const;

interface RenderedEmail {
  html: string;
  text: string;
}

interface RenderEmailArgs {
  // Inbox preview snippet (~100 chars). Hidden in the body but most
  // clients show it next to the subject in the inbox list.
  preheader: string;
  heading: string;
  // Pre-escaped HTML body content. The renderer does NOT escape this —
  // callers must run anything user-supplied through escapeHtml() first.
  bodyHtml: string;
  bodyText: string;
  // Optional primary action — rendered as a filled iris button. The text
  // version appends the URL after a dash so it's still actionable.
  cta?: { label: string; url: string };
  footerNote?: string;
}

/**
 * Wrap email content in the brand chrome shared across every mailer.
 * Layout is a single 480-wide centred card on a light gray page, with
 * a small "vids&gifs" wordmark at top, the heading, body, optional
 * CTA button, and a hairline-divided footer. Uses table-based layout
 * for Outlook/Yahoo compatibility and inline styles only — no CSS
 * variables, no @import, no media queries.
 */
function renderEmail(args: RenderEmailArgs): RenderedEmail {
  const safePreheader = escapeHtml(args.preheader);
  const safeHeading = escapeHtml(args.heading);
  const ctaBlock = args.cta
    ? `<tr>
            <td style="padding:20px 28px 0;">
              <a href="${escapeHtml(args.cta.url)}" style="display:inline-block;padding:11px 20px;background:${BRAND.accent};color:${BRAND.accentInk};text-decoration:none;border-radius:10px;font-size:14px;font-weight:500;letter-spacing:-0.005em;">${escapeHtml(args.cta.label)}</a>
            </td>
          </tr>`
    : "";
  const footer = args.footerNote ? `${escapeHtml(args.footerNote)}<br />` : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${safeHeading}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font};color:${BRAND.text};line-height:1.5;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${safePreheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;">
        <tr>
          <td style="padding:24px 28px 0;">
            <div style="font-size:13px;font-weight:600;letter-spacing:-0.005em;color:${BRAND.accent};">vids&amp;gifs</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px 0;">
            <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.015em;color:${BRAND.text};">${safeHeading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px 0;font-size:15px;color:${BRAND.text};">
            ${args.bodyHtml}
          </td>
        </tr>
        ${ctaBlock}
        <tr>
          <td style="padding:28px 28px 24px;">
            <hr style="border:0;border-top:1px solid ${BRAND.hairline};margin:0 0 14px;" />
            <div style="font-size:12px;color:${BRAND.muted};">
              ${footer}<a href="https://vidsandgifs.xyz" style="color:${BRAND.muted};text-decoration:underline;">vidsandgifs.xyz</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text mirrors the rendered structure: heading, body, CTA as
  // "Label: URL" line, footer note, then the bare site URL.
  const ctaText = args.cta ? `\n\n${args.cta.label}: ${args.cta.url}` : "";
  const footerText = args.footerNote ? `\n\n${args.footerNote}` : "";
  const text = `${args.heading}\n\n${args.bodyText}${ctaText}${footerText}\n\nvidsandgifs.xyz\n`;

  return { html, text };
}

/**
 * "Label: value" stack used in admin notification emails. Label is
 * muted, value picks up the body color. Caller is responsible for
 * escaping `value` (it goes in raw to allow inline `<a>`/`<br>`).
 */
function detailRowHtml(label: string, valueHtml: string): string {
  return `<div style="margin:0 0 6px;font-size:14px;line-height:1.45;"><span style="color:${BRAND.muted};">${escapeHtml(label)}:</span> <span style="color:${BRAND.text};">${valueHtml}</span></div>`;
}
