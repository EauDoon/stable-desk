import { createAPI } from "../server/api.mjs";
import { SupabaseAuth } from "../server/auth.mjs";
import { SupabaseStore } from "../server/store.mjs";
import { resolveSupabaseConfig } from "../server/config.mjs";
const config = resolveSupabaseConfig(process.env);
const handler = createAPI({
  store: config ? new SupabaseStore(config) : null,
  auth: config ? new SupabaseAuth(config) : null,
  allowedOwners: config ? [config.ownerId] : [],
});
export default async function desk(req, res) {
  const protocol =
    req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const origin = `${protocol}://${req.headers.host}`;
  const body = ["GET", "HEAD"].includes(req.method)
    ? undefined
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
  const response = await handler(
    new Request(new URL(req.url, origin), {
      method: req.method,
      headers: req.headers,
      body,
    }),
  );
  res.statusCode = response.status;
  for (const [key, value] of response.headers) res.setHeader(key, value);
  res.end(await response.text());
}
