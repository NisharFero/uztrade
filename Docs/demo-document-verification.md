# Demo document verification

Checked on 8 October 2026. These are fictional, visibly marked demo documents.

| Procedure | Published procedure | Documents | Source-value checks |
|---|---|---:|---|
| 57 | Import of animal or vegetable fertilizers by road | 37 | Pass |
| 161 | Clearance of fruit and vegetable juices by road | 14 | Pass |
| 306 | Export of dried fruits by train | 32 | Pass |
| 325 | Export of fresh fruits and vegetables by train | 31 | Pass |
| 477 | Import of tea by train | 29 | Pass |
| 540 | Export of tea by air | 30 | Pass |
| 707 | Import of animal or vegetable fertilizers by train | 38 | Pass |
| 782 | Arrange cargo transportation by train via Single Window online portal | 11 | Pass |
| 868 | Export of tea by train | 38 | Pass |
| 924 | Arrange cargo delivery by train physically | 14 | Pass |

Total: **274 image files**, including **197 documents with a field specification**.

Verified:

- Every image decodes and meets the minimum 1240 × 1754 pixel demo resolution.
- Every required field on typed documents passes the real upload fallback and field validators.
- Quantity, goods, destination, HS code, receipt amount, currency, and party checks report no mismatches or unknown results where applicable.
- All ten demo workflows complete through the deterministic orchestrator evaluation.
- Document and value coverage exists for every step and every variant of these ten procedures.

Changes:

- Filled previously empty fields for vehicle registrations, driving licences, carriage permits, TIR carnets, ATP certificates, service contracts, cargo control books, transit declarations, funds certificates, quality certificates, and product registrations.
- Rendered affected reference documents with large field values and separate labels. Documents remain visibly fictional.
- Removed descriptive carrier suffixes that were mistaken for blank-form labels.
- Corrected floating-point comparisons at the existing 2% quantity tolerance; values beyond 2% still fail.

Limits:

- Source-value and fallback checks are deterministic fixture checks, **not live OCR verification**. The configured Document AI service refused the connection during this audit.
- Documents without a field specification are checked for image integrity and workflow coverage, not field-level extraction accuracy.
- The older `apps/docai/eval/report-demo-868.json` contains OCR failures and has not been replaced by a fresh OCR run. It must not be treated as a passing result.
- The other catalogue procedures do not have their own complete demo packs; generic sample reuse is not a procedure-specific pack.

Reproduce from `apps/web`:

```sh
node --import tsx scripts/demo/audit-packs.ts
node --import tsx evals/run.ts --suite demo-workflow --offline
npm run test:unit
```

The full per-document audit is written to `/tmp/uztrade-demo-document-audit.json` by default. Pass an output path as the first argument to retain it elsewhere.
