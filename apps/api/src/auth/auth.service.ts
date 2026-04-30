import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify } from "jose";
import type { AuthPayload } from "../users/users.service";

export type AuthProvider = "google" | "credentials";

export interface VerifiedToken extends AuthPayload {
  provider: AuthProvider;
}

@Injectable()
export class AuthService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService) {
    const raw = config.getOrThrow<string>("NEXTAUTH_SECRET");
    this.secret = new TextEncoder().encode(raw);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
      });
      const sub = payload.sub;
      const email = payload.email as string | undefined;
      const name = payload.name as string | undefined;
      const picture = (payload.picture as string | undefined) ?? null;
      const provider: AuthProvider =
        (payload.provider as string | undefined) === "credentials"
          ? "credentials"
          : "google";

      if (!sub || !email || !name) {
        throw new UnauthorizedException("Token missing required claims");
      }
      return { sub, email, name, picture, provider };
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid token: ${(err as Error).message}`,
      );
    }
  }
}
