// Prints the body of one version's CHANGELOG.md section, which becomes the
// GitHub Release notes. Release notes come only from CHANGELOG.md.
//   node scripts/release-notes.mjs <version>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The section runs from its '## [version]' heading to the next '## ' heading
// or the link reference definitions at the end of the file.
export function sectionFor(changelog, version) {
  const wanted = String(version ?? "").replace(/^v/, "");
  if (!wanted) throw new Error("Name the version, for example 4.2.0.");
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const heading = new RegExp(`^## \\[${escapeRegExp(wanted)}\\](\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1)
    throw new Error(`CHANGELOG.md has no section for ${wanted}.`);
  let end = lines.findIndex(
    (line, index) =>
      index > start && (/^## /.test(line) || /^\[[^\]]+\]: \S/.test(line)),
  );
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (!body) throw new Error(`CHANGELOG.md section ${wanted} is empty.`);
  return `${body}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [version, ...extra] = process.argv.slice(2);
  if (!version || extra.length) {
    console.error("Usage: node scripts/release-notes.mjs <version>");
    process.exitCode = 2;
  } else {
    try {
      const changelog = await readFile(
        resolve(import.meta.dirname, "..", "CHANGELOG.md"),
        "utf8",
      );
      process.stdout.write(sectionFor(changelog, version));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
