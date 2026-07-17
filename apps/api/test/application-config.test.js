import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationPlatform } from "../src/application-config.js";

test("simulation application requires an explicit webhook secret", () => {
  assert.throws(() => createApplicationPlatform({ APP_MODE: "simulation" }), /SIMULATION_WEBHOOK_SECRET/);
  assert.doesNotThrow(() => createApplicationPlatform({
    APP_MODE: "simulation",
    SIMULATION_WEBHOOK_SECRET: "configured-simulation-secret-32-bytes",
  }));
});

test("production mode stays disabled until durable adapters are configured", () => {
  assert.throws(() => createApplicationPlatform({ APP_MODE: "production" }), /production adapters are not configured/i);
});
