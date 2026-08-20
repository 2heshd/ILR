# Adaptive Persian System — Master Product Spec

This is the implementation source of truth distilled from the two Deep Research reports preserved in the product conversation. The goal is advanced receptive proficiency with minimal unnecessary work: Reading 4, Listening 3+, and Speaking 2.

## Operating model

1. Vocabulary is infrastructure; sentence processing is transport; discourse comprehension is the target.
2. Successful knowledge creates almost no extra work. A demonstrated error creates only the repair required by that modality.
3. Default supplemental allocation is approximately 36% reading, 34% listening, 14% lexical retrieval, 9% speaking, and 7% repair. Evidence may shift it.
4. Weekly intake normalizes and deduplicates course vocabulary, enriches missing metadata, tiers it, and adds exactly five high-value advanced lexical units.
5. Tier A receives text, audio, context, and selective production; Tier B starts with text and adds weak modalities; Tier C starts in context and earns cards only after repeated failure.
6. Deliberate retrieval is asymmetric: most work is Persian text/audio to meaning; production is reserved for Speaking-2-useful verbs, connectors, chunks, and routine functions.
7. FSRS schedules memory. Correctness plus latency measures automaticity. Neither substitutes for the other.
8. Text, audio, context, and production mastery are independent states.
9. Reading begins without help and records time, first-pass comprehension, inference, stance/intent, unknown load, and rereads.
10. Controlled coverage reinforces scheduled vocabulary; fresh transfer uses unseen material without guaranteed vocabulary coverage.
11. Listening begins audio-only. Transcript use and replay count remain separate from first-listen performance.
12. Errors are diagnosed as lexical, acoustic, syntactic, discourse, or cultural/pragmatic.
13. Dictation and shadowing are surgical repairs for the short segment that failed, not default daily workloads.
14. Speaking rotates functional tasks and maintains a floor. Recurring production failures alone justify production cards.
15. Authentic sources preserve URL, title, publisher, author, date, origin status, topic, genre, register, estimated level, length, target vocabulary, unknown load, and cultural/context tags. Stored excerpts remain short and source-linked.
16. Analytics compare topic, genre, register, publisher, difficulty, and authentic/adapted/generated origin.
17. Progress emphasizes first-pass comprehension, inference/intent, replay/transcript dependence, modality retention and latency, failure distribution, and functional speaking—not raw review counts.
18. The adaptation engine follows the demonstrated bottleneck and increases difficulty only after performance supports it.
19. Reviews and attempts are append-only evidence. Important historical measurements are not overwritten.
20. Context selection deliberately recycles vocabulary at roughly +1, +3, +7, +15, and +27 weeks while still adapting to weak items.
21. The course moves from lexical mapping (weeks 1–4), through automaticity and transfer, into authentic professional material and fresh upper-range diagnostics. Authentic material progressively dominates.
22. Serious milestone decisions use fresh material around weeks 0, 9, 18, 27, and the final week. Familiar passages never prove level readiness.
23. The system never multiplies cards preemptively, treats transcript-first work as listening success, turns every unknown word into a card, or collapses parsing failures into vocabulary failures.
24. Final loop: ingest → retrieve → test audio → space with FSRS → test transfer → diagnose failure → repair only that subsystem → interleave old material → measure first-pass comprehension.

## Readiness controls

Internal green-zone signals are training controls, not official test conversions:

- at least 80% across two fresh target-level assessments;
- at least 75% on the hardest target-level subset;
- at least 90% correct known-word retrieval within the active latency window;
- fewer than 10% of visually known words failing in audio;
- at least 75% inference and stance/intent performance.

