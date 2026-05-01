"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Text,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import type { SubscriptionStatus } from "@repo/shared";

const STATUS_KEY: Record<
  SubscriptionStatus,
  | "billing.status.inactive"
  | "billing.status.trialing"
  | "billing.status.active"
  | "billing.status.past_due"
  | "billing.status.canceled"
> = {
  inactive: "billing.status.inactive",
  trialing: "billing.status.trialing",
  active: "billing.status.active",
  past_due: "billing.status.past_due",
  canceled: "billing.status.canceled",
};

const STATUS_COLOR: Record<
  SubscriptionStatus,
  "gray" | "iris" | "amber" | "green" | "red"
> = {
  inactive: "gray",
  trialing: "iris",
  active: "green",
  past_due: "amber",
  canceled: "red",
};

export function BillingPanel() {
  const t = useT();
  const params = useSearchParams();
  const checkoutResult = params.get("checkout");

  const me = trpc.billing.me.useQuery();
  const checkout = trpc.billing.createCheckoutSession.useMutation();
  const portal = trpc.billing.getPortalUrl.useMutation();
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setError(null);
    try {
      const res = await checkout.mutateAsync({ successPath: "/billing" });
      window.location.href = res.url;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openPortal = async () => {
    setError(null);
    try {
      const res = await portal.mutateAsync();
      window.location.href = res.url;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!me.data) return null;
  const tier = me.data.tier;
  const status = me.data.status;
  const isPro = tier === "pro";
  const periodEnd = me.data.periodEnd ? new Date(me.data.periodEnd) : null;
  // When the sub is canceled but still paid through the period, the period
  // end is when access actually expires; otherwise it's the next renewal.
  const periodLabel = status === "canceled" ? "billing.endsOn" : "billing.renews";

  return (
    <Card>
      <Flex direction="column" gap="3" p="3">
        {checkoutResult === "success" && (
          <Callout.Root color="green">
            <Callout.Text>{t("billing.success")}</Callout.Text>
          </Callout.Root>
        )}
        {checkoutResult === "cancel" && (
          <Callout.Root color="gray">
            <Callout.Text>{t("billing.canceled")}</Callout.Text>
          </Callout.Root>
        )}

        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Box>
            <Text size="1" color="gray" as="div">
              {t("billing.tier.label")}
            </Text>
            <Text size="5" weight="medium" as="div">
              {isPro ? t("billing.tier.pro") : t("billing.tier.free")}
            </Text>
          </Box>
          <Box>
            <Text size="1" color="gray" as="div">
              {t("billing.status.label")}
            </Text>
            <Badge color={STATUS_COLOR[status]} variant="soft" radius="full">
              {t(STATUS_KEY[status])}
            </Badge>
          </Box>
          {periodEnd && (status === "active" || status === "trialing" || status === "canceled") && (
            <Box>
              <Text size="1" color="gray" as="div">
                {t(periodLabel)}
              </Text>
              <Text size="2" as="div">
                {periodEnd.toLocaleDateString()}
              </Text>
            </Box>
          )}
        </Flex>

        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex gap="2" wrap="wrap">
          {!isPro && (
            <Button onClick={startCheckout} disabled={checkout.isPending}>
              {checkout.isPending
                ? t("billing.checkout.starting")
                : t("billing.upgrade")}
            </Button>
          )}
          {me.data.hasSubscription && (
            <Button
              onClick={openPortal}
              variant="soft"
              color="gray"
              disabled={portal.isPending}
            >
              {portal.isPending
                ? t("billing.portal.starting")
                : t("billing.manage")}
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
