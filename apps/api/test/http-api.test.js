import test from "node:test";
import assert from "node:assert/strict";

import { createApiServer } from "../src/http-api.js";
import { signDeviceRequest } from "../src/device-auth.js";

async function withServer(run) {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function json(baseUrl, path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("health endpoint reports simulation mode", async () => {
  await withServer(async (baseUrl) => {
    const { response, body } = await json(baseUrl, "/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: "ok", mode: "simulation" });

    const alias = await json(baseUrl, "/health");
    assert.equal(alias.response.status, 200);
    assert.deepEqual(alias.body, { status: "ok", mode: "simulation" });
  });
});

test("root endpoint identifies the API", async () => {
  await withServer(async (baseUrl) => {
    const { response, body } = await json(baseUrl, "/");
    assert.equal(response.status, 200);
    assert.equal(body.name, "pisofi-api");
    assert.equal(body.status, "ok");
    assert.equal(body.health, "/healthz");
  });
});

test("HTTP API completes the simulated purchase flow", async () => {
  await withServer(async (baseUrl) => {
    const enrolled = await json(baseUrl, "/api/v1/sim/devices", {
      method: "POST",
      body: JSON.stringify({ name: "sim-kiosk", pulseValue: 5 }),
    });
    assert.equal(enrolled.response.status, 201);
    const deviceId = enrolled.body.data.id;

    const pulse = await json(baseUrl, `/api/v1/sim/devices/${deviceId}/coin-pulses`, {
      method: "POST",
      body: JSON.stringify({ eventId: "event-1", pulses: 2 }),
    });
    assert.equal(pulse.response.status, 202);

    const issued = await json(baseUrl, "/api/v1/sim/vouchers", {
      method: "POST",
      body: JSON.stringify({ deviceId, price: 10, durationSeconds: 300 }),
    });
    assert.equal(issued.response.status, 201);

    const redeemed = await json(baseUrl, `/api/v1/sim/vouchers/${issued.body.data.code}/redeem`, {
      method: "POST",
      body: JSON.stringify({ clientMac: "02:00:00:00:00:01" }),
    });
    assert.equal(redeemed.response.status, 201);
    assert.equal(redeemed.body.data.deviceId, deviceId);
  });
});

test("device event endpoint accepts signed heartbeat", async () => {
  await withServer(async (baseUrl) => {
    const secret = "orange-pi-device-secret-at-least-32-characters";
    const enrolled = await json(baseUrl, "/api/v1/sim/devices", {
      method: "POST",
      body: JSON.stringify({ name: "orange-pi-one-001", pulseValue: 5, deviceSecret: secret }),
    });
    assert.equal(enrolled.response.status, 201);
    const deviceId = enrolled.body.data.id;
    assert.equal(enrolled.body.data.deviceSecret, undefined);

    const path = "/api/v1/device-events";
    const body = JSON.stringify({ event: "heartbeat", agent: { os: "linux", arch: "arm" } });
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = "nonce-for-heartbeat-test";
    const signature = signDeviceRequest({ method: "POST", path, body, timestamp, nonce, secret });

    const eventResponse = await fetch(baseUrl + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": deviceId,
        "x-device-timestamp": String(timestamp),
        "x-device-nonce": nonce,
        "x-device-signature": signature,
      },
      body,
    });
    assert.equal(eventResponse.status, 202);
    const event = (await eventResponse.json()).data;
    assert.equal(event.accepted, true);
    assert.equal(event.deviceId, deviceId);
    assert.equal(event.event, "heartbeat");
  });
});

test("device event endpoint rejects forged heartbeat", async () => {
  await withServer(async (baseUrl) => {
    const enrolled = await json(baseUrl, "/api/v1/sim/devices", {
      method: "POST",
      body: JSON.stringify({
        name: "orange-pi-one-001",
        pulseValue: 5,
        deviceSecret: "orange-pi-device-secret-at-least-32-characters",
      }),
    });
    const response = await fetch(baseUrl + "/api/v1/device-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": enrolled.body.data.id,
        "x-device-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-device-nonce": "nonce-for-forged-test",
        "x-device-signature": "00",
      },
      body: JSON.stringify({ event: "heartbeat" }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthorized");
  });
});

test("signed coin pulse device event adds usable device credit", async () => {
  await withServer(async (baseUrl) => {
    const secret = "orange-pi-device-secret-at-least-32-characters";
    const enrolled = await json(baseUrl, "/api/v1/sim/devices", {
      method: "POST",
      body: JSON.stringify({ name: "orange-pi-one-001", pulseValue: 5, deviceSecret: secret }),
    });
    assert.equal(enrolled.response.status, 201);
    const deviceId = enrolled.body.data.id;

    const path = "/api/v1/device-events";
    const body = JSON.stringify({ event: "coin_pulse", eventId: "coin-event-1", pulses: 2 });
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = "nonce-for-coin-pulse-test";
    const signature = signDeviceRequest({ method: "POST", path, body, timestamp, nonce, secret });
    const pulseResponse = await fetch(baseUrl + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": deviceId,
        "x-device-timestamp": String(timestamp),
        "x-device-nonce": nonce,
        "x-device-signature": signature,
      },
      body,
    });
    assert.equal(pulseResponse.status, 202);
    assert.deepEqual((await pulseResponse.json()).data.coinCredit, { duplicate: false, balance: 10 });

    const voucher = await json(baseUrl, "/api/v1/sim/vouchers", {
      method: "POST",
      body: JSON.stringify({ deviceId, price: 10, durationSeconds: 300 }),
    });
    assert.equal(voucher.response.status, 201);
  });
});

test("API returns a stable validation error envelope", async () => {
  await withServer(async (baseUrl) => {
    const result = await json(baseUrl, "/api/v1/sim/devices", {
      method: "POST",
      body: JSON.stringify({ name: "", pulseValue: -1 }),
    });
    assert.equal(result.response.status, 422);
    assert.equal(result.body.error.code, "validation_error");
    assert.equal(typeof result.body.error.message, "string");
  });
});

test("API handles malformed JSON and unknown resources without internal details", async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(baseUrl + "/api/v1/sim/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 422);
    assert.equal((await malformed.json()).error.code, "validation_error");

    const missing = await json(baseUrl, "/api/v1/does-not-exist");
    assert.equal(missing.response.status, 404);
    assert.deepEqual(missing.body, { error: { code: "not_found", message: "Resource not found" } });
  });
});
