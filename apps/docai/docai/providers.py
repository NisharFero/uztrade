"""Select local inference or a hosted endpoint with the same /parse contract."""

from __future__ import annotations

import base64
import json
import os
from urllib import request

from . import pipeline


def provider_name() -> str:
    return os.environ.get("DOCAI_PROVIDER", "local_cpu")


def parse_document(data: bytes, filename: str | None, content_type: str | None, spec: dict) -> dict:
    provider = provider_name()
    if provider == "local_cpu":
        return pipeline.parse(data, filename, content_type, spec)
    if provider != "hf_endpoint":
        raise ValueError(f"Unsupported DOCAI_PROVIDER: {provider}")

    endpoint = os.environ.get("HF_ENDPOINT_URL", "").rstrip("/")
    token = os.environ.get("HF_API_KEY") or os.environ.get("HF_TOKEN")
    if not endpoint or not token:
        raise RuntimeError("HF_ENDPOINT_URL and HF_API_KEY are required for hf_endpoint")

    payload = json.dumps({
        "inputs": {
            "file_base64": base64.b64encode(data).decode("ascii"),
            "filename": filename or "document",
            "content_type": content_type or "application/octet-stream",
            "spec": spec,
        }
    }).encode()
    outgoing = request.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(outgoing, timeout=180) as response:
        result = json.load(response)
    if not isinstance(result, dict) or not all(key in result for key in ("fields", "pages", "readability")):
        raise ValueError("Hosted endpoint returned an invalid document response")
    return result
