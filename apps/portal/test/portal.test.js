import test from "node:test";
import assert from "node:assert/strict";

import { createPortalServer } from "../src/main.js";

async function withServer(run) {
  const server = createPortalServer({ apiBaseUrl: "https://api.3dbpoint.com" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("portal root serves captive portal shell", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /PisoFi/);
    assert.match(html, /https:\/\/api\.3dbpoint\.com/);
    assert.match(html, /Buy access/);
  });
});

test("portal health endpoint reports ok", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", app: "pisofi-portal" });
  });
});
