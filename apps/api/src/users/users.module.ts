import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UsersService } from "./users.service";
import { MailModule } from "../mail/mail.module";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule, S3Module],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
