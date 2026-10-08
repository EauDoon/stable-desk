import { Readable } from "node:stream";
import { createAPI, STANDARD_HEADERS } from "./api.mjs";

const send = (res, status, body) => {
  res.writeHead(status, STANDARD_HEADERS);
  res.end(JSON.stringify(body));
};

// Shared by the hosted function and local server: retain the original contract.
// Every outcome, including a malformed body or an unexpected failure, answers
// JSON with the standard no-store and nosniff headers instead of letting the
// platform return its own 500 page.
export function createCheckHandler(options) {
  const api = createAPI(options);
  return async (req, res) => {
    try {
      const method = req.method;
      if (!["GET", "POST"].includes(method))
        return send(res, 405, { error: "Unsupported method." });
      let body;
      if (method === "POST") {
        let parsed;
        try {
          // Vercel's Node runtime parses JSON lazily and its getter throws on
          // a malformed body.
          parsed = req.body;
        } catch {
          return send(res, 400, { error: "JSON request required." });
        }
        body = parsed === undefined ? Readable.toWeb(req)
          : typeof parsed === "string" || Buffer.isBuffer(parsed) ? parsed
            : JSON.stringify(parsed);
      }
      const response = await api(new Request(new URL(req.url, "http://localhost"), {
        method, headers: req.headers, body, duplex: "half",
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      if (res.headersSent) return res.destroy?.();
      send(res, 500, { error: "Source check failed; coverage remains unresolved." });
    }
  };
}
