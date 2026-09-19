import io
import json
import os
from unittest.mock import patch

from docai import providers


def test_local_provider_keeps_pipeline_contract():
    expected = {"fields": {}, "pages": [], "readability": {"readable": False}}
    with patch.dict(os.environ, {"DOCAI_PROVIDER": "local_cpu"}), patch.object(providers.pipeline, "parse", return_value=expected) as local:
        assert providers.parse_document(b"image", "scan.png", "image/png", {"fields": []}) == expected
        local.assert_called_once()


def test_remote_provider_sends_hugging_face_json_and_returns_contract():
    expected = {"fields": {}, "pages": [], "readability": {"readable": False}}

    def respond(outgoing, timeout):
        assert outgoing.full_url == "https://example.test"
        assert outgoing.get_header("Authorization") == "Bearer test-token"
        payload = json.loads(outgoing.data)
        assert payload["inputs"]["filename"] == "scan.png"
        assert payload["inputs"]["content_type"] == "image/png"
        assert payload["inputs"]["spec"] == {"fields": []}
        assert payload["inputs"]["file_base64"] == "aW1hZ2UgYnl0ZXM="
        assert timeout == 180
        return io.BytesIO(json.dumps(expected).encode())

    with patch.dict(os.environ, {"DOCAI_PROVIDER": "hf_endpoint", "HF_ENDPOINT_URL": "https://example.test", "HF_API_KEY": "test-token"}), patch.object(providers.request, "urlopen", side_effect=respond):
        assert providers.parse_document(b"image bytes", "scan.png", "image/png", {"fields": []}) == expected
