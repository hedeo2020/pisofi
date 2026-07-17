import test from "node:test";
import assert from "node:assert/strict";

import { createMockPaymentGateway } from "../src/payment-gateway.js";
import { createInMemoryPlatform } from "../src/platform.js";

function setup() {
  const gateway = createMockPaymentGateway({ webhookSecret: "mock-webhook-secret-at-least-32-bytes" });
  const platform = createInMemoryPlatform({ paymentGateway: gateway });
  const tenantA = platform.createTenant({ name: "Owner A" });
  const tenantB = platform.createTenant({ name: "Owner B" });
  const deviceA = platform.enrollDevice({ tenantId: tenantA.id, name: "Station A1", pulseValue: 5 });
  const deviceB = platform.enrollDevice({ tenantId: tenantB.id, name: "Station B1", pulseValue: 5 });
  return { gateway, platform, tenantA, tenantB, deviceA, deviceB };
}

test("tenant device listings never cross tenant boundaries", () => {
  const { platform, tenantA, tenantB, deviceA, deviceB } = setup();

  assert.deepEqual(platform.listDevices({ tenantId: tenantA.id }).map((device) => device.id), [deviceA.id]);
  assert.deepEqual(platform.listDevices({ tenantId: tenantB.id }).map((device) => device.id), [deviceB.id]);
  assert.throws(() => platform.getBalance(deviceA.id, { tenantId: tenantB.id }), /not found/i);
});

for (const method of ["gcash", "maya", "qrph"]) {
  test(`${method} payment grants a voucher only after a valid webhook`, async () => {
    const { gateway, platform, tenantA, deviceA } = setup();
    const payment = await platform.createPaymentIntent({
      tenantId: tenantA.id,
      deviceId: deviceA.id,
      method,
      amount: 20,
      durationSeconds: 1800,
    });

    assert.equal(payment.status, "pending");
    assert.equal(payment.voucherCode, undefined);
    assert.match(payment.checkoutUrl, /^https:\/\/mock-payments\.invalid\//);

    const webhook = gateway.successWebhook({ providerPaymentId: payment.providerPaymentId });
    const completed = await platform.processPaymentWebhook(webhook);
    assert.equal(completed.status, "paid");
    assert.equal(typeof completed.voucherCode, "string");

    const duplicate = await platform.processPaymentWebhook(webhook);
    assert.equal(duplicate.voucherCode, completed.voucherCode);
  });
}

test("rejects forged payment webhooks and tenant/device mismatches", async () => {
  const { gateway, platform, tenantA, deviceB } = setup();

  await assert.rejects(
    platform.createPaymentIntent({ tenantId: tenantA.id, deviceId: deviceB.id, method: "gcash", amount: 10, durationSeconds: 300 }),
    /device not found/i,
  );

  await assert.rejects(
    platform.processPaymentWebhook({ body: '{"status":"paid"}', signature: "forged" }),
    /invalid webhook signature/i,
  );
});
