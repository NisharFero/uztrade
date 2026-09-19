"""Select local inference or a hosted endpoint with the same /parse contract."""

from __future__ import annotations

import json
import os
import uuid
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

    boundary = uuid.uuid4().hex
    file_header = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"{(filename or 'document').replace(chr(34), '')}\"\r\n"
        f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n"
    ).encode()
    spec_part = (
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"spec\"\r\n\r\n"
        + json.dumps(spec)
        + f"\r\n--{boundary}--\r\n"
    ).encode()
    target = endpoint if endpoint.endswith("/parse") else f"{endpoint}/parse"
    outgoing = request.Request(
        target,
        data=file_header + data + spec_part,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with request.urlopen(outgoing, timeout=180) as response:
        result = json.load(response)
    if not isinstance(result, dict) or not all(key in result for key in ("fields", "pages", "readability")):
        raise ValueError("Hosted endpoint returned an invalid document response")
    return result
