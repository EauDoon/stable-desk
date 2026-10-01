import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { FixtureStore } from "../server/store.mjs";
import { FixtureAuth } from "../server/auth.mjs";
import { createAPI } from "../server/api.mjs";
const root = resolve(import.meta.dirname, ".."),
  port = Number(process.env.PILOT_FIXTURE_PORT ?? 4183);
const store = new FixtureStore(
  process.env.PILOT_FIXTURE_DB ?? "/tmp/stable-desk-v3-fixture.sqlite",
);
let checks = 0;
const collector = async () => ({
  outcome: "ok",
  status: 200,
  text: `Fixture official stablecoin page. This text is synthetic test input, not a market observation. Merchants in the test region can use the documented stablecoin payment method. Fixture revision ${++checks}.`,
});
const api = createAPI({
  store,
  auth: new FixtureAuth(),
  fixture: true,
  collector,
});
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".md": "text/plain",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/desk") {
      const chunks = [];
      let bytes = 0;
      for await (const part of req) {
        bytes += part.length;
        if (bytes > 4 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(part);
      }
      const result = await api(
        new Request(url, {
          method: req.method,
          headers: req.headers,
          body: req.method === "GET" ? undefined : Buffer.concat(chunks),
        }),
      );
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
      return;
    }
    let path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (
      (path !== root && !path.startsWith(root + sep)) ||
      url.pathname.includes("/.")
    )
      throw new Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    if (!types[extname(path)] || !["GET", "HEAD"].includes(req.method))
      throw new Error();
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)],
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `LOCAL FIXTURE ONLY: http://127.0.0.1:${port}/pilot.html. reader-a@example.invalid / fixture-only. Never deploy this server.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
