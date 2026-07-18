import { randomBytes, randomUUID } from "node:crypto";

const MAC_ADDRESS = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

export function createInMemoryPlatform({ now = () => new Date(), paymentGateway } = {}) {
  const tenants = new Map();
  const devices = new Map();
  const deviceEvents = new Map();
  const balances = new Map();
  const eventIds = new Set();
  const vouchers = new Map();
  const payments = new Map();
  const providerPaymentIndex = new Map();
  const defaultTenantId = randomUUID();
  tenants.set(defaultTenantId, { id: defaultTenantId, name: "Simulation tenant" });

  function requireTenant(tenantId) {
    const tenant = tenants.get(tenantId);
    if (!tenant) throw new Error("tenant not found");
    return tenant;
  }

  function requireDevice(deviceId, tenantId) {
    const device = devices.get(deviceId);
    if (!device || (tenantId && device.tenantId !== tenantId)) throw new Error("device not found");
    return device;
  }

  function newVoucher({ deviceId, price, durationSeconds }) {
    const voucher = {
      code: randomBytes(6).toString("base64url").toUpperCase(),
      deviceId,
      price,
      durationSeconds,
      redeemedAt: null,
    };
    vouchers.set(voucher.code, voucher);
    return voucher;
  }

  return {
    createTenant({ name }) {
      if (typeof name !== "string" || name.trim().length < 1) throw new Error("name is required");
      const tenant = { id: randomUUID(), name: name.trim() };
      tenants.set(tenant.id, tenant);
      return tenant;
    },

    enrollDevice({ tenantId = defaultTenantId, name, pulseValue, deviceSecret }) {
      requireTenant(tenantId);
      positiveInteger(pulseValue, "pulseValue");
      if (typeof name !== "string" || name.trim().length < 1) throw new Error("name is required");
      if (deviceSecret !== undefined && (typeof deviceSecret !== "string" || deviceSecret.length < 32)) {
        throw new Error("deviceSecret must be at least 32 characters");
      }
      const device = { id: randomUUID(), tenantId, name: name.trim(), pulseValue, deviceSecret };
      devices.set(device.id, device);
      balances.set(device.id, 0);
      const { deviceSecret: _, ...safeDevice } = device;
      return safeDevice;
    },

    getDeviceSecret(deviceId) {
      const device = requireDevice(deviceId);
      if (!device.deviceSecret) throw new Error("device secret is not configured");
      return device.deviceSecret;
    },

    recordDeviceEvent({ deviceId, event }) {
      const device = requireDevice(deviceId);
      if (!event || typeof event.event !== "string" || event.event.length < 1) throw new Error("event is required");
      let coinCredit;
      if (event.event === "coin_pulse") {
        positiveInteger(event.pulses, "pulses");
        if (typeof event.eventId !== "string" || event.eventId.length < 1) throw new Error("eventId is required");
        const idempotencyKey = `${deviceId}:${event.eventId}`;
        if (eventIds.has(idempotencyKey)) {
          coinCredit = { duplicate: true, balance: balances.get(deviceId) };
        } else {
          eventIds.add(idempotencyKey);
          balances.set(deviceId, balances.get(deviceId) + event.pulses * device.pulseValue);
          coinCredit = { duplicate: false, balance: balances.get(deviceId) };
        }
      }
      const stored = deviceEvents.get(deviceId) ?? [];
      const recorded = { ...event, receivedAt: now() };
      stored.push(recorded);
      deviceEvents.set(deviceId, stored);
      return { accepted: true, deviceId, event: event.event, receivedAt: recorded.receivedAt, ...(coinCredit ? { coinCredit } : {}) };
    },

    recordCoinPulse({ deviceId, eventId, pulses }) {
      const device = requireDevice(deviceId);
      positiveInteger(pulses, "pulses");
      if (typeof eventId !== "string" || eventId.length < 1) throw new Error("eventId is required");
      const idempotencyKey = `${deviceId}:${eventId}`;
      if (eventIds.has(idempotencyKey)) return { duplicate: true, balance: balances.get(deviceId) };
      eventIds.add(idempotencyKey);
      balances.set(deviceId, balances.get(deviceId) + pulses * device.pulseValue);
      return { duplicate: false, balance: balances.get(deviceId) };
    },

    issueVoucher({ deviceId, price, durationSeconds }) {
      requireDevice(deviceId);
      positiveInteger(price, "price");
      positiveInteger(durationSeconds, "durationSeconds");
      const balance = balances.get(deviceId);
      if (balance < price) throw new Error("insufficient credit");
      balances.set(deviceId, balance - price);
      return newVoucher({ deviceId, price, durationSeconds });
    },

    redeemVoucher({ code, clientMac }) {
      if (!MAC_ADDRESS.test(clientMac)) throw new Error("invalid MAC address");
      const voucher = vouchers.get(code);
      if (!voucher) throw new Error("voucher not found");
      if (voucher.redeemedAt) throw new Error("voucher already redeemed");
      const startedAt = now();
      voucher.redeemedAt = startedAt;
      return {
        id: randomUUID(),
        deviceId: voucher.deviceId,
        clientMac: clientMac.toLowerCase(),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + voucher.durationSeconds * 1000),
      };
    },

    getBalance(deviceId, { tenantId } = {}) {
      requireDevice(deviceId, tenantId);
      return balances.get(deviceId);
    },

    listDevices({ tenantId }) {
      requireTenant(tenantId);
      return [...devices.values()].filter((device) => device.tenantId === tenantId);
    },

    async createPaymentIntent({ tenantId, deviceId, method, amount, durationSeconds }) {
      requireTenant(tenantId);
      requireDevice(deviceId, tenantId);
      if (!paymentGateway) throw new Error("payment gateway is not configured");
      if (!["gcash", "maya", "qrph"].includes(method)) throw new Error("unsupported payment method");
      positiveInteger(amount, "amount");
      positiveInteger(durationSeconds, "durationSeconds");
      const id = randomUUID();
      const provider = await paymentGateway.createPayment({ reference: id, method, amount });
      const payment = { id, tenantId, deviceId, method, amount, durationSeconds, status: "pending", ...provider };
      payments.set(id, payment);
      providerPaymentIndex.set(provider.providerPaymentId, id);
      return { ...payment };
    },

    async processPaymentWebhook(webhook) {
      if (!paymentGateway) throw new Error("payment gateway is not configured");
      const event = paymentGateway.verifyWebhook(webhook);
      const paymentId = providerPaymentIndex.get(event.providerPaymentId);
      const payment = paymentId ? payments.get(paymentId) : null;
      if (!payment || payment.id !== event.reference || payment.amount !== event.amount) throw new Error("payment does not match");
      if (payment.status === "paid") return { ...payment };
      if (event.status !== "paid") throw new Error("payment was not successful");
      const voucher = newVoucher({ deviceId: payment.deviceId, price: payment.amount, durationSeconds: payment.durationSeconds });
      payment.status = "paid";
      payment.voucherCode = voucher.code;
      payment.paidAt = now();
      return { ...payment };
    },
  };
}
