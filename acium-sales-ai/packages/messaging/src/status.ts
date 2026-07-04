import type { OutboxStatus } from "@acium/shared";

export function mapMetaDeliveryStatus(status: string): OutboxStatus {
  if (status === "sent") return "sent";
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "failed") return "failed";
  return "sending";
}
