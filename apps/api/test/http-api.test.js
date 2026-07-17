import test from "node:test";
import assert from "node:assert/strict";

import { createApiServer } from "../src/http-api.js";

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
