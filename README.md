# ILR

Adaptive Persian/Farsi learning system for a 36-week intensive course with target outcomes of **ILR Reading 4 / Listening 3+ / Speaking 2**.

## What the app does now

- imports the required weekly DLI vocabulary in one paste
- normalizes Persian spelling variants and blocks duplicates
- fills missing English definitions + romanization when AI is configured
- adds exactly **5 advanced government/politics/economics/security/diplomacy terms** per week without repeating learned items
- schedules vocabulary with **FSRS** rather than fixed intervals
- measures retrieval latency and turns a correct response into an automatic Easy/Good/Hard grade based on speed
- keeps vocabulary recall to two decisions: **Reveal → I was right / I was wrong**
- builds adaptive reading passages that recycle current + weak older vocabulary
- locks the reading passage after the timed phase, then requires answers from memory
- automatically grades reading answers for main idea, detail, inference, and discourse when AI is configured
- builds adaptive listening passages with the transcript hidden until reveal
- automatically grades listening answers while recording repeat count and transcript use
- gives answer-level corrective feedback and missed-concept diagnostics
- provides a self-score fallback if AI grading is unavailable
- shifts reading/listening study allocation toward the weaker receptive skill while preserving lexical and speaking floors
- includes a dedicated **ILR-2 speaking-maintenance lab** with 3-minute connected-response tasks
- uses Persian browser speech recognition when available and allows transcript correction before grading
- grades speaking transcripts for task completion, organization, grammatical control, vocabulary control, and a transcript-based fluency estimate
- tracks weak/slow vocabulary plus longitudinal reading, listening, and speaking statistics
- saves automatically in the browser
- optionally syncs the complete course state across devices with **Supabase magic-link authentication**
- appends individual cloud vocabulary review events in addition to the recovery snapshot

## Run locally

Requires Node.js 20.9+.

```bash
git clone https://github.com/2heshd/ILR.git
cd ILR
npm install
npm run dev
```

Open `http://localhost:3000`.

The app works immediately in local mode. AI generation/grading and cloud sync are optional layers.

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

If `OPENAI_API_KEY` is configured, missing definitions/romanization are filled automatically and the system can generate advanced vocabulary, adaptive reading/listening material, speaking prompts, audio, and automatic scoring.

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
- Persian TTS through the configured speech route
- reading/listening answer grading
- ILR-2 speaking prompt generation
- transcript-based speaking feedback

Without the API key, vocabulary scheduling still works, the advanced-word fallback pool is used, browser Persian speech synthesis can handle listening audio, and comprehension/speaking attempts can be self-scored.

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

### Reading

1. Start timer.
2. Read the coherent Persian passage.
3. Finish reading; the source is locked/blurred.
4. Answer all questions from memory.
5. Automatic grading separates main idea, detail, inference, and discourse.
6. Unknown-word burden, rereads, time, answers, and grading feedback are preserved.

### Listening

1. Listen without a transcript.
2. Answer from what was heard.
3. Repeat only if needed; every repeat is counted.
4. Transcript reveal is logged as a diagnostic signal.
5. Automatic grading separates overall comprehension, detail, inference, and discourse.

### Speaking

Speaking is intentionally a smaller maintenance dose for the R4/L3+/S2 goal profile. Tasks target approximately 2-4 minutes of connected narration, description, comparison, and explanation rather than making every vocabulary item productive.

The app can capture a Persian transcript through browser speech recognition when supported. The transcript can be corrected before grading. Transcript scoring **does not claim to assess pronunciation or acoustic intelligibility**.

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

The browser/cloud snapshot stores the complete `StudyState`, including:

- every lexical item
- FSRS card state
- every review event
- retrieval latency
- passages and listening items
- typed comprehension answers and automatic grades
- reading attempts
- listening attempts
- speaking prompts, transcripts, attempts, and grades
- current course week

With Supabase enabled, that state is mirrored to a protected cloud snapshot for cross-device recovery. Vocabulary reviews are also appended individually to `review_events` so the long-term event log is not dependent on the latest snapshot alone.

The broader normalized relational design remains in [`db/schema.sql`](db/schema.sql). [`db/002_grading_speaking.sql`](db/002_grading_speaking.sql) extends that future analytics schema for comprehension grading and speaking history.

## Current engineering status

Implemented core:

1. Today dashboard
2. Weekly intake
3. FSRS timed vocabulary retrieval
4. Adaptive Reading Lab
5. Adaptive Listening Lab
6. Automatic comprehension grading
7. ILR-2 Speaking Lab
8. Adaptive skill allocation
9. Weak-item and receptive-skill analytics
10. Local + optional cloud persistence
11. AI content/grading/TTS endpoints
12. CI production-build validation

Next priorities:

1. authentic-source ingestion with provenance and copyright-safe excerpt handling
2. genre/register analytics and ILR trend estimates
3. export/backup UI for CSV + JSON
4. PWA/offline caching
5. more granular listening controls for speed/noise/register
6. weekly diagnostic report and recommended next-week adjustments

## Stack

- Next.js App Router + TypeScript
- `ts-fsrs`
- Supabase / PostgreSQL
- OpenAI Responses API + text-to-speech (optional)
- responsive PWA-ready UI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical blueprint.
