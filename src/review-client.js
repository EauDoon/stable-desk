// Review state lives in the browser. The only network call is the bounded
// source fetch, which needs a server because the page is cross-origin.
export async function fetchSource() {
  let response;
  try {
    response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    throw new Error(
      "Connection interrupted. Your local review work is untouched; retry the check.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The source check endpoint is unavailable.");
  }
  if (!response.ok)
    throw new Error(
      result.error ?? "Source check failed; coverage remains unresolved.",
    );
  return result;
}
