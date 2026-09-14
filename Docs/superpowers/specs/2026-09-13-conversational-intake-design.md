# Conversational Intake — Design

Status: approved 2026-09-13. Extends
`2026-09-13-intake-docintel-risk-agents-design.md` §1.

## Goal

Before any case or step is created, intake gathers four details, each checked
against what is actually published, and the trader confirms them:

1. **What** — the goods (commodity table).
2. **How** — the transport mode, offered only from modes a published procedure
   has for those goods.
3. **How much** — a quantity checked for reasonableness against the mode.
4. **From → To** — both ends; one must be Uzbekistan, the other a partner
   country in the supplied country fixture. The route sets the direction.

Then a **confirm card**; only "Create case" opens the case and builds steps.

## Why

A case opened on goods + mode alone has a step plan and risk view built on
guesses: quantity decides wagons vs air pallets and whether air is sensible;
the route decides direction, crossing points, origin-proof form and the
destination's requirements.

## Decisions

- **Confirm card before creation** (user choice).
- **Country source = supplied fixture** `app/data/countries.ts`: UZ plus six
  partners (KZ, KG, TR, AF, RU, CN) with EAEU flag, origin proof, crossing
  points and destination requirements. Cities resolve to a country through the
  existing gazetteer; the country must be in the fixture.
- **One question at a time, several answers accepted per reply**, and a reply
  may correct an earlier detail ("actually by air").
- **Client-held draft**: every response returns the draft; the client sends it
  back. The server re-validates the whole draft each turn. No new table.
- **The model only extracts**; deterministic validators decide.
- `/api/query` (one-shot) is kept for compatibility; the chat uses
  `/api/intake`.

## Order and rules

| # | Slot | Accept | Ask / reject |
|---|---|---|---|
| 1 | What | known commodity → category + HS | unknown goods declined by name; fresh-or-dried asked |
| 2 | How | mode published for (category, direction if known) | single published mode → stated, not asked; unpublished mode refused with valid options |
| 3 | How much | kg, t, wagons, containers → tonnes | ≤0 / unparseable / rail > 5,000 t / air > 500 t → re-ask; air > 10 t, air > 100 t, rail < 1 t → warn with "keep" / "switch" choices |
| 4 | From → To | both ends resolved; exactly one in UZ; partner in fixture | both UZ (domestic) or neither UZ (third-country) rejected; unknown place or country outside fixture → re-ask listing supported countries; country alone → main city, stated |
| — | Consistency | (category, direction, mode) has a procedure | route direction makes the mode unpublished (tea import by air) → mode re-asked with valid options |
| 5 | Confirm | summary + procedure + first country notes | "Create case" / "Change <detail>" |

Tea: export by train (868) or air (540); import by train (477). Dried fruits and
fresh produce: export by train only.

## Contract

```ts
type IntakeDraft = {
  commodity: { term; category; hs } | null;
  mode: "train" | "air" | null;
  quantity: { value; unit; tonnes; acknowledged: boolean } | null;
  origin: { name; country; assumed: boolean } | null;
  destination: { name; country; assumed: boolean } | null;
  direction: "export" | "import" | null;
};
type IntakeTurn = {
  status: "asking" | "confirm" | "declined" | "opened";
  draft: IntakeDraft;
  slot?: "commodity" | "mode" | "quantity" | "route";
  message: string;            // the question, rejection or summary
  options?: { label; reply }[];
  notes?: string[];           // warnings, assumptions, country notes
  summary?: { what; how; howMuch; route; procedureId; title; steps };
  caseId?: string;            // when opened
};
```

`POST /api/intake {message, draft}` → `IntakeTurn`;
`POST /api/intake {draft, confirm: true}` → re-validates, opens the case, returns
`status: "opened"` with `caseId`.

## Modules

- `lib/intake/draft.ts` — `IntakeDraft`, `mergeReply(draft, text, facts?)`.
- `lib/intake/validate.ts` — `modesFor`, `checkQuantity`, `checkRoute`.
- `lib/intake/conversation.ts` — `nextTurn(draft)`: first missing or invalid
  slot, else confirm.
- `app/data/countries.ts` — the fixture.
- Compliance & Risk country notes read the fixture (origin proof, crossings,
  destination requirements) instead of the hard-coded EAEU/CIS/EU sets.

## UI

Chat shows a "Shipment so far" card (What / How / How much / From → To, ticking
as filled), the current question with chips, notes, then the confirm card with
"Create case" and per-row "Change".

## Testing

- "I want to move tea" → mode question offering train and air only.
- Dried fruits → mode stated as train, not asked; "dried fruits by air" refused.
- Quantity: "0 t" and "9000 t by rail" re-asked; "40 t by air" warns; "3 wagons"
  converts.
- Route: "Tashkent to Samarkand" rejected (domestic); "Almaty to Moscow"
  rejected (no UZ end); "to Germany" re-asked (not in fixture); "China to
  Tashkent" by air for tea → mode re-asked (import is train only).
- Multi-answer reply fills several slots; correction overwrites.
- Confirm returns summary with 868 for tea/train/60 t/Tashkent→Moscow; confirm
  opens the case.
- Browser: full conversation to a created case.
