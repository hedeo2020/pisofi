import test from "node:test";
import assert from "node:assert/strict";

import { createApiServer } from "../src/http-api.js";
import { createMockPaymentGateway } from "../src/payment-gateway.js";
import { createInMemoryPlatform } from "../src/platform.js";

test("HTTP payment intent is completed only by a signed webhook", async () => {
  const gateway = createMockPaymentGateway({ webhookSecret: "http-test-webhook-secret-at-least-32" });
  const platform = createInMemoryPlatform({ paymentGateway: gateway });
  const tenant = platform.createTenant({ name: "Owner A" });
  const device = platform.enrollDevice({ tenantId: tenant.id, name: "Station A", pulseValue: 5 });
  const server = createApiServer({ platform });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const createdResponse = await fetch(baseUrl + "/api/v1/sim/payment-intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": tenant.id },
      body: JSON.stringify({ deviceId: device.id, method: "qrph", amount: 20, durationSeconds: 1800 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data;
    assert.equal(created.status, "pending");
    assert.equal(typeof created.qrCodeBody, "string");

    const webhook = gateway.successWebhook({ providerPaymentId: created.providerPaymentId });
    const webhookResponse = await fetch(baseUrl + "/api/v1/payment-webhooks/mock", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": webhook.signature },
      body: webhook.body,
    });
    assert.equal(webhookResponse.status, 200);
    const completed = (await webhookResponse.json()).data;
    assert.equal(completed.status, "paid");
    assert.equal(typeof completed.voucherCode, "string");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
