import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseV2Import, IMPORT_LIMIT_BYTES } from "../src/workspace.js";
import { changeReport } from "../src/change-report.js";

const USAGE = `Usage: npm run report:changes -- <export.json> [--profile <id>]
       node scripts/change-report.mjs <export.json> [--profile <id>]

Prints a Markdown change report for one profile of a desk export: every
committed change with reviewer, time, rationale and before and after values,
then the records that differ from the repository baseline. Accepts any file
the desk imports: a v1 or v2 workspace export, a generic baseline, or Source
review's "Export adopted workspace". Reads the file only; writes nothing.

  --profile <id>  report this profile (default: the export's active profile)
  -h, --help      print this help and exit

Exit codes: 0 report printed, 1 unreadable or invalid file, 2 usage error.`;

function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        profile: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    return { exit: 2, error: error.message };
  }
  const { values, positionals } = parsed;
  if (values.help) return { exit: 0, help: true };
  if (positionals.length !== 1)
    return {
      exit: 2,
      error: positionals.length
        ? "Give exactly one export file."
        : "Give the export file to report on.",
    };
  if (values.profile !== undefined && !values.profile.trim())
    return { exit: 2, error: "Invalid --profile: give a profile ID." };
  return { file: positionals[0], profile: values.profile };
}

const cli = parseCli(process.argv.slice(2));
if (cli.help) console.log(USAGE);
else if (cli.error) {
  console.error(`${cli.error}\n\n${USAGE}`);
  process.exitCode = 2;
} else {
  try {
    const text = await readFile(cli.file, "utf8");
    if (Buffer.byteLength(text) > IMPORT_LIMIT_BYTES)
      throw new Error("Import exceeds 4 MB.");
    const { seed, workspace } = parseV2Import(text);
    process.stdout.write(
      changeReport(seed, workspace, cli.profile ? { profileId: cli.profile } : {}),
    );
  } catch (error) {
    console.error(`Cannot report on ${cli.file}: ${error.message}`);
    process.exitCode = 1;
  }
}
