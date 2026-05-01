import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Subscription } from "./subscription.entity";
import { User } from "../users/user.entity";
import { SubscriptionsService } from "./subscriptions.service";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, User]), S3Module],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
