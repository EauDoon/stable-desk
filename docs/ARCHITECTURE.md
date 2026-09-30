# Stable Desk architecture and coverage

Stable Desk v1.1 is a static app using browser ES modules, semantic HTML and responsive CSS. There is no backend, account system, database, AI endpoint or runtime dependency. The Node HTTP server is a local preview utility. The existing architecture is retained for the generic demo and proposed v2.

`src/model.js` validates records, combines filters, computes dependency fingerprints and handles review state/import/export. `src/app.js` renders three views, native modal dialogs and local workspace flows; imported strings are escaped. `src/styles.css` holds the responsive visual system. The build validates and copies only the app, data and docs into `dist/`.

The dataset remains schema version 1 with required generic-demo provenance fields. Application release v1.1 is separate from the dataset's dated version. Legacy datasets without the profile and provenance fields are rejected rather than silently migrated.

| Record          | Contents and lineage                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`          | `generic-stable-demo` identity, version, as-of date, manual collection and coverage                                                                           |
| `profile`       | Fictional name/ticker; `fictional_demo` mode; issuer/currency are null and networks empty                                                                     |
| `sources`       | New stable `S-Gxx` IDs, original HTTPS URLs/titles, publisher, publication/event/access dates, locator and caveats                                            |
| `evidence`      | `public_market` fact/company claim/inference, or `fictional_profile` synthetic example; source role states support vs context only                            |
| `organizations` | Real names/products/markets, original public context, synthetic fit question, uncertainties and questions; demo relationship has no relationship-evidence IDs |
| `priorities`    | Explicit `synthetic_example` mode, qualitative sequence, assumptions, disproof, evidence IDs and reviewed fingerprint                                         |
| `decisions`     | Explicit synthetic mode, research status and review lineage; no status means commercial approval                                                              |
| `changes`       | New generic baseline with real date and explicit scope reset; local edits/imports record actual timestamps separately                                         |

Coverage: ten organizations, ten primary sources, ten public-market evidence records, three synthetic example records, three example priorities and decisions, and one generic baseline entry. Most product/docs pages are undated and retain `publishedAt: null`. Mastercard's April 2025 and Visa's September 2023 releases keep historical event dates. This is a limited seed set, not an exhaustive or continuously current market survey.

Real relationships stay in public context under their original names, such as PayPal/Paxos and the named participants in network announcements. They are separate from the fictional profile. All demo relationships are nonexistent; acceptance and commercial readiness cannot be inferred from a real company's supported token, permissionless protocol or public announcement. Uniswap Labs and Solana Foundation organization entries use protocol documentation as context, not bilateral partnership evidence.

The fingerprint includes the profile, relevant organizations, all their associated evidence and those sources. Changing placeholder/profile assumptions flags all proposals; changing linked context flags affected proposals. This catches newly associated evidence too. FNV is a deterministic change detector, not a cryptographic authenticity guarantee. Source metadata changes can conservatively flag review even if only the check date changed; field-level impact and separate freshness checks are in the v2 plan.

Browser storage is isolated under `stable-desk:generic-v1`. Only the existence of the previous `stable-desk:v1` key is checked; its content is not parsed, loaded or deleted. A notice explains the separation. New IDs also prevent old assessments from attaching to new examples. Generic imports require valid profile mode, evidence subject/source roles and synthetic priority/decision modes. The UI cannot turn a fictional example into a verified issuer relationship through an import. Dataset imports do not edit repository files.

The local workspace includes optional imported data, assessment overrides, explicit review stamps and activity. Full JSON export is the backup/transfer mechanism. There is no synchronization, concurrency handling, authentication, encryption or automatic backup. Reset asks before clearing the current generic browser workspace. Public demo notes should contain public information only.

Review deadlines use UTC. Explicit local review needs reasoning and records the current fingerprint. It clears a proposal review flag for that snapshot; it neither fetches sources nor verifies product availability. Source freshness, new evidence and assumption review are distinct concepts; the current version has deadline/change warnings rather than a complete freshness queue.

The only optional third-party requests made by the app are Google Fonts CSS/fonts; system font fallbacks work if blocked. Source links open on user action. No analytics or remote submission is implemented. Authenticated quotes, chain state, reserve audits, real account eligibility, production rollout and commercial terms were not verified. No live refresh, AI chat or recurring monitoring is commissioned. Earlier Git commits retain prior issuer-specific content; current files and generated assets are replaced without rewriting history.
