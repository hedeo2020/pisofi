import { createMockPaymentGateway } from "./payment-gateway.js";
import { createInMemoryPlatform } from "./platform.js";

export function createApplicationPlatform(environment = process.env) {
  const mode = environment.APP_MODE ?? "simulation";
  if (mode !== "simulation") throw new Error("production adapters are not configured; refusing to start");
  const webhookSecret = environment.SIMULATION_WEBHOOK_SECRET;
  if (typeof webhookSecret !== "string" || webhookSecret.length < 32) {
    throw new Error("SIMULATION_WEBHOOK_SECRET must contain at least 32 characters");
  }
  return createInMemoryPlatform({ paymentGateway: createMockPaymentGateway({ webhookSecret }) });
}
