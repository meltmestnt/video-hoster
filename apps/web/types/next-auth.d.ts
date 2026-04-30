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
  }
}
