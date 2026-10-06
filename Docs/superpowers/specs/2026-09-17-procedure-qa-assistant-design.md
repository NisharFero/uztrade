# Procedure Q&A Assistant - Design

Status: approved 2026-09-17.

## Goal

Let the case assistant answer procedure questions from the current case and the
published procedure data:

- current step and current stage;
- documents and values needed now or before starting;
- fields required in a named document;
- expected remaining time and entity review status;
- procedure selection for goods such as tomato, brinjal and apple, including
  spelling mistakes and confirmation when the correction is fuzzy.

## Architecture

Add a pure `modules/steps/procedure-qa.ts` module. It consumes the existing
`AssistantView`, `Procedure`, `WorkflowProjection`, ledger-derived document
state and commodity taxonomy. It returns a structured answer that the API and UI
can show without changing workflow state.

`POST /api/cases/[id]/assistant` gets a new `ask` action:

```ts
{ action: "ask", question: string }
```

The response remains the refreshed `AssistantView`, with an optional `answer`
field attached. The UI shows the answer under a small "Ask about this procedure"
form in the step assistant.

## Reasoning Rules

- Use current case state first. "What step am I in?" names `view.next`, the
  block/stage and whether it is waiting on the user, the agent or the goods.
- Use published procedure data for stages, documents and field specs. Do not
  invent documents, fees, websites or entity SLAs.
- For entity approval timing, report live portal status when available and the
  remaining scheduled procedure range. If no entity SLA exists, say that the app
  can track review status but the published procedure does not give an approval
  SLA.
- Goods mapping uses the deterministic commodity taxonomy. A confident known
  good returns the matching category and procedure option. A fuzzy spelling such
  as "tomota" asks for confirmation before selecting tomatoes. Unknown goods are
  declined by name.

## UI

The step assistant shows an input and submit button. Answers are plain text with
small bullets. No chat history is required in this change; each answer is scoped
to the current case and latest assistant view.

## Tests

- Procedure Q&A answers current step and stage from an open case.
- It lists current missing documents and upfront documents.
- It reports required fields for a named document from `DOC_SPECS`.
- It reports entity timing without inventing an SLA.
- It maps tomato, brinjal and apple to procedure 325.
- It asks confirmation for misspelled "tomota".
