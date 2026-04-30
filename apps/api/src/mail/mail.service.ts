import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import nodemailer, { type Transporter } from "nodemailer";

type Transport =
  | { kind: "smtp"; mailer: Transporter }
  | { kind: "ses"; client: SESv2Client };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transport;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.fromAddress = config.getOrThrow<string>("MAIL_FROM");
    const kind = (
      config.get<string>("MAIL_TRANSPORT") ?? "ses"
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
    } else {
      throw new Error(
        `Unknown MAIL_TRANSPORT: ${kind}. Use "smtp" or "ses".`,
      );
    }
    this.logger.log(`Mail transport: ${this.transport.kind}`);
  }

  async sendConfirmation(toEmail: string, link: string): Promise<void> {
    const subject = "Confirm your account on Video Hoster";
    const html = `<p>Confirm your account by clicking the link below:</p>
<p><a href="${link}">${link}</a></p>`;
    const text = `Confirm your account by visiting:\n${link}\n`;

    if (this.transport.kind === "smtp") {
      await this.transport.mailer.sendMail({
        from: this.fromAddress,
        to: toEmail,
        subject,
        html,
        text,
      });
    } else {
      await this.transport.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.fromAddress,
          Destination: { ToAddresses: [toEmail] },
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
    }
    this.logger.log(`Sent confirmation email to ${toEmail}`);
  }
}
