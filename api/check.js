import { createAPI } from "../server/api.mjs";
import { collect } from "../server/collector.mjs";
import { WATCH, REVIEW_MAX_EVENTS } from "../src/review-model.js";
// Stateless public function. It holds no state, needs no credentials and
// accepts no caller-supplied URL: it fetches exactly one allowlisted public
// page and returns bounded extracted text. The browser decides what to keep.
const api = createAPI({ collector: collect });
export default async function check(req, res) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") {
    res.writeHead(204, { Allow: "GET, POST" });
    return res.end();
  }
  if (!["GET", "POST"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, POST", ...headers });
    return res.end(
      JSON.stringify({ error: "Unsupported method." }),
    );
  }
  const response = await api(
    new Request(new URL(req.url, "https://localhost"), {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: "{}",
    }),
  );
  res.writeHead(response.status, headers);
  res.end(await response.text());
}
export const config = { source: WATCH, maxEvents: REVIEW_MAX_EVENTS };
