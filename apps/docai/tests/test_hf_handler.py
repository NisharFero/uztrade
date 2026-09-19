import base64
import os
from unittest.mock import patch

from hf_endpoint.handler import EndpointHandler


def test_handler_decodes_document_and_preserves_contract():
    expected = {"fields": {}, "pages": [], "readability": {"readable": False}}
    request = {
        "inputs": {
            "file_base64": base64.b64encode(b"image bytes").decode("ascii"),
            "filename": "scan.png",
            "content_type": "image/png",
            "spec": {"fields": []},
        }
    }
    with patch.dict(os.environ, {"DOCAI_WARM": "0"}), patch("hf_endpoint.handler.pipeline.parse", return_value=expected) as parse:
        assert EndpointHandler()(request) == expected
        parse.assert_called_once_with(b"image bytes", "scan.png", "image/png", {"fields": []})
