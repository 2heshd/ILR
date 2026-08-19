# ILR Adaptive Learning Architecture

## 1. Objective

Build a persistent 36-week Persian learning system optimized for:

- Reading: ILR 4
- Listening: ILR 3+
- Speaking: ILR 2

The system should minimize manual study friction while maximizing durable recognition, contextual comprehension, and automaticity.

## 2. Recommended architecture

Use a custom web app/PWA with an FSRS-based scheduler and a relational event-history database.

Why not Anki-only:

- Excellent for spaced retrieval but weak for passage/listening analytics.
- Harder to track multi-skill history, response latency, genre/register, and adaptive curriculum shifts.
- Harder to coordinate authentic comprehension tasks with word-level scheduling.

Why custom app:

- One source of truth for the full 35-week Unit 1+ history.
- Can still use FSRS rather than inventing a scheduler.
- Can adapt reading/listening/speaking workload based on observed performance.
- Better mobile/PWA workflow for daily use.

## 3. Core data model

### users
- id
- email
- display_name
- timezone
- target_reading_ilr
- target_listening_ilr
- target_speaking_ilr
- course_start_date
- course_end_date
- created_at

### lexical_items
- id
- normalized_form
- display_form
- romanization
- lemma
- part_of_speech
- primary_definition
- register
- topic
- source_type: dli | system_advanced | user
- source_week
- formal_variant
- colloquial_variant
- notes
- created_at

### weekly_targets
- id
- user_id
- week_number
- lexical_item_id
- required
- added_by_system
- introduced_at

### prompts
- id
- lexical_item_id
- modality: visual | audio | production | cloze
- prompt_type
- prompt_text
- answer_text
- audio_url
- active

### review_events
Append-only history.

- id
- user_id
- prompt_id
- lexical_item_id
- reviewed_at
- rating: again | hard | good | easy
- correct
- response_ms
- confidence
- scheduler_state_before
- scheduler_state_after
- due_before
- due_after
- session_id

### exposure_events
Contextual exposure that is not a flashcard review.

- id
- user_id
- lexical_item_id
- exposure_type: reading | listening | speaking | teacher | other
- content_id
- occurred_at
- noticed
- understood

### passages
- id
- title
- text_fa
- source_type: generated | authentic | adapted
- source_url
- ilr_estimate
- topic
- register
- word_count
- target_lexical_density
- created_at

### passage_attempts
- id
- user_id
- passage_id
- started_at
- completed_at
- duration_ms
- comprehension_score
- inference_score
- discourse_score
- unknown_word_count
- rereads
- self_rating
- notes

### listening_items
- id
- title
- transcript_fa
- audio_url
- source_type
- source_url
- ilr_estimate
- topic
- register
- speed_factor
- noise_level
- duration_ms

### listening_attempts
- id
- user_id
- listening_item_id
- attempted_at
- listens_count
- comprehension_score
- detail_score
- inference_score
- response_latency_ms
- speed_factor
- transcript_revealed
- notes

### speaking_prompts
- id
- prompt_fa
- prompt_en
- topic
- ilr_target
- expected_functions

### speaking_attempts
- id
- user_id
- speaking_prompt_id
- attempted_at
- duration_ms
- task_completion
- intelligibility
- grammatical_control
- vocabulary_control
- fluency
- recording_url
- notes

### mastery_states
Cached current state; never substitutes for review history.

- id
- user_id
- lexical_item_id
- modality
- stability
- difficulty
- due_at
- lapses
- total_reviews
- recent_accuracy
- median_response_ms
- last_review_at
- status

## 4. Persian normalization

Normalize for matching/search while preserving original display form.

- Arabic ي → Persian ی
- Arabic ك → Persian ک
- normalize whitespace
- normalize common ZWNJ variants
- store lemma separately from inflected form
- retain compound verb as a lexical unit, e.g. بازداشت کردن
- optionally map light-verb families for analysis
- keep formal and colloquial variants linked rather than collapsing them

## 5. Adaptive scheduling

Use FSRS for item-level scheduling.

Do not replace FSRS with a home-grown interval algorithm.

Additional application rules:

1. New weekly required words enter the queue immediately.
2. Add exactly 5 advanced domain words each week without duplicates.
3. Prioritize Persian→meaning and audio→meaning for receptive goals.
4. Use English→Persian only for high-frequency productive vocabulary and speaking needs.
5. Capture response time on every retrieval.
6. If correct but slow repeatedly, add speed-focused recognition reviews without resetting long-term mastery.
7. If an item lapses repeatedly, route it into context-rich remediation rather than simply increasing raw repetitions.

## 6. Advanced word selection

Each week select exactly five items from advanced domains:

- government
- politics
- economics
- diplomacy
- law
- security
- international relations
- formal media discourse

Constraints:

- no prior lexical-item duplicate
- avoid trivial morphological duplicates unless strategically valuable
- rotate topic/register coverage
- favor reusable high-register words that recur in authentic news and policy texts
- target roughly ILR 3-4 lexical environments over time

## 7. Authentic-comprehension guardrail

The system must not optimize only flashcard performance.

Daily queue should reserve work for contextual tasks even when vocabulary reviews are due.

Suggested starting split outside class:

- 35% listening
- 35% reading
- 20% lexical retrieval/automaticity
- 10% speaking maintenance

The app can shift up to ~10 percentage points between reading and listening based on recent weakness, but should preserve a minimum contextual-comprehension floor.

## 8. Today page

Show one compact queue:

1. Due lexical reviews
2. Timed recognition block
3. One reading task
4. One listening task
5. Optional/required speaking maintenance depending on schedule

Avoid exposing scheduling complexity unless the user asks for it.

## 9. Weekly intake

User can:

- paste Persian words
- paste Persian + definition
- upload CSV later

System should:

- normalize forms
- detect likely duplicates
- ask only when ambiguity matters
- generate/attach definitions and romanization
- assign source_week
- add 5 advanced words
- seed review prompts and contextual content

## 10. Minimum analytics

### Vocabulary
- retention rate
- mature-item count
- lapse rate
- median recognition time
- slow-but-correct queue

### Reading
- comprehension by ILR estimate
- words/minute with comprehension
- inference accuracy
- performance by topic/register

### Listening
- comprehension by ILR estimate
- first-listen accuracy
- performance by speed/register
- detail vs inference errors

### Speaking
- task completion
- fluency trend
- intelligibility

### Global
- weekly minutes
- target coverage
- oldest unresolved weak items
- skill balance

## 11. MVP sequence

### Phase 1
- project scaffold
- database schema
- authentication
- weekly vocabulary intake
- lexical-item CRUD
- review-event history
- FSRS review queue
- basic Today page

### Phase 2
- reading passages and attempts
- listening items and attempts
- timed-recognition analytics
- difficult-items queue

### Phase 3
- automatic 5-word advanced selection
- generated/adapted content recycling old + new vocabulary
- skill allocation logic
- weekly report

### Phase 4
- speaking capture
- richer ILR calibration
- advanced analytics and export

## 12. Engineering stack

Initial recommendation:

- Next.js App Router
- TypeScript
- PostgreSQL
- Supabase for hosted Postgres/auth/storage if desired
- Drizzle ORM or Prisma
- ts-fsrs
- Zod
- Tailwind CSS
- PWA manifest/service worker after core workflow works

## 13. Backups and ownership

- Database is source of truth.
- Append-only review/attempt events.
- Nightly database backups on hosted provider.
- User export: JSON + CSV.
- Media stored separately with stable references.
- Avoid storing critical history only in browser localStorage.

## 14. First build target

The first useful release should let the learner:

1. paste this week's words,
2. see definitions + romanization,
3. complete adaptive Persian→English reviews,
4. complete audio recognition prompts,
5. record latency and correctness,
6. see today's due queue,
7. preserve all review history.

Everything else should build on that foundation rather than delaying first use.
