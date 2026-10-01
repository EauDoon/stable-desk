import { PilotError, requireThat } from "./pilot-model.mjs";
export class SupabaseAuth {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  async request(path, token, body) {
    if (this.config.anonKey.startsWith("sb_secret_"))
      throw new PilotError("Invalid sign-in key configuration.", 503);
    const response = await this.fetcher(`${this.config.url}/auth/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        apikey: this.config.anonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new PilotError(
        "Sign-in is unavailable or expired. Check your session and try again.",
        response.status >= 500 ? 503 : 401,
      );
    return response.status === 204 ? null : response.json();
  }
  async login(email, password) {
    const session = await this.request("token?grant_type=password", null, {
      email,
      password,
    });
    requireThat(
      session.access_token && session.user?.id,
      "Invalid sign-in response.",
      503,
    );
    return {
      token: session.access_token,
      user: { id: session.user.id },
      expiresIn: Math.min(session.expires_in ?? 3600, 3600),
    };
  }
  async user(token) {
    if (!token) throw new PilotError("Sign in to open shared work.", 401);
    const user = await this.request("user", token);
    requireThat(
      /^[0-9a-f-]{36}$/i.test(user.id),
      "Invalid verified identity.",
      401,
    );
    return { id: user.id };
  }
  async logout(token) {
    if (token) await this.request("logout", token, {});
  }
}
// No real accounts, password secrets, JWTs or provider grants in the fixture adapter.
export class FixtureAuth {
  async login(email, password) {
    const generated = email.match(
      /^reader-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@example\.invalid$/i,
    )?.[1];
    requireThat(
      (generated ||
        ["reader-a@example.invalid", "reader-b@example.invalid"].includes(
          email,
        )) &&
        password === "fixture-only",
      "Invalid fixture account.",
      401,
    );
    const id =
      generated ??
      (email.startsWith("reader-a")
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222");
    return { token: `fixture-${id}`, user: { id }, expiresIn: 3600 };
  }
  async user(token) {
    const id = token?.replace(/^fixture-/, "");
    requireThat(
      token?.startsWith("fixture-") &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
      "Sign in to the fixture.",
      401,
    );
    return { id };
  }
  async logout() {}
}
