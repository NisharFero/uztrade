---
license: mit
library_name: transformers
tags:
  - document-question-answering
  - ocr
  - custom_code
inference: true
---

# UzTrade DocAI Endpoint

Custom Hugging Face Inference Endpoint handler for the UzTrade document
pipeline: EasyOCR (Russian + English) for words and boxes, then
[`impira/layoutlm-document-qa`](https://huggingface.co/impira/layoutlm-document-qa)
for one question per requested field. `handler.py` receives a base64 document
plus the UzTrade field specification and returns the same JSON contract as the
local DocAI service.

This repository is built by `apps/docai/scripts/build_hf_repo.py` in the UzTrade
repository. Do not edit it by hand — rebuild and push.

## Layout

```text
handler.py            EndpointHandler (HF custom handler entry point)
requirements.txt      inference dependencies
docai/pipeline.py     the OCR + layout QA pipeline, copied unchanged
models/easyocr/       EasyOCR detector and recogniser weights
models/qa/            impira/layoutlm-document-qa snapshot
```

`models/` is optional. When it is present the endpoint boots offline; when it is
absent the pipeline downloads both models on first use, which makes the first
request slow and repeats on every replica.

## Request

```json
{
  "inputs": {
    "file_base64": "<base64 of the document>",
    "filename": "invoice.pdf",
    "content_type": "application/pdf",
    "spec": { "fields": [] }
  }
}
```

Base64 inflates the payload by about a third, so the caller's 15 MB file limit
lands near 20 MB on the wire.

## Response

`fields`, `pages`, `readability`, `text`, `models` and `timings` — identical to
the local service, so the web app cannot tell the two providers apart.

## Settings

| Variable | Purpose |
|---|---|
| `DOCAI_WARM` | `1` (default) loads both models during startup; `0` defers to the first request |
| `DOCAI_CACHE` | writable cache directory; defaults to the system temp directory |
| `DOCAI_QA_MODEL` | overrides the QA model; set automatically when `models/qa` is vendored |
