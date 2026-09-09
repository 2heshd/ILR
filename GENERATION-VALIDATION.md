# Generation release checks

Production has not been updated by this audit. Passing unit tests or receiving
HTTP 200 is not sufficient for release: inspect passage coherence, question
evidence, vocabulary labels, and total latency (including listening audio).

## Repeatable test matrix

`node scripts/generation-audit.mjs <exact-preview-url> <limit> <offset> <report>`

The static gate checks all 8,060 course/news entries. The live matrix then tests
all 44 learner-facing topic banks plus 24 selected-word cases spanning 12, 30,
and 80-word plans, both modalities, four difficulty bands, and formal and
colloquial Persian. This tests the actual learner contracts; it does not claim
that every catalog entry appears in a generated passage. Each result is
checkpointed. Compare the same cases across changes; do not discard failures
and report only successful reruns.

Release target: successful, coherent exercises with source-supported questions,
a bounded validated supporting vocabulary set, and the requested 20-second
generation target. Provider timing varies; a finite passing run cannot guarantee
that every future request will succeed.

## Regressions found and addressed locally

- Parenthesized present stems were mistaken for compound-verb components.
- Joined/spaced selected entries were incorrectly classified as new vocabulary.
- The validator invented previous-word compounds in its error messages.
- English answers could introduce unsupported gender.
- Different inflections of a supporting verb counted as multiple new entries.
- Missing support labels caused unnecessary AI repair round-trips.
- Duplicate shared-vocabulary conflict keys could fail an entire upsert.

## Current candidate — 2026-09-09

The five independent candidates now run through deterministic and read-only
editorial validation in parallel; the first fully approved result wins. Topic
mode passed **44/44** live cases. After adapting narrow selected banks to use a
smaller compatible focus and a bounded twelve-entry validator allowance,
selected-word mode passed **24/24** live cases. Every returned case completed
within 20 seconds; selected-word median was 5.99 seconds and p95 was 8.53
seconds. The static catalog check covered all 8,060 entries with zero empty or
normalization-invalid records.

An accepted listening passage also passed the final audio paths: MP3 narration
returned in 4.42 seconds, and narration plus complete word-level captions
returned in 7.57 seconds. The caption packet covered all 25 transcript words,
from the first through the last, and contained a valid 15-second MP3.

These are reproducible automated release checks, not native-speaker
certification or a guarantee about every future provider response. Human review
remains a separate protected workflow.

## Remaining verification

- Verify account save/reload against a connected account before claiming cloud
  synchronization is fixed. The duplicate-key regression test alone does not
  establish the cause of every reported cloud-save failure.

Stronger-editor comparisons use a preview-only environment override. The source
default remains the smaller model; do not silently promote an experimental
environment override or unrelated topic changes.

## Full preview run — 2026-09-09

Candidate `getcursos-4jlinbp8k-2heshds-projects.vercel.app`, using
`gpt-5.4` with no reasoning for drafting and `gpt-5.4-mini` with low reasoning
for editing: **FAIL**. All 69 matrix requests completed; only 15 returned an
exercise passing the deterministic checks, and only 6 of those met 20 seconds.
Successful-response median was 23.77 seconds and p95 was 48.28 seconds. These
latencies exclude speech synthesis. Returning exercises is not an independent
linguistic quality certification.

The run retained failures rather than replacing them with successful retries.
Raw checkpoint/report: `/tmp/cursos-candidate-full-audit.json` (temporary local
artifact; not deployed). Most rejections concern supporting vocabulary; the
checker and generator still disagree on some inflected/compound forms. Two
requests timed out. No production promotion is authorized by this result.

A subsequent preview plans supporting entries before emitting the passage,
rather than retrospectively listing them. Its six-case regression run must be
evaluated separately; it does not replace the failed full-matrix evidence.

That follow-up completed: 3/6 returned exercises and 2/6 met 20 seconds; two
vocabulary rejections and one timeout remain. Preview:
`getcursos-iev309xtj-2heshds-projects.vercel.app`; report:
`/tmp/cursos-plan-first-audit.json`. Manual inspection also raises content-quality
concerns in returned passages (for example, the travel text's location-visit
collocation and the conscription text's exemption/completion-card narrative).
Therefore even those HTTP 200 results are not declared linguistically passed.

The UI generation check completed in an isolated preview browser with 37
introductory classroom words: a new passage appeared and the Generate button
became available again. It did not use a signed-in account and does not verify
cloud sync. No live test process remains running after these two completed runs.

## Follow-up troubleshooting

Local regressions now cover object-marked compounds, vowel-final possessives,
additional course infinitives, and aspect/negation on existing grammatical
auxiliaries. Audio endpoints previously inherited the SDK's ten-minute default
timeout and automatic retries: they now have a shared 20-second deadline,
no automatic retries, and browser-side cancellation after 25 seconds. A timeout
is still a failure, not successful generation within the target.

The language review is now read-only. Local vocabulary/answer checks run first;
only locally valid drafts go to language review. This avoids the observed editor
failure where it corrected a phrase but returned rejection reasons about the old
phrase. No returned exercise bypasses language review.

Six-case comparisons (same offset 8, all failures retained):

| Report in `/tmp/` | Returned | Also under 20s |
| --- | ---: | ---: |
| cursos-readable-bank-audit.json | 3/6 | 2/6 |
| cursos-fast-editor-audit.json | 2/6 | 2/6 |
| cursos-judge-only-audit.json | 2/6 | 1/6 |
| cursos-description-audit.json | 1/6 | 1/6 |
| cursos-deliberate-writer-audit.json | 4/6 | 1/6 |
| cursos-mini-medium-audit.json | 2/6 | 0/6 |
| cursos-fixed-support-audit.json | 2/6 | 2/6 |

The fixed-support prompt experiment was removed after failing. These runs are
not interchangeable model benchmarks: each report records its exact preview,
and some intermediate previews include additional tested parser corrections.
All remain release failures. None is independently certified for Persian quality.

A complete synthetic caption mismatch was traced to recognizer spelling
`اید` for source `عید`; the narrowly scoped repair retains all timestamps/cues
and succeeds only when the entire corrected transcript matches. Missing words
are still rejected. The subsequent preview returned both audio (6.80s) and
aligned captions (9.88s). Adding the source exercise's earlier 11.85s generation
gives 18.66s and 21.73s respectively; this is not a fresh end-to-end run.

Production is unchanged. No account sync test was performed in this follow-up.

## Background-preparation release candidate — 2026-09-09

Reading and Listening now prepare the next matching exercise in memory when the
learner opens the lab. The cache fingerprint includes kind, topic, level,
register, practice mode, selected vocabulary, meanings, and known-word status.
Stale results are never consumed, failures do not alter the current exercise,
and a prepared result is consumed only once. Rejected background drafts retry
up to three times through the same complete server-side quality gate.

Local release checks: 85/85 tests passed, the production build passed, and
`git diff --check` passed. A six-case live matrix prepared five cases; the one
remaining technical-colloquial case then passed its focused retest after the
register guidance and grammatical-scaffolding corrections. The accepted
colloquial sample used actual spoken framing rather than formal prose with a
colloquial label. A deterministic English-article repair was added after manual
inspection caught “a earthquake.”

Final protected preview audio checks both returned HTTP 200. Full speech took
5.40 seconds; word-aligned rapid captions took 7.75 seconds and preserved full
transcript coverage. The alignment reconciles source words only when cue counts
match and at least 80% of tokens already match exactly; missing or unrelated
transcripts still fail closed.

This design reduces perceived repeat-generation delay; it does not claim that
every upstream model call will finish in twenty seconds or that finite sampling
can certify every future Persian output. Only server-approved exercises enter
the learner's history.
