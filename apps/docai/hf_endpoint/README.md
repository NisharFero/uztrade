---
inference: true
---

# UzTrade DocAI Endpoint

Custom Hugging Face Inference Endpoint handler for EasyOCR plus
`impira/layoutlm-document-qa`. `handler.py` receives a base64 document and the
UzTrade field specification and returns the same JSON contract as local DocAI.

The model repository must contain:

```text
handler.py
requirements.txt
docai/__init__.py
docai/pipeline.py
```
