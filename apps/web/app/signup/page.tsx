import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignUpForm } from "@/components/SignUpForm";
import { Box, Flex } from "@radix-ui/themes";

export default async function SignUpPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");

  return (
    <Flex
      align="center"
      justify="center"
      style={{ minHeight: "100vh", padding: "24px" }}
    >
      <Box style={{ maxWidth: 360, width: "100%" }}>
        <SignUpForm />
      </Box>
    </Flex>
  );
}
