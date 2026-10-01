import { createAPI } from "../server/api.mjs";
import { SupabaseAuth } from "../server/auth.mjs";
import { SupabaseStore } from "../server/store.mjs";
const {
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  PILOT_OWNER_ID: ownerId,
} = process.env;
const configured =
  url &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
  anonKey &&
  serviceKey &&
  /^[0-9a-f-]{36}$/i.test(ownerId ?? "");
const config = { url, anonKey, serviceKey };
const handler = createAPI({
  store: configured ? new SupabaseStore(config) : null,
  auth: configured ? new SupabaseAuth(config) : null,
  allowedOwners: configured ? [ownerId] : [],
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
