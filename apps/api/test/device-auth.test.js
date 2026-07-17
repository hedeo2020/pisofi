import test from "node:test";
import assert from "node:assert/strict";

import { signDeviceRequest, verifyDeviceRequest } from "../src/device-auth.js";

test("accepts a fresh correctly signed device request", () => {
  const request = { method: "POST", path: "/api/v1/device-events", body: '{"event":"heartbeat"}', timestamp: 1_752_710_400, nonce: "nonce-1" };
  const signature = signDeviceRequest({ ...request, secret: "test-device-secret-with-32-bytes" });

  assert.equal(verifyDeviceRequest({ ...request, secret: "test-device-secret-with-32-bytes", signature, nowSeconds: 1_752_710_430 }), true);
});

test("rejects stale or modified requests", () => {
  const request = { method: "POST", path: "/api/v1/device-events", body: "{}", timestamp: 1_752_710_400, nonce: "nonce-1" };
  const signature = signDeviceRequest({ ...request, secret: "test-device-secret-with-32-bytes" });

  assert.equal(verifyDeviceRequest({ ...request, body: "tampered", secret: "test-device-secret-with-32-bytes", signature, nowSeconds: 1_752_710_430 }), false);
  assert.equal(verifyDeviceRequest({ ...request, secret: "test-device-secret-with-32-bytes", signature, nowSeconds: 1_752_711_000 }), false);
  assert.equal(verifyDeviceRequest({ ...request, timestamp: "bad", secret: "test-device-secret-with-32-bytes", signature, nowSeconds: 1_752_710_430 }), false);
  assert.equal(verifyDeviceRequest({ ...request, nonce: "", secret: "test-device-secret-with-32-bytes", signature, nowSeconds: 1_752_710_430 }), false);
  assert.equal(verifyDeviceRequest({ ...request, secret: "test-device-secret-with-32-bytes", signature: "00", nowSeconds: 1_752_710_430 }), false);
});
