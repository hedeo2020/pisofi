import { createServer } from "node:http";

function html({ apiBaseUrl }) {
  const safeApiBaseUrl = JSON.stringify(apiBaseUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PisoFi Access</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #1f8cff 0, #07111f 42%, #030712 100%); color: #f8fafc; }
    main { width: min(92vw, 440px); padding: 28px; border: 1px solid rgba(255,255,255,.16); border-radius: 28px; background: rgba(3, 7, 18, .76); box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    h1 { margin: 0 0 8px; font-size: 34px; }
    p { color: #cbd5e1; line-height: 1.5; }
    label { display: block; margin: 16px 0 6px; color: #dbeafe; font-size: 14px; }
    input, select, button { box-sizing: border-box; width: 100%; border: 0; border-radius: 14px; padding: 14px 16px; font: inherit; }
    input, select { background: #0f172a; color: white; outline: 1px solid rgba(148,163,184,.35); }
    button { margin-top: 18px; background: #38bdf8; color: #00111f; font-weight: 800; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    pre { white-space: pre-wrap; background: #020617; border-radius: 14px; padding: 14px; color: #a7f3d0; overflow-wrap: anywhere; }
    .muted { font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <h1>PisoFi</h1>
    <p>Buy access with QRPH, GCash, Maya, or redeem a coin-generated voucher.</p>
    <form id="buy">
      <label for="deviceId">Device ID</label>
      <input id="deviceId" name="deviceId" placeholder="Orange Pi device ID" required>
      <label for="method">Payment method</label>
      <select id="method" name="method">
        <option value="qrph">QRPH</option>
        <option value="gcash">GCash</option>
        <option value="maya">Maya</option>
      </select>
      <label for="amount">Amount</label>
      <input id="amount" name="amount" type="number" min="1" value="10" required>
      <label for="durationSeconds">Duration</label>
      <select id="durationSeconds" name="durationSeconds">
        <option value="900">15 minutes</option>
        <option value="1800">30 minutes</option>
        <option value="3600">1 hour</option>
      </select>
      <button type="submit">Buy access</button>
    </form>
    <p class="muted">API: <span id="api"></span></p>
    <pre id="result" hidden></pre>
  </main>
  <script>
    const apiBaseUrl = ${safeApiBaseUrl};
    document.querySelector("#api").textContent = apiBaseUrl;
    document.querySelector("#buy").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      const result = document.querySelector("#result");
      button.disabled = true;
      result.hidden = false;
      result.textContent = "Creating payment intent...";
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        const response = await fetch(apiBaseUrl + "/api/v1/sim/payment-intents", {
          method: "POST",
          headers: { "content-type": "application/json", "x-tenant-id": "simulation" },
          body: JSON.stringify({
            deviceId: data.deviceId,
            method: data.method,
            amount: Number(data.amount),
            durationSeconds: Number(data.durationSeconds),
          }),
        });
        result.textContent = JSON.stringify(await response.json(), null, 2);
      } catch (error) {
        result.textContent = "Could not reach API: " + error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

export function createPortalServer({ apiBaseUrl = process.env.CUSTOMER_API_BASE_URL ?? "https://api.3dbpoint.com" } = {}) {
  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") {
      return send(response, 200, JSON.stringify({ status: "ok", app: "pisofi-portal" }), { "content-type": "application/json; charset=utf-8" });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return send(response, 200, html({ apiBaseUrl }), { "content-type": "text/html; charset=utf-8" });
    }
    return send(response, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  createPortalServer().listen(port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "portal_started", port }));
  });
}
