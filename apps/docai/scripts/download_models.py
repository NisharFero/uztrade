"""Downloads the OCR and layout QA models into apps/docai/.cache (on D:).

The Hugging Face key from apps/.env authenticates the download; inference is
local afterwards.
"""

import time

from docai import pipeline

started = time.time()
print("cache:", pipeline.CACHE)
print("loading EasyOCR", pipeline.OCR_LANGS, "...", flush=True)
pipeline.reader()
print("loading", pipeline.QA_MODEL, "...", flush=True)
pipeline.qa()
print(f"ready in {time.time() - started:.0f}s")
