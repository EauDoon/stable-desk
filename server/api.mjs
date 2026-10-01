import { readFile } from "node:fs/promises";
import { prepareDataset } from "../src/workspace.js";
import {
  applyPilot,
  initialPilot,
  PilotError,
  requireThat,
  weeklyBrief,
  hash,
  WATCH,
} from "./pilot-model.mjs";
import { collect } from "./collector.mjs";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
export function createAPI({
  store,
  auth,
  fixture = false,
  collector = collect,
  allowedOwners = [],
}) {
  return async function api(request) {
    const url = new URL(request.url),
      secure = url.protocol === "https:",
      cookieName = secure
        ? "__Host-stable-desk-session"
        : "stable-desk-fixture-session";
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    const cookie = (token = "", age = 0) => {
      headers["Set-Cookie"] =
        `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
    };
    try {
      const route = url.searchParams.get("action") ?? "state";
      if (route === "status" && request.method === "GET")
        return reply({
          configured: Boolean(store && auth),
          fixture,
          source: WATCH,
          schedules: false,
        });
      requireThat(
        store && auth,
        "Hosted v3 is not provisioned. Local v2 remains available; no shared persistence is claimed.",
        503,
      );
      requireThat(
        secure || fixture,
        "HTTPS is required for hosted sign-in.",
        400,
      );
      const isWrite = request.method === "POST";
      requireThat(
        ["GET", "POST"].includes(request.method),
        "Unsupported method.",
        405,
      );
      if (isWrite) {
        requireThat(
          request.headers.get("origin") === url.origin &&
            request.headers.get("content-type")?.split(";")[0] ===
              "application/json",
          "Same-origin JSON request required.",
          403,
        );
        requireThat(
          request.headers.get("sec-fetch-site") !== "cross-site",
          "Cross-site request rejected.",
          403,
        );
      }
      let input = {};
      if (isWrite) {
        const text = await request.text();
        requireThat(
          Buffer.byteLength(text) <= 4 * 1024 * 1024,
          "Request exceeds 4 MB.",
          413,
        );
        try {
          input = JSON.parse(text);
        } catch {
          throw new PilotError("Malformed JSON.");
        }
      }
      if (route === "login" && isWrite) {
        requireThat(
          typeof input.email === "string" &&
            input.email.length <= 254 &&
            typeof input.password === "string" &&
            input.password.length <= 1024,
          "Sign-in fields required.",
        );
        const session = await auth.login(input.email, input.password);
        requireThat(
          fixture || allowedOwners.includes(session.user.id),
          "Account is outside the approved pilot.",
          403,
        );
        cookie(session.token, session.expiresIn);
        return reply({ user: session.user, fixture });
      }
      const pairs = (request.headers.get("cookie") ?? "")
        .split(";")
        .map((s) => s.trim().split("="));
      let token;
      try {
        token = decodeURIComponent(
          pairs.find(([k]) => k === cookieName)?.[1] ?? "",
        );
      } catch {
        throw new PilotError("Invalid session cookie.", 401);
      }
      if (route === "logout" && isWrite) {
        try {
          await auth.logout(token);
        } finally {
          cookie();
        }
        return reply({ signedOut: true });
      }
      const user = await auth.user(token); // Verified provider request; never trust a decoded JWT or client owner.
      requireThat(
        fixture || allowedOwners.includes(user.id),
        "Account is outside the approved pilot.",
        403,
      );
      requireThat(
        !input.owner && !url.searchParams.has("owner"),
        "Workspace identity is determined by the verified session.",
        403,
      );
      let current = await store.read(user.id);
      if (route === "state" && !isWrite)
        return reply({ user, pilot: current, fixture });
      if (route === "recovery" && !isWrite) {
        const version = url.searchParams.get("version");
        return reply(
          version === null
            ? { versions: await store.backups(user.id) }
            : { pilot: await store.recovery(user.id, Number(version)) },
        );
      }
      if (route === "init" && isWrite) {
        const created = initialPilot(seed, input.imported ?? null);
        created.creation = {
          at: new Date().toISOString(),
          actor: `user:${user.id}`,
          importHash: input.imported
            ? hash(input.imported)
            : "repository-baseline",
          legacyReviewerLabelsAuthenticated: false,
        };
        if (current) {
          requireThat(
            current.version === 0 &&
              current.creation?.importHash === created.creation.importHash,
            "Shared workspace already exists. Import never overwrites it.",
            409,
          );
          return reply({ pilot: current, duplicate: true });
        }
        current = await store.write(user.id, -1, created);
        return reply({ pilot: current });
      }
      requireThat(
        current,
        "Create or explicitly import a shared workspace first.",
        409,
      );
      if (route === "brief" && !isWrite)
        return reply({ markdown: weeklyBrief(current) });
      requireThat(route === "operate" && isWrite, "Unknown API route.", 404);
      // Collection results and timestamps can only originate at the server.
      requireThat(
        !input.capture && !input.at && !input.actor,
        "Server-owned collection/reviewer fields cannot be supplied.",
      );
      if (input.type === "check") {
        const prior = current.journal.find((e) => e.opId === input.opId);
        if (prior) {
          requireThat(
            prior.requestHash === hash(input),
            "Operation ID reused with changed intent.",
            409,
          );
          return reply({ pilot: current, duplicate: true });
        }
        requireThat(
          input.expectedVersion === current.version,
          "Source check draft is stale. Reload latest.",
          409,
        );
        const last = current.checks.at(-1);
        requireThat(
          !last || Date.now() - Date.parse(last.at) >= (fixture ? 0 : 60000),
          "Bounded pilot: wait at least one minute between source checks.",
          429,
        );
        const capture = await collector();
        const result = applyPilot(
          current,
          { ...input, capture },
          `user:${user.id}`,
        );
        // Retry binding includes the public request separately from server-derived content.
        const event = result.state.journal.at(-1);
        event.requestHash = hash(input);
        const { eventHash, ...body } = event;
        event.eventHash = hash(body);
        return reply({
          pilot: await store.write(user.id, current.version, result.state),
          duplicate: false,
        });
      }
      const result = applyPilot(current, input, `user:${user.id}`);
      return reply({
        pilot: result.duplicate
          ? current
          : await store.write(user.id, current.version, result.state),
        duplicate: result.duplicate,
      });
    } catch (error) {
      if (error.status === 401) cookie();
      return reply(
        {
          error:
            error instanceof PilotError ||
            (error instanceof Error &&
              /revision|Workspace|Invalid|review|Operation|Synthetic|source|conflict/i.test(
                error.message,
              ))
              ? error.message
              : "Request failed; no successful save is claimed. Reload to reconcile before retrying.",
        },
        error.status ?? 400,
      );
    }
  };
}
