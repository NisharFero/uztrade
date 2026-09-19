"""Hugging Face Inference Endpoint handler for the UzTrade DocAI pipeline.

The endpoint unpacks the model repository next to this file, so this file's own
directory is the repository root and `models/` beside it holds the weights that
`scripts/build_hf_repo.py` vendored. `docai.pipeline` reads its cache location
and QA model at import time, so both are set before it is imported.
"""

from __future__ import annotations

import base64
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent
VENDORED_QA = REPO / "models" / "qa"

# The unpacked repository is not a safe place to write, and both EasyOCR and
# transformers want a cache. Vendored weights are used when the build script
# put them in the repository; otherwise the pipeline downloads them as usual.
os.environ.setdefault("DOCAI_CACHE", str(Path(tempfile.gettempdir()) / "docai-cache"))
if VENDORED_QA.is_dir():
    os.environ.setdefault("DOCAI_QA_MODEL", str(VENDORED_QA))

from docai import pipeline  # noqa: E402  the environment above has to come first


def stage_easyocr_weights(root: Path) -> None:
    """Copies vendored EasyOCR weights into the cache so the reader never downloads."""
    vendored = root / "models" / "easyocr"
    if not vendored.is_dir():
        return
    pipeline.EASYOCR_DIR.mkdir(parents=True, exist_ok=True)
    for weight in vendored.glob("*.pth"):
        target = pipeline.EASYOCR_DIR / weight.name
        if not target.exists():
            shutil.copy2(weight, target)


class EndpointHandler:
    def __init__(self, path: str = ""):
        # `path` is the unpacked repository, the directory this file sits in.
        stage_easyocr_weights(Path(path) if path else REPO)
        if os.environ.get("DOCAI_WARM", "1") == "1":
            pipeline.reader()
            pipeline.qa()

    def __call__(self, data: dict[str, Any]) -> dict[str, Any]:
        payload = data.get("inputs", data)
        if not isinstance(payload, dict):
            raise ValueError("inputs must be an object")

        encoded = payload.get("file_base64")
        spec = payload.get("spec")
        if not isinstance(encoded, str) or not isinstance(spec, dict):
            raise ValueError("inputs.file_base64 and inputs.spec are required")

        try:
            document = base64.b64decode(encoded, validate=True)
        except ValueError as error:
            raise ValueError("inputs.file_base64 is invalid") from error
        if not document:
            raise ValueError("document is empty")

        return pipeline.parse(
            document,
            str(payload.get("filename") or "document"),
            str(payload.get("content_type") or "application/octet-stream"),
            spec,
        )
