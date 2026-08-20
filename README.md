# Cursos

Adaptive Persian/Farsi learning system for a 35-week intensive course beginning at Unit 1, with independently selectable levels 1–4 for reading, listening, and speaking.

The distilled Deep Research requirements live in [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) and are the implementation source of truth.

## What the app does now

- imports required weekly course vocabulary in one paste
- normalizes Persian spelling variants and blocks duplicates
- fills missing English definitions + romanization when AI is configured
- adds exactly **5 advanced government/politics/economics/security/diplomacy terms** per week without repeating learned items
- schedules vocabulary with **FSRS** rather than fixed intervals
- measures retrieval latency and turns a correct response into an automatic Easy/Good/Hard grade based on speed
- keeps vocabulary recall to two decisions: **Reveal → I was right / I was wrong**
- builds adaptive reading passages that recycle current + weak older vocabulary
- makes every Persian passage word clickable with saved New, Learning, Known, and Automatic states tied directly to recall scheduling
- locks the reading passage after the timed phase, then requires answers from memory
- automatically grades reading answers for main idea, detail, inference, and discourse when AI is configured
- builds adaptive listening passages with the transcript hidden until reveal
- automatically grades listening answers while recording repeat count and transcript use
- gives answer-level corrective feedback and missed-concept diagnostics
- provides a self-score fallback if AI grading is unavailable
- shifts reading/listening study allocation toward the weaker receptive skill while preserving lexical and speaking floors
- starts every skill at Level 1 and keeps compact Reading, Listening, and Speaking level controls in the top-right corner
- recommends moving up after at least four recent receptive attempts average 80% or better
- includes a dedicated **ILR-2 speaking-maintenance lab** with 3-minute connected-response tasks
- uses Persian browser speech recognition when available and allows transcript correction before grading
- grades speaking transcripts for task completion, organization, grammatical control, vocabulary control, and a transcript-based fluency estimate
- tracks weak/slow vocabulary plus longitudinal reading, listening, and speaking statistics
- ingests authentic or adapted Persian sources into either receptive-skill lab with URL, title, publisher, publication date, topic, genre, register, and ILR provenance
- stores only a short copyright-safe excerpt/transcript while keeping a link to the original source
- extracts source-specific target vocabulary and reports attempts by publisher/source, genre, and register
- exchanges vocabulary with Anki through CSV/TSV files or the local AnkiConnect add-on
- pulls Anki review history into local recall analytics without changing either app's scheduler
- saves automatically in the browser
- optionally syncs the complete course state across devices with **Supabase username/password accounts**
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

## Anki workflow

Open **Anki** in the app index. You can import or export a tab-separated deck file without any add-on. The expected columns are `Front`, `Back`, and `Romanization`; headerless files use that same order.

For direct desktop sync, install the AnkiConnect add-on, keep Anki Desktop open, connect to `http://127.0.0.1:8765`, and choose a deck. The app can pull cards, push missing words, and import review history. It never rewrites Anki scheduling data: Anki and the app keep separate schedulers, while completed Anki reviews are copied into the app's recall history and analytics.

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

If `OPENAI_API_KEY` is configured, missing definitions/romanization are filled automatically and the system can generate advanced vocabulary, adaptive reading/listening material, speaking prompts, audio, and automatic scoring. The key is read only by server routes and is never included in browser code.

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
- authentic-source classification, ILR estimation, target-vocabulary extraction, and grounded comprehension questions

## Authentic source workflow

Open **Sources** and choose Reading or Listening. Add the canonical URL, source title, publisher, publication date, and a short Persian excerpt or transcript (maximum 1,800 characters). Mark whether the stored text is unchanged/authentic or adapted/shortened. For listening, a direct audio URL is optional; otherwise the app can render the stored transcript with Persian TTS.

Topic, genre, register, and ILR may be entered manually. With AI configured, the app refines those labels, extracts up to 15 terms that actually occur in the excerpt, and creates five excerpt-grounded comprehension questions. The source is added directly to the appropriate lab and retained in the source library. Analytics aggregate completed reading and listening attempts by publisher, genre, and register.

This workflow deliberately does not fetch or mirror full articles. Keep only the minimum excerpt needed for study and use **Open original** for the complete work.

Without the API key, vocabulary scheduling still works, the advanced-word fallback pool is used, browser Persian speech synthesis can handle listening audio, and comprehension/speaking attempts can be self-scored.

## Optional cross-device sync

Create a Supabase project, then run [`db/supabase.sql`](db/supabase.sql) in its SQL editor. The SQL enables RLS so each authenticated user can access only their own study data.

Add these to `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The combined Progress and Account page supports unique usernames plus email/password authentication. After sign-in, the complete learning state saves automatically to the user's private `study_snapshots` row while local storage remains available as an offline fallback.

Restart the development server. Create an account or sign in from the Progress page. Local persistence remains active as an offline/recovery layer.

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

The learner selects independent Reading, Listening, and Speaking levels from 1-4 in the top-right controls; new profiles begin at Level 1 in all three skills. Generated passages target the chosen level and aim for 80-90% content-vocabulary coverage from the learner's full active word inventory, including words first introduced that day. The remaining 10-20% provides controlled unfamiliar vocabulary while preserving natural discourse.

Advancing the course marks vocabulary from completed weeks as known without removing it from practice. Context selection then favors an approximately 85/15 blend of known earlier vocabulary and current-week learning vocabulary, filling from whichever pool is available, so previous material continues to appear in Reading and Listening.

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
13. Authentic-source ingestion, provenance, source libraries, and genre/register analytics

Next priorities:

1. ILR trend estimates by source class over time
2. export/backup UI for CSV + JSON
3. PWA/offline caching
4. more granular listening controls for speed/noise/register
5. weekly diagnostic report and recommended next-week adjustments

## Stack

- Next.js App Router + TypeScript
- `ts-fsrs`
- Supabase / PostgreSQL
- OpenAI Responses API + text-to-speech (optional)
- responsive PWA-ready UI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical blueprint.
