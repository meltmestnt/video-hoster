import { Global, Module } from "@nestjs/common";
import { LicenseService } from "./license.service";

/**
 * Marked @Global so any module can inject LicenseService without
 * having to import LicenseModule individually. The license is a
 * singleton process-wide concern (loaded once at boot) and is wanted
 * across MediaService, TelegramLinkService, DiscordLinkService —
 * making it global avoids cluttering every module's imports.
 */
@Global()
@Module({
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
