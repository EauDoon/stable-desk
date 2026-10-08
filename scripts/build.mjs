import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDataset } from "../src/model.js";
import {
  prepareDataset,
  createWorkspace,
  projectWorkspace,
} from "../src/workspace.js";
import { readFile } from "node:fs/promises";
const root = resolve(import.meta.dirname, "..");
const data = JSON.parse(
  await readFile(resolve(root, "data/baseline.json"), "utf8"),
);
const errors = validateDataset(data);
if (!errors.length) {
  const seed = prepareDataset(data);
  projectWorkspace(seed, createWorkspace(seed));
}
if (errors.length) throw new Error(errors.join("\n"));
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
for (const file of [
  "index.html",
  "review.html",
  "favicon.svg",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "src",
  "data",
  "docs",
])
  await cp(resolve(root, file), resolve(root, "dist", file), {
    recursive: true,
  });
console.log("Built validated static app in dist/");
