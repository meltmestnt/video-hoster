import { Box, Flex } from "@radix-ui/themes";
import { ConfirmCard } from "@/components/ConfirmCard";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <Flex
      align="center"
      justify="center"
      style={{ minHeight: "100vh", padding: "24px" }}
    >
      <Box style={{ maxWidth: 420, width: "100%" }}>
        <ConfirmCard token={token ?? ""} />
      </Box>
    </Flex>
  );
}
