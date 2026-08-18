# ILR

Adaptive Persian/Farsi learning system designed around a 36-week intensive course and proficiency targets of **ILR Reading 4 / Listening 3+ / Speaking 2**.

## Product goal

Make high-ROI study tactics frictionless: weekly vocabulary intake, adaptive spaced retrieval, timed recognition, recycled reading/listening, speaking maintenance, and persistent analytics across the entire course.

## Core principles

- Receptive-first optimization for Reading 4 and Listening 3+
- FSRS-style spaced retrieval rather than fixed review intervals
- Track every review/exposure as an event; never overwrite learning history
- Measure both accuracy and retrieval latency
- Recycle current + older vocabulary in contextual reading/listening
- Add exactly 5 advanced government/politics/economics/security/diplomacy words each week
- Prevent flashcard optimization from replacing authentic comprehension practice
- Persian-aware normalization for ی/ي, ک/ك, ZWNJ, clitics, formal/colloquial variants

## MVP modules

1. **Today** — adaptive study queue
2. **Weekly Intake** — paste/import required DLI vocabulary
3. **Vocabulary Lab** — reading recognition, audio recognition, productive recall where useful
4. **Reading Lab** — timed passages, comprehension, inference, discourse tracking
5. **Listening Lab** — audio-first comprehension with speed/register tracking
6. **Speaking Maintenance** — short ILR-2-oriented prompts
7. **Analytics** — 36-week longitudinal stats by word, skill, genre, and register
8. **Difficult Items** — lapses, slow retrieval, repeated comprehension errors

## Planned stack

- Next.js + TypeScript
- PostgreSQL (Supabase-compatible)
- `ts-fsrs` for adaptive scheduling
- Zod for validation
- PWA-capable responsive UI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the initial technical blueprint.
