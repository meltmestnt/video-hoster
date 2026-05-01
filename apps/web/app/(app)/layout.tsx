import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { TopBar } from "@/components/TopBar";
import { MiniPlayer } from "@/components/MiniPlayer";
import { UnverifiedBanner } from "@/components/UnverifiedBanner";
import { UnapprovedBanner } from "@/components/UnapprovedBanner";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { PendingUploadResumer } from "@/components/PendingUploadResumer";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { PushPromptBanner } from "@/components/PushPromptBanner";
import { Footer } from "@/components/Footer";
import { Box, Container, Flex } from "@radix-ui/themes";
import { AuthRequiredProvider } from "@/lib/auth-required";
import { UploadDialogProvider } from "@/lib/upload-dialog-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const signedIn = !!session?.user;

  let me: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServerTrpc>>["auth"]["me"]["query"]>
  > = null;
  if (signedIn) {
    const trpc = await getServerTrpc();
    me = await trpc.auth.me.query();
  }

  return (
    <AuthRequiredProvider signedIn={signedIn}>
      <UploadDialogProvider signedIn={signedIn}>
        <Flex
          direction="column"
          // Make the page a flex column at least as tall as the viewport so the
          // footer drops to the bottom even on near-empty pages, while the
          // <Box style={{ flex: 1 }}> below grows to fill the remaining space.
          style={{ minHeight: "100vh" }}
        >
          <TopBar
            signedIn={signedIn}
            userName={session?.user.name ?? null}
            userEmail={session?.user.email ?? null}
            avatarUrl={me?.avatarUrl ?? session?.user.image ?? null}
            videoCount={me?.videoCount ?? 0}
            verified={me?.status === "verified"}
            miniPlayerEnabled={me?.miniPlayerEnabled ?? true}
            isAdmin={me?.role === "admin"}
          />
          {signedIn && (
            <UnverifiedBanner initialStatus={me?.status ?? null} />
          )}
          {signedIn && (
            <UnapprovedBanner
              initialStatus={me?.status ?? null}
              initialApproved={me?.approved ?? null}
              initialRole={me?.role ?? null}
            />
          )}
          <Box style={{ flex: 1 }}>
            <Container size="4" px="4" py="6">
              {children}
            </Container>
          </Box>
          <Footer />
        </Flex>
        {signedIn && <MiniPlayer />}
        <DropZoneOverlay signedIn={signedIn} />
        {signedIn && <PendingUploadResumer />}
        {signedIn && <PushPromptBanner />}
        {!signedIn && (
          <GoogleOneTap clientId={process.env.GOOGLE_CLIENT_ID ?? ""} />
        )}
      </UploadDialogProvider>
    </AuthRequiredProvider>
  );
}
