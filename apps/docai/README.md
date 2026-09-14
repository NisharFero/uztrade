# UzTrade Document AI

Local service that reads uploaded trade documents for the Document Intelligence
agent. Field lists come from the published specimens
(`Docs/research/2026-09-13-document-specimens-rnd.md`).

| Stage | Model | Notes |
|---|---|---|
| Input | PIL / PyMuPDF (200 dpi) | scans wider than 1280 px are downscaled; small images are left as they are |
| OCR | EasyOCR, Russian + English | Cyrillic and Latin in one pass; words, boxes, confidence |
| Layout QA | `impira/layoutlm-document-qa` (MIT) | one question per field over OCR words + boxes |
| Label anchors | — | bilingual box labels from the specimens |

The service returns candidates only; the web app validates, scores, gates
(≥0.80 accepted, 0.50–0.80 review, <0.50 missing) and cross-checks. No document
content leaves the machine; the Hugging Face key only authenticates downloads.

## Findings (i5-1135G7, 4 cores, no GPU)

Measured with `bench.py`, `bench_resolution.py`, `bench_qa_window.py` and
`bench_readability.py`; numbers are from those runs, not estimates.

| Finding | Evidence | Decision |
|---|---|---|
| OCR misses on the eval specimens come from the images, not EasyOCR | KZ phytosanitary thumbnail (549 px, text ~8 px): 0/7 known values at every setting. Contract specimen (778 px, text ~16 px): 7/9. Synthetic Russian/English invoice at A4: 10/11 | Treat specimen thumbnails as worst case; measure real-resolution accuracy on the synthetic invoice too |
| OCR time scales with pixels; accuracy doesn't | Synthetic invoice: 44.7 s at 2480 px, 15.9 s at 1240 px, both 10/11. Upscaling the thumbnail 549→1600 px: 13 s → 46 s, still 0/7. Recognition batch 16: no gain | Cap width at 1280 px, never upscale (`MAX_WIDTH`, `test_pipeline.py`) |
| LayoutLM slowness on unreadable pages is token blow-up | Garbled Cyrillic: 7.3 tokens per word vs 1.4 for English labels, so ~7 s per question | Not a code fix — see the readability guard |
| LayoutLM on a readable page is usable | Synthetic invoice, whole page: 690 tokens, ~1.9 s per question, 6/10 exact answers with scores 0.78–1.00 | Keep whole-page questions |
| Asking over only the lines around a label is faster but unreliable | 2.4 s vs 18.9 s for 10 fields, 5/10 correct, and correct answers scored 0.00–0.10 | Rejected: the confidence gate would discard its correct answers |
| OCR reads zero as the letter "О" inside numbers | "60 00О kg", "192 0ОО.00" | Fixed in the app's validators for numeric kinds only (`fixDigitConfusions`) |
| Unreadable pages can be told apart before asking questions | Median OCR text height / mean confidence — KZ phytosanitary 8 px / 0.11, TD1 6 px / 0.12, offer agreement 8 px / 0.13; contract 16 px / 0.77, synthetic invoice 28.5 px / 0.75. Tokens per word don't separate them (5.25 vs 5.33) | A page is unreadable only when text is under 11 px **and** confidence under 0.35: LayoutLM and anchors are skipped and the trader is told to upload a clearer scan |
| OCR runs bilingual titles together | Synthetic invoice title "СЧЕТ/INVOICE" read as "CЧЕTIINVOICE" (slash → "I"), so a word-bounded "invoice" missed it and "SMGS" on line 8 decided the type | Invoice title pattern has no leading word boundary; earliest title wins (`detectDocType`) |
| The layout model's score isn't OCR's accuracy | Handwritten import SMGS (page OCR confidence 0.30): "6202" at 1.00 for a 68,000 kg weight | LayoutLM scores scaled by page OCR confidence relative to 0.6 — after this, 0 wrong values auto-accepted on the specimens (was 3) |
| One model answer can land in two counterparty fields | Synthetic invoice: seller's name also given as buyer (0.82) | Kept only where the field's own label line agrees; synthetic invoice now 10/10 |
| Batched pipeline calls crash | Transformers `select_starts_ends` broadcast error on multi-window inputs | Questions run sequentially |

## Setup (Windows, caches on D:)

```sh
python -m venv .venv
.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python download_models.py
```

## Run

```sh
./run.sh        # or: powershell -File run.ps1
curl http://127.0.0.1:8765/health
```

The web app calls `DOCAI_URL` (default `http://127.0.0.1:8765`).
