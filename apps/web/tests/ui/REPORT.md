# Browser UI report

Run against `http://localhost:3000` with installed Chrome via `puppeteer-core` at 1366×800 and 390×844. Screenshots are in the gitignored `tests/ui/output/` directory.

| Scenario | Desktop | Mobile | Notes |
|---|---:|---:|---|
| a. Start screen and four starters | Pass | Fail | Functional assertions pass; mobile strict run observed cancelled `/api/chat` streams while moving between starter subcases. |
| b. Explore yoghurt import | Fail | Fail | Ways, facts, asking state, chips, tile action and fact edit work. Reply is two rendered lines, not the required one line. |
| c. Estimate tea export | Fail | Fail | Ways, bars and follow-ups work; strict run observed a cancelled prior chat stream. |
| d. Cases waiting on me | Fail | Fail | Router classified the exact query as `other`, so no `.cases` card was rendered. |
| e. Procedure knowledge | Pass | Pass | Answer and source chips render. |
| f. One-question intake and open case | Fail | Fail | Intake, plan, case URL, opened line, case card and current step work; strict run observed cancelled chat/RSC streams during the SPA transition. |
| g. Step upload and advancement | Pass | Pass | Uploaded the filesystem demo matching the visible need; the next step/folded history appeared. |
| h. Agent rail | Pass | Pass | Every agent card opens; available focus actions run. |
| i. All requested pages | Pass | Pass | All ten routes rendered without page errors or 5xx responses. |
| j. New shipment and folded nav | Fail | Fail | Reset works, but the SPA reset cancels an in-flight RSC request and therefore fails the strict request-failure gate. |

Strict viewport result: **9 passed, 11 failed (20 runs)**. Functional result excluding browser-reported `net::ERR_ABORTED` cancellation during intentional SPA navigation: **8 passed, 2 failed scenarios** (`b`, `d`). No console error, page error, hang, or 5xx was observed.

## Product gaps outside the assigned edit area

- `modules/assistant/router.ts`: the exact query “Which shipments are waiting on me?” routes as `other`, although the starter uses that exact text. Reproduce by POSTing it to `/api/chat`; the route event has `intent: "other"` and no cases result.
- `modules/assistant/say.ts`: Explore renders a status sentence and a separate question paragraph, violating the one-line reply requirement.
- Client navigation cancels vinext `/api/chat` and `.rsc` requests with `net::ERR_ABORTED`; strict browser QA records these even though the destination renders successfully.
