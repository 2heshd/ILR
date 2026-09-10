# Pilot operations and data handling

## Before enrollment

1. The pilot owner creates one class with its language, course label, start/end dates, and retention period.
2. The institution approves the consent language and assigns aliases. The product generates a participant code; email addresses are never included in research exports.
3. Learners join with the private code and explicit consent. Withdrawal removes the membership, its class-event links, and class assessment snapshots, stopping both future sharing and later reappearance of previously shared evidence. The separate deletion action removes all of the learner's pilot events, quality records, snapshots, and stored class identity.
4. The owner captures a baseline before normal use, a midpoint on the planned date, and an endline before closing access.

## Data dictionary

`learning_events` stores UTC time, product, event type, session/item identifiers, skill, linguistic concept, intervention correlation, correctness, latency, attempt number, support categories, source/register/difficulty/week/topic, and small structured metadata. It never stores passwords, auth tokens, raw learner answers, private notes, transcripts, or full generated passages.

`generation_quality_runs` stores generated-content QA flags, a content hash, latency, model label, release status, issue codes, and the generated exercise packet for authorized human review. It does not store learner responses.

`pilot_assessments` stores frozen aggregate metrics for baseline, midpoint, and endline. `content_human_reviews` stores an authenticated reviewer role, verdict, four judgment flags, and an optional blocking issue.

## Access, retention, deletion, and export

- Row-level security limits learners to their own learning events. Classroom owners receive only consented-member aggregates through owner-checked functions.
- Aggregate and raw-event pilot exports use participant codes. The raw export omits names, emails, answers, passages, notes, and free-form metadata. The ordinary weekly teaching report may show the learner-approved class display name and must stay with authorized teaching staff.
- Account deletion cascades learning events and generated QA records through the authentication user ID. Leaving a class deletes membership and stops future sharing. At the configured retention deadline, the service purge removes class-event links, assessment snapshots, and participant membership identities; the learner's underlying personal practice events remain available only to that learner until they use pilot-data or account deletion.
- Do not paste controlled, classified, medical, legal, operational, or personally identifying text into generated-practice or analysis fields unless the institution has approved that use.

## Incident response

1. Stop enrollment and new generation if authentication, row-level security, or cross-user data isolation is in doubt.
2. Record UTC time, affected product/release, route, error class, and scope—never credentials or private learner content.
3. Preserve relevant deployment and aggregate quality logs, rotate exposed secrets, revoke affected sessions, and notify the pilot owner.
4. Verify containment with an owner/non-owner access test, deploy a versioned fix, and document impact and deletion actions before resuming.

## Authentication security exceptions

- Email confirmation and secure password-change protection are enabled for the pilot. Keep both enabled and recheck them before each enrollment window.
- Supabase leaked-password detection is unavailable on the project's current Free plan. Upgrade to Pro and enable it before a broader rollout, or record explicit institutional risk acceptance if the pilot remains on Free.
- The database security advisor flags authenticated `SECURITY DEFINER` reporting and lifecycle functions. These are intentional: public and anonymous execution is revoked, every user-facing function performs an owner/self authorization check, and owner, non-owner, anonymous, and cross-user denial paths are covered by the transactional database smoke. Re-audit grants and authorization predicates whenever one of these functions changes.

## Content review

Automated checks gate schema, vocabulary constraints, grammar/register review, question evidence, answers, duplicates, provenance, and latency. “Learner visible” means the automated gate passed; it does not mean a native speaker certified the exercise. The protected review queue lets an instructor, native speaker, or linguist record an independent verdict. Blocking reviews stay visible to the pilot owner for follow-up.

## Reporting language

Use “observed,” “associated with,” and “post-intervention performance.” Do not report causal impact without a suitable study design. Internal difficulty estimates are not official ILR ratings, DLI approval, or proficiency certification.

## Reliability routine

- Before release: all unit/integration tests, build, migration inspection, preview generation matrix, authenticated sync checks, owner/non-owner access checks, and route smoke checks.
- Apply schema 014 followed by the RLS performance patch in `db/015_rls_auth_initplan.sql`, then run `supabase db query --project-ref <project-ref> --file scripts/pilot-db-smoke.sql`; it must return `pilot-db-smoke-passed`. The smoke fixtures run inside a rolled-back transaction.
- After release: verify the release SHA and schema/content versions, then run health and primary-flow checks.
- During the pilot: review failure rate and p50/p95 generation latency daily; investigate repeated sync/generation failures rather than requiring learners to retry indefinitely.
- Reproduce the cross-product health soak with `npm run pilot:soak -- <cursos-url> <synaptx-url> <asl-url> <cycles> <pause-ms>`; any non-200, invalid health payload, missing release identifier, or timeout fails the gate.
