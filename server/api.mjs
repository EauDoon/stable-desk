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
export function createAPI({ collector }) {
  return async function api(request) {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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
          request.headers.get("content-type")?.split(";")[0] ===
            "application/json",
          "JSON request required.",
          415,
        );
        // The request body is ignored on purpose. A caller cannot select a URL,
        // widen the response bound or influence what is fetched.
        const text = await request.text();
        requireThat(
          new TextEncoder().encode(text).length <= 16 * 1024,
          "Request exceeds limit.",
          413,
        );
      }
      requireThat(
        !url.searchParams.has("url"),
        "This endpoint fetches one fixed source only.",
        400,
      );
      const capture = await collector();
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
