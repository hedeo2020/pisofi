import { createApiServer } from "../../api/src/http-api.js";
import { createMockPaymentGateway } from "../../api/src/payment-gateway.js";
import { createInMemoryPlatform } from "../../api/src/platform.js";

const gateway = createMockPaymentGateway({ webhookSecret: "local-simulator-webhook-secret-32-bytes" });
const platform = createInMemoryPlatform({ paymentGateway: gateway });
const tenant = platform.createTenant({ name: "Simulated multi-tenant owner" });
const server = createApiServer({ platform });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function post(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${payload.error?.message ?? "request failed"}`);
  return payload.data;
}

try {
  const device = await post("/api/v1/sim/devices", { tenantId: tenant.id, name: "orange-pi-simulator", pulseValue: 5 });
  await post(`/api/v1/sim/devices/${device.id}/coin-pulses`, { eventId: "coin-event-001", pulses: 2 });
  const voucher = await post("/api/v1/sim/vouchers", { deviceId: device.id, price: 10, durationSeconds: 900 });
  const session = await post(`/api/v1/sim/vouchers/${voucher.code}/redeem`, { clientMac: "02:00:00:00:00:01" });
  const digitalPayments = [];
  for (const method of ["gcash", "maya", "qrph"]) {
    const response = await fetch(baseUrl + "/api/v1/sim/payment-intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": tenant.id },
      body: JSON.stringify({ deviceId: device.id, method, amount: 20, durationSeconds: 1800 }),
    });
    const payment = (await response.json()).data;
    const webhook = gateway.successWebhook({ providerPaymentId: payment.providerPaymentId });
    const callback = await fetch(baseUrl + "/api/v1/payment-webhooks/mock", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": webhook.signature },
      body: webhook.body,
    });
    digitalPayments.push((await callback.json()).data);
  }
  console.log(JSON.stringify({ status: "simulation_passed", tenant, device, coinVoucher: { code: voucher.code }, session, digitalPayments }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
