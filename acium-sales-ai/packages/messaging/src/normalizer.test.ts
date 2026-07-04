import { describe, expect, it } from "vitest";
import { normalizeMetaPayload } from "./normalizer";

describe("normalizeMetaPayload", () => {
  it("normalizes WhatsApp text messages", () => {
    const messages = normalizeMetaPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-1" },
                contacts: [{ wa_id: "5592999999999", profile: { name: "Cliente" } }],
                messages: [{ id: "wamid.1", from: "5592999999999", timestamp: "1783180800", type: "text", text: { body: "Ola" } }]
              }
            }
          ]
        }
      ]
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: "whatsapp",
      externalMessageId: "wamid.1",
      customerChannelId: "5592999999999",
      text: "Ola",
      normalizedText: "ola",
      messageType: "text"
    });
  });

  it("normalizes Instagram messages", () => {
    const messages = normalizeMetaPayload({
      object: "instagram",
      entry: [{ id: "ig-1", messaging: [{ sender: { id: "cust-1" }, recipient: { id: "ig-1" }, message: { mid: "mid-1", text: "Preco?" } }] }]
    });

    expect(messages[0]).toMatchObject({ source: "instagram", externalMessageId: "mid-1", normalizedText: "preco?" });
  });

  it("normalizes Facebook messages", () => {
    const messages = normalizeMetaPayload({
      object: "page",
      entry: [{ id: "page-1", messaging: [{ sender: { id: "cust-1" }, recipient: { id: "page-1" }, message: { mid: "mid-2", text: "Oi" } }] }]
    });

    expect(messages[0]).toMatchObject({ source: "facebook", externalMessageId: "mid-2", normalizedText: "oi" });
  });
});
