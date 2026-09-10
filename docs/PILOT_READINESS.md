# SynaptX suite pilot-readiness program

This document is the release contract for the SynaptX, Cursos, and Aṣl pilot. It intentionally does not add another learner product surface.

## Product boundaries

- **SynaptX — Analyze:** morphology, syntax, Verb Lab, grammar notes, saved analyses, account, and handoffs.
- **Cursos — Train and measure:** vocabulary, FSRS, reading, listening, speaking, adaptive allocation, sources, course alignment, progress, classrooms, and evidence.
- **Aṣl — Decode lexical structure:** roots, measures, derivational families, compound verbs, word-family discovery, and handoffs.

Legacy LMS, course-progression, drill, checkpoint, retention, and unofficial proficiency surfaces must stay out of the SynaptX learner navigation.

## Evidence language

- Observational comparisons are **post-intervention performance** or **associated improvement**, never causal impact.
- Internal difficulty estimates are not official ILR proficiency scores.
- Generated content is not called linguistically certified. Native/instructor review status is reported separately.
- Missing evidence remains missing; it is never rendered as zero or inferred mastery.

## Release gates

Every production release records the product, commit SHA, UTC timestamp, schema version, content version, automated checks, preview URL, and smoke-test result. A release is not ready merely because it built.

Generated learner material must progress through:

1. `generated`
2. `deterministically_valid`
3. `linguistically_reviewed`
4. `learner_visible`

The release gate covers schema, vocabulary constraints, Persian grammar, register, question evidence, answer integrity, duplicate detection, provenance where applicable, latency, and final visibility.

## Privacy contract

Learning events contain item identifiers, categories, correctness, latency, support use, and small structured metadata. They must not contain raw passwords, access tokens, private passage answers, private notes, full generated passages, or unrelated personal content.

Learners may read/export/delete their own events. Classroom owners receive aggregates for opted-in members through protected database functions, not unrestricted row access. Deleting an account cascades to its event data. Human-review exports use participant IDs rather than email addresses.

## Pilot-ready definition

- [x] SynaptX exposes only analysis/reference/account surfaces.
- [x] Stable shared identity and vocabulary work across all three products.
- [x] Problem → intervention → later evidence is attributable.
- [x] Aṣl novel-family inference and lexical leverage are measurable.
- [x] Cursos reports real learner and class bottlenecks with evidence-based actions.
- [x] Generated Persian has a documented and observable QA pipeline.
- [x] Production errors and latency are measured.
- [x] Releases are reproducible and versioned.
- [x] Security, privacy, retention, deletion, and incident handling are documented and tested.
- [x] Pilot cohort administration, consent, withdrawal, and exports work.
- [x] Research-quality raw events can be anonymized and exported.
- [x] Baseline, midpoint, and endline reports exist.
- [x] Native-speaker and instructor review workflows exist.
- [x] No causal or official-ILR claim is made without supporting design.
- [x] Soak tests demonstrate operation without manual babysitting.

## Pilot release evidence — 2026-09-09

- Clean release worktrees passed 110 Cursos tests and its production build, 157 SynaptX tests, and 27 Aṣl tests and its production build. Fresh installs reported no package vulnerabilities.
- The production database is at schema `015`. Its transactional owner/non-owner, consent, withdrawal, deletion, export, assessment, review, release-registry, and cross-user isolation smoke returned `pilot-db-smoke-passed`. The database performance advisor reported no remaining issues.
- Final Cursos preview generation covered both selected-vocabulary and topic modes for reading and listening. Exercises passed schema, vocabulary, answer-evidence, naturalness, and latency checks; preview timings were 5.635–8.553 seconds, with audio completion at 13.355–13.907 seconds.
- Production Cursos generation completed reading in 5.530 seconds and listening in 7.345 seconds; speech and captioned speech completed in 11.874 and 13.797 seconds. All checks passed the 20-second learner-facing target.
- A 60-cycle production soak made 720 route and health checks across Cursos, SynaptX, and Aṣl with zero failures. Observed p95 response times were 145 ms, 178 ms, and 139 ms respectively.
- Exact release identifiers, schema/content versions, URLs, automated checks, and smoke status are recorded in `deployment_releases`. This evidence demonstrates readiness against this pilot contract; it is not a promise of zero defects, linguistic certification, causal impact, or an official ILR score.
