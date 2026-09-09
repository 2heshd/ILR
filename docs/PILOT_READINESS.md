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

- [ ] SynaptX exposes only analysis/reference/account surfaces.
- [ ] Stable shared identity and vocabulary work across all three products.
- [ ] Problem → intervention → later evidence is attributable.
- [ ] Aṣl novel-family inference and lexical leverage are measurable.
- [ ] Cursos reports real learner and class bottlenecks with evidence-based actions.
- [ ] Generated Persian has a documented and observable QA pipeline.
- [ ] Production errors and latency are measured.
- [ ] Releases are reproducible and versioned.
- [ ] Security, privacy, retention, deletion, and incident handling are documented and tested.
- [ ] Pilot cohort administration, consent, withdrawal, and exports work.
- [ ] Research-quality raw events can be anonymized and exported.
- [ ] Baseline, midpoint, and endline reports exist.
- [ ] Native-speaker and instructor review workflows exist.
- [ ] No causal or official-ILR claim is made without supporting design.
- [ ] Soak tests demonstrate operation without manual babysitting.

