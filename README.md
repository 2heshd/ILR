# ILR

Adaptive Persian/Farsi learning system for a 36-week intensive course with target outcomes of **ILR Reading 4 / Listening 3+ / Speaking 2**.

## What the app does now

- imports the required weekly DLI vocabulary in one paste
- normalizes Persian spelling variants and blocks duplicates
- fills missing English definitions + romanization when AI is configured
- adds exactly **5 advanced government/politics/economics/security/diplomacy terms** per week without repeating learned items
- schedules vocabulary with **FSRS** rather than fixed intervals
- measures retrieval latency and turns a correct response into an automatic Easy/Good/Hard grade based on speed
- keeps the recall workflow to two decisions: **Reveal → I was right / I was wrong**
- builds adaptive reading passages that recycle current + weak older vocabulary
- tracks reading comprehension, inference, discourse control, rereads, unknown words, and time
- builds adaptive listening passages with the transcript hidden until reveal
- tracks listen count, overall comprehension, detail, inference, and transcript use
- shifts reading/listening study allocation toward the weaker receptive skill while preserving lexical and speaking floors
- shows weak/slow vocabulary and longitudinal receptive-skill statistics
- saves automatically in the browser
- optionally syncs the complete course state across devices with **Supabase magic-link authentication**
- appends individual cloud review events in addition to the recovery snapshot

## Run locally

Requires Node.js 20.9+.

```bash
git clone https://github.com/2heshd/ILR.git
cd ILR
npm install
npm run dev
```

Open `http://localhost:3000`.

The app works immediately in local mode.

## Weekly vocabulary input

Minimum:

```text
کارمند
بازداشت کردن
آینده
```

Preferred if definitions are already available:

```text
کارمند — employee — kārmand
بازداشت کردن — to arrest — bāzdāsht kardan
آینده — future — āyande
```

If `OPENAI_API_KEY` is configured, missing definitions/romanization are filled automatically and the system can generate the advanced weekly vocabulary and adaptive reading/listening content.

## Optional AI setup

Copy the environment template:

```bash
cp .env.example .env.local
```

Set:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
```

The API key is used only in server routes; never expose it with a `NEXT_PUBLIC_` prefix.

AI enables:

- vocabulary definition + romanization enrichment
- dynamic non-repeating advanced-domain terms
- adaptive reading passages
- adaptive listening scripts
- Persian TTS through `gpt-4o-mini-tts`

Without the API key, the vocabulary system still works and uses a built-in advanced-word fallback pool. Browser Persian speech synthesis is used as the listening-audio fallback.

## Optional cross-device sync

Create a Supabase project, then run [`db/supabase.sql`](db/supabase.sql) in its SQL editor. The SQL enables RLS so each authenticated user can access only their own study data.

Add these to `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Restart the development server. A magic-link sign-in box will appear on the Today page. Local persistence remains active as an offline/recovery layer.

## Adaptive logic

### Vocabulary

Long-term review intervals come from `ts-fsrs`. Retrieval time is captured separately:

- ≤3 sec correct recall → automatic `Easy`
- >3 to ≤8 sec correct recall → automatic `Good`
- >8 sec correct recall → automatic `Hard`
- incorrect recall → `Again`

This keeps latency useful as an automaticity signal without replacing actual recall accuracy.

### Skill allocation

Starting allocation outside class:

- Listening 35%
- Reading 35%
- Lexical retrieval 20%
- Speaking 10%

Recent reading/listening results can shift up to 10 percentage points toward the weaker receptive skill. A large due-vocabulary backlog can temporarily add 5 points to lexical work, but contextual comprehension retains a floor.

### Difficulty progression

Reading and listening content scale with course week toward the long-term R4/L3+ targets rather than jumping immediately to target difficulty. Generated passages prioritize weak/current vocabulary but are instructed to preserve natural discourse rather than maximize keyword density.

## Persistence model

The browser stores a complete `StudyState`, including:

- every lexical item
- FSRS card state
- every review event
- retrieval latency
- passages and listening items
- reading attempts
- listening attempts
- current course week

With Supabase enabled, that state is mirrored to a protected cloud snapshot for cross-device recovery. Vocabulary reviews are also appended individually to `review_events` so the long-term event log is not dependent on the latest snapshot alone.

The broader normalized relational design remains in [`db/schema.sql`](db/schema.sql) for later analytics expansion.

## Current engineering status

Implemented core:

1. Today dashboard
2. Weekly intake
3. FSRS timed vocabulary retrieval
4. Reading Lab
5. Listening Lab
6. Adaptive allocation
7. Weak-item analytics
8. Local + optional cloud persistence
9. AI content/TTS endpoints
10. CI build validation

Next priorities:

1. automatic grading of reading/listening answers instead of self-scoring only
2. dedicated ILR-2 speaking-maintenance workflow
3. authentic-source ingestion and provenance tracking
4. richer per-genre/register analytics
5. export/backup UI
6. PWA/offline caching

## Stack

- Next.js App Router + TypeScript
- `ts-fsrs`
- Supabase / PostgreSQL
- OpenAI Responses API + text-to-speech (optional)
- responsive PWA-ready UI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical blueprint.
