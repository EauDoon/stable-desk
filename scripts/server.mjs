import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, sep } from "node:path";
import { createCheckHandler } from "../server/http.mjs";
import { collect } from "../server/collector.mjs";
// The dev/preview server exposes the same bounded source check the hosted
// function provides, so the review flow is testable without a deployment.
const checkAPI = createCheckHandler({ collector: collect });
const root = await realpath(resolve(
  import.meta.dirname,
  "..",
  process.argv.includes("--dist") ? "dist" : ".",
));
const portFlag = process.argv.indexOf("--port");
const port = portFlag === -1 ? 4173 : Number(process.argv[portFlag + 1]);
const hostFlag = process.argv.indexOf("--host");
const host = hostFlag === -1 ? "127.0.0.1" : process.argv[hostFlag + 1];
const publicBind = host === "0.0.0.0" || host === "::";
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
    const authority = req.headers.host?.toLowerCase();
    const hosts = ["127.0.0.1", "localhost", "::1"].includes(host)
      ? ["127.0.0.1", "localhost", "[::1]"] : [host];
    const allowed = hosts.flatMap((name) => [
      `${name}:${server.address().port}`,
      ...(server.address().port === 80 ? [name] : []),
    ]);
    if (!authority || (!publicBind && !allowed.includes(authority))) {
      res.writeHead(403);
      return res.end("Host not allowed");
    }
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path.includes("\\") || path.split("/").some((part) => part.startsWith(".")))
      throw new Error("Hidden or invalid path");
    if (path === "/api/check") {
      if (req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && req.headers.origin !== `http://${authority}` &&
           !(publicBind && req.headers.origin === `https://${authority}`))) {
        res.writeHead(403);
        return res.end("Origin not allowed");
      }
      return await checkAPI(req, res);
    }
    let file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep))
      throw new Error("Outside root");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    file = await realpath(file);
    const local = relative(root, file);
    if (isAbsolute(local) || local.split(sep).some((part) => part.startsWith(".")))
      throw new Error("Outside public root");
    if (
      !["GET", "HEAD"].includes(req.method) ||
      !types[extname(file)]
    )
      throw new Error("Unsupported");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": `${types[extname(file)]}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, host, () =>
  console.log(`Stable Desk: http://${host}:${server.address().port} (${root})`),
);
