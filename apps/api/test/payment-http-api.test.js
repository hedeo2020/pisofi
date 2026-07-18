import test from "node:test";
import assert from "node:assert/strict";

import { createApiServer } from "../src/http-api.js";
import { createMockPaymentGateway } from "../src/payment-gateway.js";
import { createInMemoryPlatform } from "../src/platform.js";

const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720,
  1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
  6668, 6669, 6679, 6697, 10080,
]);

async function listenOnFetchablePort(server) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    if (!FETCH_BLOCKED_PORTS.has(port)) return port;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  throw new Error("could not find a fetch-compatible test port");
}

test("HTTP payment intent is completed only by a signed webhook", async () => {
  const gateway = createMockPaymentGateway({ webhookSecret: "http-test-webhook-secret-at-least-32" });
  const platform = createInMemoryPlatform({ paymentGateway: gateway });
  const tenant = platform.createTenant({ name: "Owner A" });
  const device = platform.enrollDevice({ tenantId: tenant.id, name: "Station A", pulseValue: 5 });
  const server = createApiServer({ platform });
  const port = await listenOnFetchablePort(server);
  const baseUrl = `http://127.0.0.1:${port}`;

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

test("public payment intent can be created from device ID only", async () => {
  const gateway = createMockPaymentGateway({ webhookSecret: "http-test-webhook-secret-at-least-32" });
  const platform = createInMemoryPlatform({ paymentGateway: gateway });
  const tenant = platform.createTenant({ name: "Owner A" });
  const device = platform.enrollDevice({ tenantId: tenant.id, name: "Station A", pulseValue: 5 });
  const server = createApiServer({ platform });
  const port = await listenOnFetchablePort(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(baseUrl + "/api/v1/public/payment-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: device.id, method: "qrph", amount: 20, durationSeconds: 1800 }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()).data;
    assert.equal(created.deviceId, device.id);
    assert.equal(created.status, "pending");
    assert.equal(typeof created.qrCodeBody, "string");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
