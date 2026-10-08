import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, sep } from "node:path";
import { parseArgs } from "node:util";
import { createCheckHandler } from "../server/http.mjs";
import { collect } from "../server/collector.mjs";
import { VERSION } from "../src/version.js";

const USAGE = `Usage: node scripts/server.mjs [--dist] [--host <address>] [--port <number>]

Serves the research desk and source review, with the same bounded
/api/check endpoint the hosted function provides.

  --dist            serve the built dist/ folder instead of the repository
  --host <address>  bind address (default 127.0.0.1); 0.0.0.0 or :: opens a
                    public preview that accepts its public host
  --port <number>   port from 0 to 65535 (default 4173; 0 picks a free port)
  -h, --help        print this help and exit
  -v, --version     print the version and exit`;

// Strict parsing: a missing value, an unknown flag or an invalid port or host
// prints the usage to stderr and exits 2 instead of crashing or silently
// binding every interface. stdout stays reserved for the startup line, which
// tests and the build smoke read first.
const usageError = (message) => ({ exit: 2, output: `${message}\n\n${USAGE}` });
function parseCli(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dist: { type: "boolean" },
        port: { type: "string" },
        host: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return usageError(error.message);
  }
  if (values.help) return { exit: 0, output: USAGE };
  if (values.version) return { exit: 0, output: `stable-desk ${VERSION}` };
  const port = values.port ?? "4173";
  if (!/^\d+$/.test(port) || Number(port) > 65535)
    return usageError(`Invalid --port "${port}": use a number from 0 to 65535.`);
  const host = values.host ?? "127.0.0.1";
  if (!host.trim())
    return usageError("Invalid --host: give an address such as 127.0.0.1.");
  return { dist: values.dist === true, port: Number(port), host };
}

// --help, --version and usage errors print, set the exit code and never listen.
const cli = parseCli(process.argv.slice(2));
if (cli.exit !== undefined) {
  (cli.exit === 0 ? console.log : console.error)(cli.output);
  process.exitCode = cli.exit;
}
const { dist = false, port = 4173, host = "127.0.0.1" } = cli;
// The dev/preview server exposes the same bounded source check the hosted
// function provides, so the review flow is testable without a deployment.
const checkAPI = createCheckHandler({ collector: collect });
const root = await realpath(resolve(
  import.meta.dirname,
  "..",
  dist ? "dist" : ".",
));
const publicBind = host === "0.0.0.0" || host === "::";
// vercel.json is the single source of the production security headers (CSP,
// framing, referrer, permissions). Static responses carry the same set, so
// every local and browser test runs under the policy production serves.
const vercel = JSON.parse(
  await readFile(resolve(import.meta.dirname, "..", "vercel.json"), "utf8"),
);
const securityHeaders = Object.fromEntries(
  (vercel.headers?.find((rule) => rule.source === "/(.*)")?.headers ?? []).map(
    ({ key, value }) => [key, value],
  ),
);
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
      ...securityHeaders,
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
if (cli.exit === undefined)
  server.listen(port, host, () =>
    console.log(`Stable Desk: http://${host}:${server.address().port} (${root})`),
  );
