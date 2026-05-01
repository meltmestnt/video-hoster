import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [UsersModule],
  providers: [RemindersService],
})
export class RemindersModule {}
