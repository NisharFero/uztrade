# Entity APIs (sandbox)

Separate APIs for the entities the trade agent files with online — every
entity whose steps are done on a portal, and the payment gateway the agent pays through:

| Entity | Path | Stands in for | Services |
|---|---|---|---|
| Single Window | `/single-window/v1` | singlewindow.uz | certificate of origin · export phytosanitary certificate · quarantine permit (apply, obtain) · quarantine inspection act (apply, obtain) · sanitary-epidemiological conclusion (apply, obtain) |
| Uzbekistan Railways Single Window | `/railway/v1` | e-nakl.railway.uz | cost calculation · electronic certificate for railway station |
| Customs personal cabinet | `/customs/v1` | cabinet.customs.uz | preliminary visual inspection · customs declaration (EK10 / IM40 / IM70) · released declaration |
| Assalom Agro | `/assalom-agro/v1` | assalomagro.uz | internal phytosanitary application · internal phytosanitary certificate |
| Uzbekexpertiza | `/expertiza/v1` | uzexpertiza.uz | certificate of origin application (goods expertise) |
| Payment gateway | `/payments/v1` | the interbank payment gateway | bank transfer (pays an invoice, offer agreement or state fee; issues the receipt) |

### Payment gateway

The agent files a `transfer` with the payer's INN, 20-digit account and bank
MFO, the payee, the amount, the document being paid (and the amount on it), a
purpose carrying the case's payment reference (`UZ-2609-0005-P04`) and the
account holder's authorisation. The form check refuses a malformed account or
MFO and a missing authorisation. The reviewer then sends the transfer back when:

- the amount differs from the document it pays. When `basis.document` is an
  approved application in the registry (Single Window payment details), the
  amount is read from what that application issued;
- the amount is over the 500 000 000 UZS single-payment limit;
- the purpose has no payment reference;
- the payer's account has no funds (sandbox rule: an account ending in `0000`);
- the same payer already paid the same document (duplicate payment).

Otherwise the transfer is booked and approved with the receipt: `receipt_no`,
`transaction_id`, `status: Paid`, `amount_paid`, `payee`, `purpose`, `paid_at`.

## Run

```bash
cd apps/portals
npm start        # http://127.0.0.1:8790 — officer console at /
npm test
```

Node 22 runs the TypeScript directly (`--experimental-strip-types`); there are
no dependencies. Applications persist to `.data/applications.json` (git-ignored).

| Variable | Default | |
|---|---|---|
| `PORT` / `HOST` | `8790` / `127.0.0.1` | |
| `PORTALS_REVIEW_MS` | `4000` | how long an accepted application waits for review |
| `PORTALS_DATA` | `.data/applications.json` | registry file |
| `PORTAL_KEY_SINGLE_WINDOW`, `PORTAL_KEY_RAILWAY`, `PORTAL_KEY_CUSTOMS`, `PORTAL_KEY_ASSALOM_AGRO`, `PORTAL_KEY_EXPERTIZA`, `PORTAL_KEY_PAYMENTS` | `sw-dev-key`, `rw-dev-key`, `cu-dev-key`, `aa-dev-key`, `ue-dev-key`, `pg-dev-key` | one key per entity, sent as `x-api-key` |

## API

```
GET   /entities                                  every entity and its services
GET   /{entity}/v1/services[/{service}]          published fields: key, label, type, required, options, digits, refService
POST  /{entity}/v1/applications                  { service, fields, caseRef }  -> 201 under_review | 422 rejected
GET   /{entity}/v1/applications[?caseRef=]
GET   /{entity}/v1/applications/{id}             under_review -> approved (outputs) | changes_requested (changes)
PATCH /{entity}/v1/applications/{id}             { fields }  amend and resubmit -> under_review, revision + 1
POST  /{entity}/v1/applications/{id}/decision    { decision: "approve" | "request_changes", changes: [{ field, reason }] }
```

An application moves like this:

1. **Form check** on submit and on every amendment: each required field
   present, each value in the portal's shape (9-digit INN, `+998` phone, HS code
   with the digits that entity needs, dates, enums, references to approved
   applications). Failing fields come back as `422 { missing, invalid }`;
   nothing is registered.
2. **Under review** for `PORTALS_REVIEW_MS`. An officer can decide first
   (console or `/decision`).
3. **Review rules** decide on the next read: `changes_requested` with reasons,
   or `approved` with what the entity issues. For example: railway wagons over
   the 68 t load, CT-1 for a non-CIS destination, an HS heading that names other
   goods, a plant export declared without its phytosanitary certificate, or a
   permit number that isn't an approved application in the registry.

`Idempotency-Key` on POST returns the application already filed with that key.

## How the agent uses it

`apps/web/modules/portals/` — the orchestrator files every online agent step
with its entity (`targets.ts` maps the step), fills the published fields from
the case (`sources.ts`), and acts on the answer (`agent.ts`): a refused field
or a requested change pauses the step with that field as a need; the trader's
answer resumes it (a new filing, or an amendment); an application under review
keeps the step running and is read back on every orchestrator run (the
assistant polls `action: "sync"`); approval records what was issued and
completes the step. If this service isn't running, agent steps are simulated as
before (`PORTALS_DISABLED=1` switches it off explicitly).
