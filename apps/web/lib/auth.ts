import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { SignJWT } from "jose";

const apiTokenSecret = () =>
  new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");

const apiUrl = () => process.env.NEST_URL ?? "http://localhost:4000";

const mintApiToken = async (params: {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  provider: "google" | "credentials";
}): Promise<string> =>
  new SignJWT({
    email: params.email,
    name: params.name,
    picture: params.picture ?? undefined,
    provider: params.provider,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(apiTokenSecret());

interface SignInResult {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

const verifyCredentialsViaApi = async (
  email: string,
  password: string,
): Promise<SignInResult | null> => {
  const res = await fetch(`${apiUrl()}/trpc/auth.signIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: { data?: SignInResult } };
  return json.result?.data ?? null;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await verifyCredentialsViaApi(
          credentials.email,
          credentials.password,
        );
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google" && profile) {
        const googleProfile = profile as {
          sub: string;
          email: string;
          name: string;
          picture?: string | null;
        };
        token.sub = googleProfile.sub;
        token.email = googleProfile.email;
        token.name = googleProfile.name;
        token.picture = googleProfile.picture ?? null;
        token.provider = "google";
      }
      if (account?.provider === "credentials" && user) {
        token.sub = user.id;
        token.email = user.email ?? "";
        token.name = user.name ?? "";
        token.picture = user.image ?? null;
        token.provider = "credentials";
      }

      const needsRefresh = !token.apiToken;
      if (needsRefresh && token.sub && token.email && token.name) {
        token.apiToken = await mintApiToken({
          sub: token.sub,
          email: token.email,
          name: token.name,
          picture: (token.picture as string | null | undefined) ?? null,
          provider: token.provider ?? "google",
        });
      }
      return token;
    },
    async session({ session, token }) {
      session.apiToken = token.apiToken ?? "";
      session.user = {
        id: token.sub ?? "",
        email: token.email ?? "",
        name: token.name ?? "",
        image: (token.picture as string | null | undefined) ?? null,
      };
      return session;
    },
  },
};
