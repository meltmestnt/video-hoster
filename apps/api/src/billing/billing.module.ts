import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { ProcessedWebhookEvent } from "./processed-webhook-event.entity";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, ProcessedWebhookEvent])],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
