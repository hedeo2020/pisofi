import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 300;

function canonicalRequest({ method, path, body, timestamp, nonce }) {
  return [method.toUpperCase(), path, String(timestamp), nonce, body].join("\n");
}

export function signDeviceRequest(request) {
  return createHmac("sha256", request.secret)
    .update(canonicalRequest(request))
    .digest("hex");
}

export function verifyDeviceRequest(request) {
  if (!Number.isSafeInteger(request.timestamp) || Math.abs(request.nowSeconds - request.timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return false;
  }
  if (typeof request.nonce !== "string" || request.nonce.length < 1 || typeof request.signature !== "string") {
    return false;
  }

  const expected = Buffer.from(signDeviceRequest(request), "hex");
  const actual = Buffer.from(request.signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
