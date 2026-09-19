"""Hugging Face Inference Endpoint handler for the UzTrade DocAI pipeline."""

from __future__ import annotations

import base64
import os
from typing import Any

from docai import pipeline


class EndpointHandler:
    def __init__(self, path: str = ""):
        del path
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
