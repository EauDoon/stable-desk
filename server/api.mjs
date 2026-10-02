import {
  WATCH,
  REVIEW_MAX_EVENTS,
  ReviewError,
  requireThat,
} from "../src/review-model.js";

// The only server-side capability v4 keeps: a bounded fetch of one fixed public
// page. It accepts no URL, no redirect target and no credentials, so it is not
// a general-purpose proxy. All review state is held and validated in the
// browser against the same model used by the tests.
export function createAPI({ collector, now = Date.now }) {
  // Per warm process only. A deployment edge budget is still needed for public scale.
  let nextCheckAt = 0, inFlight = false;
  return async function api(request) {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Allow: "GET, POST",
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    try {
      const url = new URL(request.url);
      requireThat(
        ["GET", "POST"].includes(request.method),
        "Unsupported method.",
        405,
      );
      if (request.method === "POST") {
        requireThat(
          request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ===
            "application/json",
          "JSON request required.",
          415,
        );
        // The request body is ignored on purpose. A caller cannot select a URL,
        // widen the response bound or influence what is fetched.
        requireThat(
          Number(request.headers.get("content-length") ?? 0) <= 16 * 1024,
          "Request exceeds limit.",
          413,
        );
        const reader = request.body?.getReader();
        let bytes = 0;
        if (reader) {
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              requireThat(bytes <= 16 * 1024, "Request exceeds limit.", 413);
            }
          } finally {
            reader.cancel().catch(() => {});
          }
        }
      }
      requireThat(
        !url.searchParams.has("url"),
        "This endpoint fetches one fixed source only.",
        400,
      );
      if (inFlight || now() < nextCheckAt) {
        headers["Retry-After"] = String(Math.max(1, Math.ceil((nextCheckAt - now()) / 1000)));
        throw new ReviewError("Source checks are limited to one every 30 seconds per server instance. Retry later.", 429);
      }
      inFlight = true;
      nextCheckAt = now() + 30_000;
      let capture;
      try { capture = await collector(); }
      finally { inFlight = false; }
      return reply({
        source: WATCH,
        maxEvents: REVIEW_MAX_EVENTS,
        capture,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return reply(
        {
          error:
            error instanceof ReviewError
              ? error.message
              : "Source check failed; coverage remains unresolved.",
        },
        error.status ?? 400,
      );
    }
  };
}
