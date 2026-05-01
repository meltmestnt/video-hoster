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
    const subject = "Confirm your account on Video Hoster";
    const html = `<p>Confirm your account by clicking the link below:</p>
<p><a href="${link}">${link}</a></p>`;
    const text = `Confirm your account by visiting:\n${link}\n`;

    await this.send([toEmail], subject, html, text);
    this.logger.log(`Sent confirmation email to ${toEmail}`);
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
    const html = `<p>A new user just signed up for Video Hoster.</p>
<p><strong>Name:</strong> ${safeName}<br/>
<strong>Email:</strong> ${safeEmail}</p>`;
    const text = `A new user just signed up for Video Hoster.\n\nName: ${user.name}\nEmail: ${user.email}\n`;
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
    const safeLink = escapeHtml(link);
    const html = `<p>A new video was uploaded to Video Hoster.</p>
<p><strong>Title:</strong> ${safeTitle}<br/>
<strong>By:</strong> ${safeName} (${safeEmail})<br/>
<strong>Visibility:</strong> ${safeVisibility}</p>
<p><a href="${safeLink}">${safeLink}</a></p>`;
    const text = `A new video was uploaded to Video Hoster.\n\nTitle: ${args.video.title}\nBy: ${args.user.name} (${args.user.email})\nVisibility: ${args.video.visibility}\n${link}\n`;
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
