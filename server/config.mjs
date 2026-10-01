// Server-only configuration. Key shape selects transport, never user identity.
const legacyJWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function selectKey(env, modernName, legacyName, modernPattern) {
  // A present but invalid modern setting must not silently use an old key.
  if (Object.hasOwn(env, modernName))
    return typeof env[modernName] === "string" &&
      modernPattern.test(env[modernName])
      ? { value: env[modernName], kind: "modern" }
      : null;
  return typeof env[legacyName] === "string" && legacyJWT.test(env[legacyName])
    ? { value: env[legacyName], kind: "legacy" }
    : null;
}
export function resolveSupabaseConfig(env) {
  const publicKey = selectKey(
    env,
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    /^sb_publishable_[A-Za-z0-9_-]+$/,
  );
  const serverKey = selectKey(
    env,
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    /^sb_secret_[A-Za-z0-9_-]+$/,
  );
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL ?? "") ||
    !uuid.test(env.PILOT_OWNER_ID ?? "") ||
    !publicKey ||
    !serverKey
  )
    return null;
  return {
    url: env.SUPABASE_URL,
    ownerId: env.PILOT_OWNER_ID,
    anonKey: publicKey.value,
    serviceKey: serverKey.value,
    publicKeyKind: publicKey.kind,
    serverKeyKind: serverKey.kind,
  };
}
