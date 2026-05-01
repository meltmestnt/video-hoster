import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PushSubscription } from "./push-subscription.entity";
import { PushService } from "./push.service";

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
