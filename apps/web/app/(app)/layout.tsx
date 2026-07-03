import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMe } from "@/lib/trpc-server";
import { TopBar } from "@/components/TopBar";
import { MiniPlayer } from "@/components/MiniPlayer";
import { UnverifiedBanner } from "@/components/UnverifiedBanner";
import { UnapprovedBanner } from "@/components/UnapprovedBanner";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { PendingUploadResumer } from "@/components/PendingUploadResumer";
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

  const me = signedIn ? await getMe() : null;

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
            gifCount={me?.gifCount ?? 0}
            telegramLinked={me?.telegramLinked ?? false}
            discordLinked={me?.discordLinked ?? false}
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
        {signedIn && (
          <MiniPlayer initialEnabled={me?.miniPlayerEnabled ?? true} />
        )}
        <DropZoneOverlay signedIn={signedIn} />
        {signedIn && <PendingUploadResumer />}
        {/* Bottom-right one-time prompt asking to enable browser
            notifications. Internally checks Web Push support, current
            permission state, and a localStorage dismissed flag, so it
            self-suppresses after the first interaction. */}
        {signedIn && <PushPromptBanner />}
      </UploadDialogProvider>
    </AuthRequiredProvider>
  );
}
