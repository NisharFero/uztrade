import base64
import os
from unittest.mock import patch

import pytest

from hf_endpoint import handler
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


def test_handler_stages_vendored_easyocr_weights_into_the_cache(tmp_path, monkeypatch):
    vendored = tmp_path / "repo" / "models" / "easyocr"
    vendored.mkdir(parents=True)
    (vendored / "craft_mlt_25k.pth").write_bytes(b"detector")
    cache = tmp_path / "cache" / "easyocr"
    monkeypatch.setattr(handler.pipeline, "EASYOCR_DIR", cache)

    handler.stage_easyocr_weights(tmp_path / "repo")

    assert (cache / "craft_mlt_25k.pth").read_bytes() == b"detector"


def test_handler_leaves_the_cache_alone_when_no_weights_are_vendored(tmp_path, monkeypatch):
    cache = tmp_path / "cache" / "easyocr"
    monkeypatch.setattr(handler.pipeline, "EASYOCR_DIR", cache)

    handler.stage_easyocr_weights(tmp_path / "empty")

    assert not cache.exists()


def test_handler_rejects_a_payload_without_a_document():
    with patch.dict(os.environ, {"DOCAI_WARM": "0"}):
        endpoint = EndpointHandler()
    with pytest.raises(ValueError):
        endpoint({"inputs": {"spec": {"fields": []}}})
