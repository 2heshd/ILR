# ILR

Adaptive Persian/Farsi learning system designed around a 36-week intensive course and proficiency targets of **ILR Reading 4 / Listening 3+ / Speaking 2**.

## Product goal

Make high-ROI study tactics frictionless: weekly vocabulary intake, adaptive spaced retrieval, timed recognition, recycled reading/listening, speaking maintenance, and persistent analytics across the entire course.

## Current MVP

The first runnable version is now in `main`.

Implemented:

- responsive **Today** dashboard
- weekly Persian vocabulary paste/import
- optional Persian — definition — romanization input format
- Persian normalization for Arabic/Persian ی and ک plus whitespace/ZWNJ cleanup
- duplicate protection on normalized forms
- automatic addition of **5 advanced government/politics/economics/diplomacy words** from a starter pool
- timed Persian→meaning retrieval
- response-latency capture
- accuracy, lapse, retention and mature-item tracking
- due-review queue
- append-only browser review history for the prototype
- 35/35/20/10 listening/reading/lexical/speaking guardrail displayed in the UI
- PostgreSQL schema for the durable 36-week data model

The current browser persistence is intentionally an MVP bridge. The SQL schema in `db/schema.sql` is the source design for moving history into hosted PostgreSQL/Supabase so it survives devices and the full 36-week course.

## Run locally

Requires Node.js 20.9+.

```bash
git clone https://github.com/2heshd/ILR.git
cd ILR
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Weekly input format

Minimum:

```text
کارمند
بازداشت کردن
آینده
```

Better:

```text
کارمند — employee — kārmand
بازداشت کردن — to arrest — bāzdāsht kardan
آینده — future — āyande
```

The app adds five advanced domain items automatically while avoiding items already in the local learner history.

## Core principles

- Receptive-first optimization for Reading 4 and Listening 3+
- FSRS rather than a home-grown long-term scheduler
- Track every review/exposure as an event; never overwrite learning history
- Measure both accuracy and retrieval latency
- Recycle current + older vocabulary in contextual reading/listening
- Add exactly 5 advanced domain words each week
- Prevent flashcard optimization from replacing authentic comprehension practice
- Persian-aware normalization for ی/ي, ک/ك, ZWNJ, clitics, formal/colloquial variants

## Next engineering milestone

1. Replace the temporary interval function with persisted `ts-fsrs` card state.
2. Connect PostgreSQL/Supabase and migrate local history into the database.
3. Build Reading Lab with timed passages and inference/discourse scoring.
4. Build Listening Lab with first-listen accuracy, speed and transcript reveal tracking.
5. Add adaptive daily allocation based on actual skill weakness.
6. Expand the advanced-word pool into a tagged, non-repeating 36-week curriculum.

## Planned modules

1. **Today** — adaptive study queue
2. **Weekly Intake** — paste/import required DLI vocabulary
3. **Vocabulary Lab** — reading recognition, audio recognition, productive recall where useful
4. **Reading Lab** — timed passages, comprehension, inference, discourse tracking
5. **Listening Lab** — audio-first comprehension with speed/register tracking
6. **Speaking Maintenance** — short ILR-2-oriented prompts
7. **Analytics** — 36-week longitudinal stats by word, skill, genre, and register
8. **Difficult Items** — lapses, slow retrieval, repeated comprehension errors

## Stack

- Next.js App Router + TypeScript
- PostgreSQL / Supabase-compatible schema
- `ts-fsrs`
- Zod
- responsive PWA-ready UI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system blueprint.
