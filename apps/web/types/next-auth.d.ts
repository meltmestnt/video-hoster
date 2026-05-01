import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    apiToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    apiToken?: string;
    sub?: string;
    picture?: string | null;
    email?: string;
    name?: string;
    provider?: "google" | "credentials";
    // The DB user UUID. Differs from `sub` for Google sign-ins (where sub is
    // Google's user id) — anything that compares ownership against API-shaped
    // user.id values needs this, not sub.
    userId?: string;
  }
}
