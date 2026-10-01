export async function requestPilot(action, body = null, query = {}) {
  let response;
  try {
    response = await fetch(
      `/api/desk?${new URLSearchParams({ action, ...query })}`,
      {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      },
    );
  } catch {
    throw new Error(
      "Connection interrupted. Reload latest to reconcile before retrying. Your local v2 work is untouched.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The v3 API is unavailable. Local v2 remains available.");
  }
  if (!response.ok) {
    const error = new Error(result.error ?? "Request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}
