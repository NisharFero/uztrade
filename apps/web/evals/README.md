# Evaluations

`npm run eval` — everything that needs no model
`npm run eval -- --models` — also the suites that call Groq
`npm run eval -- --suite intake --verbose` — one suite, every case
`npm run eval -- --json` — for CI

The run exits non-zero when a suite scores below its threshold, or when any
gold row is wrong.

## What the suites are for

| Suite | Needs a model | Must score | Answers |
|---|---|---|---|
| `corpus` | no | 100% | Do all 243 published procedures still parse, count and depend the way their documents say? |
| `taxonomy` | no | 100% | Does a trader's word reach the category the corpus publishes it under — and stay away from the ones it must not? |
| `intake` | no | 100% | Do the gold conversations reach the right procedure, treatment and questions? |
| `planning` | no | 100% | Across every goods category: is a load sized, is a cold chain honoured, and does an agent ever claim a rule it does not have? |
| `understanding` | no | 100% | Every kind of trader message run through the chat: is the intent right (estimate, finding out, starting, clearance, certificates, cases, other), are the goods found, is a time question answered with a time - and does nothing ever open a case? |
| `masterdata` | database | 100% | Postgres against the catalogue: every procedure published once and current, every entity present once with its hand-checked type, every case and run pointing at real rows, nothing orphaned. |
| `documents` | yes | 80% | Do the demo pages read back as the values they were rendered from? |
| `groq` | yes | 80% | Does every feature that calls a model still work against the live API? |
| `understanding-model` | yes | 80% | The `understanding` checks for what only a model can read: typos the corrector cannot settle, other languages, loose phrasing. |

Deterministic suites are gates: rules, tables and the corpus should not drift,
so anything below 100% is a regression. Model suites are measurements — a
model is not an oracle — so they carry a threshold and are skipped entirely
without `GROQ_API_KEY`.

## The gold data

`gold/queries.json` is the understanding gold: one row per condition a trader
writes in - a time question with and without a route, finding out ("I wanna
move tea?", "I'm planning to…", "can I…"), starting, clearance, certificates,
their own cases, off-topic, mid-conversation answers and questions, and a goods
sweep across the categories. Each row names the intent, the goal, the goods,
direction, mode, treatment and procedure the answer must be about, and words it
must and must not say. Every row is also held to two rules whatever it
expects: no message opens a case, and a reply only offers to open one when
intake has every detail.

`gold/entities.json` is what each of the 42 entities the procedures name
actually is, checked by hand against the steps that name it. The seed's
classifier must reach it, and the `entities` table must hold it.

`masterdata` needs `DATABASE_URL` (read from `apps/.env` or `.env.local` if the
shell has not set it) and only reads. If it finds drift, `npm run db:sync`
rewrites what the seed owns - entity names and types, published v1 procedure
definitions - and nothing else.

`gold/intake.json` and `gold/taxonomy.json` are hand-written, and each row says
*why* it is the answer. Document gold is not written by hand at all: the demo
packs in `modules/demo/data/scenario-<id>.json` are the values the pages in
`public/demo/<id>/` were generated from, so reading a page back has a true
answer — 201 documents across 10 procedures.

**Gold is checked before it is used.** Every procedure a case names is verified
against the published catalogue (id, direction, mode, goods, regime), and every
category against the taxonomy. A row that names something the corpus does not
publish is reported as `GOLD`, not as a product failure — the distinction that
keeps an eval honest when the corpus changes underneath it.

What the gold deliberately does **not** do is assert the numbers a table
currently produces. Asserting that a wagon holds 30 t only asserts that the
table still says 30. `planning` therefore checks properties: every perishable
category travels refrigerated in every mode, no ambient one does, every
category sizes a load, and every certificate a rule names is the declared
output of a step.

## Rate limits

The model suites are paced for a free Groq tier — about one document a minute,
with a shared 8,000 tokens per minute. `documents` waits between pages so it
measures reading rather than the rate limit; `EVAL_DOC_PACE_MS=0` turns that
off on a paid key, and `--limit N` bounds a run.

A 429 in a result line is a tier limit, not a misreading. A `GOLD` line is a
wrong expectation. Everything else is the application.
