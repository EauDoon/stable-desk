import { Readable } from "node:stream";
import { createAPI } from "./api.mjs";

// Shared by the hosted function and local server: retain the original contract.
export function createCheckHandler(options) {
  const api = createAPI(options);
  return async (req, res) => {
    const method = req.method;
    if (!["GET", "POST"].includes(method)) {
      res.writeHead(405, { Allow: "GET, POST", "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return res.end(JSON.stringify({ error: "Unsupported method." }));
    }
    const body = method === "POST"
      ? req.body === undefined ? Readable.toWeb(req)
        : typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body
          : JSON.stringify(req.body)
      : undefined;
    const response = await api(new Request(new URL(req.url, "http://localhost"), {
      method, headers: req.headers, body, duplex: "half",
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  };
}
