import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignUpForm } from "@/components/SignUpForm";
import { Box, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { Cross1Icon } from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";

export default async function SignUpPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");

  return (
    <Flex
      align="center"
      justify="center"
      style={{ minHeight: "100vh", padding: "24px", position: "relative" }}
    >
      <Tooltip content={<T k="auth.close" />}>
        <IconButton
          asChild
          variant="ghost"
          color="gray"
          size="3"
          style={{ position: "absolute", top: 16, right: 16 }}
        >
          <Link href="/" aria-label="Close">
            <Cross1Icon width="20" height="20" />
          </Link>
        </IconButton>
      </Tooltip>
      <Box style={{ maxWidth: 360, width: "100%" }}>
        <SignUpForm />
      </Box>
    </Flex>
  );
}
