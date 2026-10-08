// The application version. package.json "version" is canonical; this module
// mirrors it because the static site has no bundler and dist/ does not ship
// package.json. scripts/check-version.mjs keeps the two (and the lockfile,
// CHANGELOG.md and any release tag) in agreement.
export const VERSION = "4.1.0";
