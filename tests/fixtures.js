import { test as base, expect } from "@playwright/test";

// Every browser test runs under the production Content-Security-Policy that
// scripts/server.mjs copies from vercel.json. Any violation (a blocked inline
// style, script, image or connection) is reported to the test and fails it,
// so a policy change cannot blank the live site unnoticed.
export async function recordCspViolations(target) {
  const violations = [];
  await target.exposeFunction("__reportCspViolation", (violation) => {
    violations.push(violation);
  });
  await target.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__reportCspViolation?.(
        `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} in ${event.sourceFile || document.URL}:${event.lineNumber}`,
      );
    });
  });
  return violations;
}

export const test = base.extend({
  cspViolations: [
    async ({ context }, use) => {
      const violations = await recordCspViolations(context);
      await use(violations);
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
