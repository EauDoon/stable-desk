import { load } from "cheerio";
import { WATCH, requireThat } from "./pilot-model.mjs";
export function meaningfulText(raw, contentType = "text/html") {
  let text;
  if (/markdown|text\/plain/.test(contentType))
    text = raw
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*#`]/g, "");
  else {
    const doc = load(raw);
    doc(
      'script,style,nav,footer,header,aside,form,noscript,[aria-hidden="true"]',
    ).remove();
    const root = doc(WATCH.selector).first();
    requireThat(
      root.length,
      "No main content found; source layout requires review.",
    );
    text = root.text();
  }
  text = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  requireThat(
    text.length >= 80 && text.length <= 20000 && /stablecoin/i.test(text),
    "Meaningful source text is unavailable or outside pilot bounds.",
  );
  return text;
}
export async function collect(fetcher = fetch) {
  try {
    const response = await fetcher(WATCH.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "text/markdown, text/html;q=0.9",
        "User-Agent": "StableDeskPilot/0.3 (bounded public source review)",
      },
    });
    if (!response.ok)
      return {
        outcome: "unreachable",
        status: response.status,
        note: "Restricted, redirected or failed page; no candidate or adoption inferred.",
      };
    const type = response.headers.get("content-type") ?? "";
    requireThat(
      /text\/(html|markdown|plain)/.test(type),
      "Unsupported source media type.",
    );
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new Error("Source response exceeds limit.");
      }
      chunks.push(Buffer.from(value));
    }
    return {
      outcome: "ok",
      status: response.status,
      text: meaningfulText(Buffer.concat(chunks).toString("utf8"), type),
    };
  } catch {
    return {
      outcome: "unreachable",
      status: null,
      note: "Collection failed or meaningful content could not be extracted. Coverage remains unresolved.",
    };
  }
}
