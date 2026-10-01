# 09 — Decisions

| Decision                                      | Reason and limit                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| One owner across devices                      | Exercises persistent continuation without team/invitation infrastructure.                                             |
| Supabase Auth + Postgres                      | One provider; external provisioning, credentials and real integration remain gated.                                   |
| Separate local v2 and explicit backed-up copy | No automatic upload, key clearing or overwrite of an existing shared account; imported labels remain unauthenticated. |
| One immutable official Stripe URL             | Retains existing source/evidence/assumption lineage and avoids arbitrary URLs/redirects.                              |
| Source diff plus human-authored claim         | No fabricated AI result; page churn may be irrelevant. Single-source adoption stays company claim/inference.          |
| Authenticated actor, CAS and recovery         | Server identity and strict v2 commands precede atomic writes. Administrator tamper-proofing is not claimed.           |
| Manual checks/on-demand brief                 | No recurring collection or outbound delivery permission commissioned.                                                 |
| 60 operations, 4 MB state                     | Bounded trial; export/retention review instead of automatic deletion or upgrade.                                      |
| Feature-branch commits                        | Preserve live main and separate production approval.                                                                  |

Smallest hosted approval: a dedicated free-tier Supabase pilot project (or confirmed isolated existing project), staged new-table/function/RLS SQL, secure server environment configuration and one existing approved account UUID. Verify a protected Vercel preview first. Credentials must not appear in chat; any new grant or paid requirement needs explicit review. Production adoption awaits user acceptance.

Usefulness and adoption are unmeasured pending user review. Passing local acceptance establishes neither business value nor causal speedup. Token consumption and actual model cost are unknown.
