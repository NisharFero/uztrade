# Document Intelligence report

## Corpus result

The audit ran the production `parseUploadedDocument → composeDocument → validation gates` path for every typed demo file after forcing the external reader offline, which exercises the deterministic demo fallback used when DocAI is unavailable.

| Measure | Result |
|---|---:|
| Referenced PNGs retained | 274 |
| Typed demo files audited | 197 |
| Document types audited | 28 |
| Files with every required field accepted | 154 |
| Files with required fields open | 43 |
| Unreferenced PNGs deleted | 205 |

The 43 failures are concentrated in 12 types. Their scenario entries have no field values for the new specs, so the fallback has no evidence to accept. These need regeneration/correction in Claude-owned `modules/demo/data/**` and, where anchors are specimen-free, review in restricted `modules/documents/specs.ts`.

| Document type | Failing files | Required fields never supplied/matched |
|---|---:|---|
| `cmr_note` | 2 | Carrier (box 16) |
| `tir_carnet` | 3 | Carnet number, holder, valid until |
| `drivers_licence` | 1 | Holder, licence number, categories, valid until |
| `vehicle_registration` | 3 | Plate, VIN/chassis, owner |
| `cargo_control_book` | 4 | Number, issue date, destination customs office |
| `atp_certificate` | 2 | Certificate number, vehicle registration, valid until |
| `carriage_permit` | 3 | Permit number, country, valid until |
| `service_contract` | 13 | Contract number/date, provider, client |
| `funds_certificate` | 5 | Bank, account holder, amount, date |
| `transit_declaration` | 1 | Declaration number/date, departure and destination customs offices |
| `quality_certificate` | 4 | Certificate number, issue date, product |
| `registration_certificate` | 2 | Registration number, product |

## Upload safety

- Empty image: `400` JSON error (`The uploaded file is empty`).
- Non-image/PDF: `415` JSON error naming accepted formats.
- Over 15 MB: `413 Payload Too Large` from vinext before route execution; clear and non-HTML, but not the route's richer JSON `15 MB` message.
- Unreadable image: returns a reviewable record with `parseError`; no crash.
- Wrong document type: required fields remain missing/reviewable; no auto-accept and no crash.

The browser step scenario also exercised the real `POST /api/cases/<id>/documents` endpoint with a demo file and observed step advancement/folding on both viewports.
