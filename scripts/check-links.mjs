import { readFile, writeFile, mkdir } from "node:fs/promises";
import { VERSION } from "../src/version.js";
const data = JSON.parse(
  await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
);
const results = [];
// Public GETs only; no cookies, authentication, forms, subscriptions or transactions.
for (let offset = 0; offset < data.sources.length; offset += 4) {
  results.push(
    ...(await Promise.all(
      data.sources.slice(offset, offset + 4).map(async (source) => {
        try {
          const response = await fetch(source.url, {
            signal: AbortSignal.timeout(12000),
            headers: {
              "User-Agent": `StableDesk-public-source-link-check/${VERSION}`,
            },
          });
          await response.body?.cancel();
          return {
            id: source.id,
            url: source.url,
            status: response.status,
            finalUrl: response.url,
            verdict: response.ok
              ? "reachable"
              : [403, 429].includes(response.status)
                ? "restricted-to-client"
                : "check-required",
          };
        } catch (error) {
          return {
            id: source.id,
            url: source.url,
            status: null,
            verdict: "unavailable-to-client",
            error: error.message,
          };
        }
      }),
    )),
  );
}
const report = {
  checkedAt: new Date().toISOString(),
  method:
    "Unauthenticated public GET; separate from browser search-source access.",
  results,
};
// New reports go to the ignored test-results/ folder. The tracked
// artifacts/source-links.json is the historical record and is never rewritten.
await mkdir(new URL("../test-results/artifacts/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL("../test-results/artifacts/source-links.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
for (const r of results)
  console.log(`${r.id}: ${r.status ?? "unavailable"} ${r.verdict}`);
const broken = results.filter((r) => r.status === 404 || r.status === 410);
if (broken.length) process.exitCode = 1;
else if (results.some((r) => r.verdict !== "reachable")) process.exitCode = 2;
console.log(
  `Checked ${results.length} links. ${results.filter((r) => r.verdict === "reachable").length} reachable; ${results.filter((r) => r.verdict !== "reachable").length} client restrictions/unresolved responses. See test-results/artifacts/source-links.json.`,
);
