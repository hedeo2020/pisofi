import { createApiServer } from "./http-api.js";
import { createApplicationPlatform } from "./application-config.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const server = createApiServer({ platform: createApplicationPlatform() });
server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "api_started", port, mode: "simulation" }));
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
