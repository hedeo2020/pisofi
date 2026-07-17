import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

function signature(secret, body) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function secureEqualHex(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createMockPaymentGateway({ webhookSecret }) {
  if (typeof webhookSecret !== "string" || webhookSecret.length < 32) throw new Error("webhook secret must contain at least 32 characters");
  const payments = new Map();

  return {
    async createPayment({ reference, method, amount }) {
      const providerPaymentId = randomUUID();
      payments.set(providerPaymentId, { reference, method, amount });
      return {
        providerPaymentId,
        checkoutUrl: `https://mock-payments.invalid/${method}/${providerPaymentId}`,
        ...(method === "qrph" ? { qrCodeBody: `MOCK-QRPH:${providerPaymentId}` } : {}),
      };
    },

    verifyWebhook({ body, signature: receivedSignature }) {
      if (!secureEqualHex(signature(webhookSecret, body), receivedSignature)) throw new Error("invalid webhook signature");
      const event = JSON.parse(body);
      if (!payments.has(event.providerPaymentId)) throw new Error("payment not found");
      return event;
    },

    successWebhook({ providerPaymentId }) {
      const payment = payments.get(providerPaymentId);
      if (!payment) throw new Error("payment not found");
      const body = JSON.stringify({ eventId: randomUUID(), providerPaymentId, reference: payment.reference, status: "paid", amount: payment.amount });
      return { body, signature: signature(webhookSecret, body) };
    },
  };
}
