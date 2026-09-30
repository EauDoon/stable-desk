import { readFile } from "node:fs/promises";
import { validateDataset } from "../src/model.js";
const data = JSON.parse(
  await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
);
const errors = validateDataset(data);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Valid baseline ${data.meta.version}: ${data.organizations.length} organizations, ${data.sources.length} sources, ${data.evidence.length} evidence records, ${data.priorities.length} priorities. All references resolve.`,
  );
