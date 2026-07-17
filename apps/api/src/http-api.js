import { createServer } from "node:http";
import { createInMemoryPlatform } from "./platform.js";
import { verifyDeviceRequest } from "./device-auth.js";

const MAX_BODY_BYTES = 32 * 1024;

function send(response, status, payload, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request) {
  try {
    return JSON.parse(await readBody(request) || "{}");
  } catch {
    throw new Error("request body must be valid JSON");
  }
}

function routeParams(path, expression) {
  return expression.exec(path)?.groups ?? null;
}

function requireHeader(request, name) {
  const value = request.headers[name.toLowerCase()];
  if (typeof value !== "string" || value.length < 1) throw new Error(`${name} header is required`);
  return value;
}

export function createApiServer({ platform = createInMemoryPlatform() } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/") {
        return send(response, 200, {
          name: "pisofi-api",
          status: "ok",
          mode: "simulation",
          health: "/healthz",
          version: "v1",
        });
      }

      if (request.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/health")) {
        return send(response, 200, { status: "ok", mode: "simulation" });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/sim/devices") {
        const device = platform.enrollDevice(await readJson(request));
        return send(response, 201, { data: device }, { location: `/api/v1/sim/devices/${device.id}` });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/device-events") {
        const body = await readBody(request);
        const deviceId = requireHeader(request, "X-Device-ID");
        const timestamp = Number.parseInt(requireHeader(request, "X-Device-Timestamp"), 10);
        const nonce = requireHeader(request, "X-Device-Nonce");
        const signature = requireHeader(request, "X-Device-Signature");
        const secret = platform.getDeviceSecret(deviceId);
        const authorized = verifyDeviceRequest({
          method: request.method,
          path: url.pathname,
          body,
          timestamp,
          nonce,
          signature,
          secret,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        if (!authorized) return send(response, 401, { error: { code: "unauthorized", message: "Invalid device signature" } });
        const recorded = platform.recordDeviceEvent({ deviceId, event: JSON.parse(body || "{}") });
        return send(response, 202, { data: recorded });
      }

      const pulse = routeParams(url.pathname, /^\/api\/v1\/sim\/devices\/(?<deviceId>[^/]+)\/coin-pulses$/);
      if (request.method === "POST" && pulse) {
        const result = platform.recordCoinPulse({ deviceId: pulse.deviceId, ...await readJson(request) });
        return send(response, 202, { data: result });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/sim/vouchers") {
        const voucher = platform.issueVoucher(await readJson(request));
        return send(response, 201, { data: voucher }, { location: `/api/v1/sim/vouchers/${voucher.code}` });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/sim/payment-intents") {
        const tenantId = request.headers["x-tenant-id"];
        if (typeof tenantId !== "string") throw new Error("tenant header is required");
        const payment = await platform.createPaymentIntent({ tenantId, ...await readJson(request) });
        return send(response, 201, { data: payment }, { location: `/api/v1/sim/payment-intents/${payment.id}` });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/payment-webhooks/mock") {
        const signature = request.headers["x-webhook-signature"];
        const body = await readBody(request);
        const payment = await platform.processPaymentWebhook({ body, signature });
        return send(response, 200, { data: payment });
      }

      const redemption = routeParams(url.pathname, /^\/api\/v1\/sim\/vouchers\/(?<code>[^/]+)\/redeem$/);
      if (request.method === "POST" && redemption) {
        const session = platform.redeemVoucher({ code: redemption.code, ...await readJson(request) });
        return send(response, 201, { data: session }, { location: `/api/v1/sim/sessions/${session.id}` });
      }

      return send(response, 404, { error: { code: "not_found", message: "Resource not found" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status = /not found/i.test(message) ? 404 : /already redeemed/i.test(message) ? 409 : 422;
      const code = status === 404 ? "not_found" : status === 409 ? "conflict" : "validation_error";
      return send(response, status, { error: { code, message } });
    }
  });
}
