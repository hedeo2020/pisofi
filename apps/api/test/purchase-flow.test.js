import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPlatform } from "../src/platform.js";

test("coin pulses can be exchanged for one redeemable timed voucher", () => {
  const platform = createInMemoryPlatform({ now: () => new Date("2026-07-17T00:00:00Z") });
  const device = platform.enrollDevice({ name: "kiosk-1", pulseValue: 5 });

  platform.recordCoinPulse({ deviceId: device.id, eventId: "pulse-1", pulses: 2 });
  const voucher = platform.issueVoucher({ deviceId: device.id, price: 10, durationSeconds: 900 });
  const session = platform.redeemVoucher({ code: voucher.code, clientMac: "02:00:00:00:00:01" });

  assert.equal(session.deviceId, device.id);
  assert.equal(session.clientMac, "02:00:00:00:00:01");
  assert.equal(session.expiresAt.toISOString(), "2026-07-17T00:15:00.000Z");
  assert.equal(platform.getBalance(device.id), 0);
  assert.throws(() => platform.redeemVoucher({ code: voucher.code, clientMac: "02:00:00:00:00:02" }), /already redeemed/i);
});

test("duplicate pulse events are idempotent", () => {
  const platform = createInMemoryPlatform();
  const device = platform.enrollDevice({ name: "kiosk-1", pulseValue: 5 });

  platform.recordCoinPulse({ deviceId: device.id, eventId: "same-event", pulses: 1 });
  platform.recordCoinPulse({ deviceId: device.id, eventId: "same-event", pulses: 1 });

  assert.equal(platform.getBalance(device.id), 5);
});

test("rejects overspending and invalid client MAC addresses", () => {
  const platform = createInMemoryPlatform();
  const device = platform.enrollDevice({ name: "kiosk-1", pulseValue: 1 });

  assert.throws(() => platform.issueVoucher({ deviceId: device.id, price: 5, durationSeconds: 60 }), /insufficient credit/i);
  platform.recordCoinPulse({ deviceId: device.id, eventId: "pulse-1", pulses: 5 });
  const voucher = platform.issueVoucher({ deviceId: device.id, price: 5, durationSeconds: 60 });
  assert.throws(() => platform.redeemVoucher({ code: voucher.code, clientMac: "not-a-mac" }), /invalid mac/i);
});
