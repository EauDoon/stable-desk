# Changelog

All notable changes to Stable Desk are recorded here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and the
application version follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The application version lives in `package.json` and is mirrored in
`src/version.js`; `npm run check:version` keeps them, the lockfile, this file
and any release tag in agreement. The formats the app reads and writes are
versioned separately and change only when the format itself changes: the
public dataset carries `meta.version` (`2026-09-30.generic.2`), workspace
exports carry `schemaVersion` 2 and source-review state carries
`schemaVersion` 4.

Version 3 was never released. Its hosted pilot is preserved, unmerged, on the
`v3-pilot` branch.

## [Unreleased]

### Added

- One application version source (`src/version.js`, mirroring `package.json`)
  shown in the desk footer and the source-review header and sent in both
  User-Agent strings, a `npm run check:version` consistency check and this
  changelog.

### Fixed

- The hosted source check now refuses browser requests initiated by another
  site (`Sec-Fetch-Site` cross-site or same-site, or a foreign `Origin`) with
  403 before any upstream fetch or cooldown, as the local server already did.
- A malformed JSON body, or any unexpected adapter failure, now answers the
  endpoint's JSON contract with no-store and nosniff headers instead of a
  platform error page.
- The collector releases unread upstream bodies on redirect, error and
  wrong-media-type responses, and `checkedAt` uses the injected clock.
- The desk and source review open on a plain-HTTP preview reached by LAN or VM
  address. IDs fall back to `crypto.getRandomValues` where the secure-context
  `crypto.randomUUID` is missing; the stored ID format is unchanged.
- Choosing a wrong or malformed JSON file reports a validation message
  ("Dataset meta must be an object.", "Import is not valid JSON.") instead
  of an internal TypeError, and a recovery copy that vanished reports that
  it is no longer available instead of a size error.
- Desk imports, desk file picks and both review file picks share one 4 MiB
  limit (`IMPORT_LIMIT_BYTES`), which only loosens the earlier
  4,000,000-character desk limit.
- A change that would make the saved workspace too large to reopen is refused
  with a clear message before anything is written, instead of saving a
  workspace the desk could no longer load.

## [4.1.0] - 2026-10-05

### Added

- An actionable review queue in Evidence, filterable by sources, assumptions
  and decisions, ordered by blocked coverage, changed review bases and the
  oldest deadlines (UTC).
- A direct browser-local handoff from Source review into the research desk
  (Workspace & data > Preview adopted source review), with guarded draft and
  import recovery so stale previews cannot replace newer work. Merged as PR #3.

## [4.0.0] - 2026-10-01

### Added

- A self-contained source review page (`review.html`): one watched official
  page, dated snapshots, SHA-256 before/after differences, a human-written claim
  and rationale per adoption, a seven-day change brief and recovery copies.
- One stateless serverless check (`api/check.js`) that fetches one allowlisted
  public page and refuses caller-supplied URLs. No account or database.

### Fixed

- Review history preservation, complete backup restore and desk handoff
  (PR #1), and preserved current imports with contained local preview reads
  (PR #2). Both merged on 2026-10-02 under the same version.

### Removed

- The unreleased hosted v3 path, which needed an account service and database
  that were never provisioned.

## [0.2.0] - 2026-09-30

### Added

- The release the docs call "v2": the manual evidence workflow, with research
  profiles, manual source checks, evidence revisions, assumption reviews,
  revision-bound decisions, full-history export and import, drafts and recovery
  copies, plus static deployment on Vercel.

## [0.1.1] - 2026-09-30

- Initial desk and genericized demo checkpoints ([0.1.0] and 0.1.1).

[Unreleased]: https://github.com/EauDoon/stable-desk/compare/436f5e11eb2434cb12d352709ae21d66ecb64f07...HEAD
[4.1.0]: https://github.com/EauDoon/stable-desk/commit/436f5e11eb2434cb12d352709ae21d66ecb64f07
[4.0.0]: https://github.com/EauDoon/stable-desk/commit/780d4070c331555ffc2718bb54d2d0508bd02f3f
[0.2.0]: https://github.com/EauDoon/stable-desk/commit/224846c6ce03faadd54d9b6b2c0a397befa928f8
[0.1.1]: https://github.com/EauDoon/stable-desk/commit/434aac996748482fb4d825b4cb667d11c4e8e324
[0.1.0]: https://github.com/EauDoon/stable-desk/commit/ecde585cc17b92a9120232cac7f87a9871851ee1
