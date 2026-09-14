"""Fast checks for the pipeline's pure helpers - no models are loaded.

    .venv/Scripts/python test_pipeline.py
"""

from PIL import Image

import pipeline


def test_large_scans_are_downscaled_to_the_ocr_width():
    # A4 at 300 dpi: same OCR accuracy at 1240 px, a third of the time (bench_resolution.py).
    page = Image.new("RGB", (2480, 3508), "white")
    prepared = pipeline.prepare(page)
    assert prepared.width <= pipeline.MAX_WIDTH, prepared.width
    assert abs(prepared.height / prepared.width - 3508 / 2480) < 0.01


def test_small_images_are_not_upscaled():
    # Upscaling the 549 px specimen tripled OCR time and read nothing more (bench.py).
    thumb = Image.new("RGB", (549, 750), "white")
    assert pipeline.prepare(thumb).size == (549, 750)


def tiny_segments():
    # Like the KZ phytosanitary / TD1 / offer-agreement thumbnails: text 6-8 px, confidence 0.11-0.13.
    return [{"text": "xx", "conf": 0.1, "box": [0, i * 10, 40, i * 10 + 8]} for i in range(20)]


def test_thumbnail_ocr_is_flagged_unreadable():
    verdict = pipeline.readability(tiny_segments())
    assert verdict["readable"] is False, verdict
    assert "8 px" in verdict["reason"], verdict


def test_readable_page_passes():
    # Contract specimen: 16 px, 0.77. Synthetic A4 invoice: 28.5 px, 0.75.
    page = [{"text": "Commercial invoice", "conf": 0.8, "box": [0, i * 30, 400, i * 30 + 16]} for i in range(20)]
    assert pipeline.readability(page)["readable"] is True


def test_tall_but_low_confidence_text_is_not_rejected():
    # Handwriting can read poorly yet be large; only small AND low-confidence text is rejected.
    scrawl = [{"text": "abc", "conf": 0.2, "box": [0, i * 40, 300, i * 40 + 30]} for i in range(20)]
    assert pipeline.readability(scrawl)["readable"] is True


def test_no_text_is_unreadable():
    assert pipeline.readability([])["readable"] is False


def test_unreadable_page_skips_layout_questions():
    called = []
    original = (pipeline.load_pages, pipeline.ocr, pipeline.qa)
    try:
        pipeline.load_pages = lambda *_: [Image.new("RGB", (549, 750), "white")]
        pipeline.ocr = lambda _image: tiny_segments()
        pipeline.qa = lambda: called.append("qa") or (lambda **_: [])
        result = pipeline.parse(
            b"x", "thumb.jpg", "image/jpeg",
            {"fields": [{"key": "issue_date", "questions": ["What is the date?"], "anchors": ["xx"]}]},
        )
        assert result["readability"]["readable"] is False, result["readability"]
        assert result["fields"]["issue_date"]["candidates"] == [], result["fields"]
        assert called == [], "LayoutLM must not run on an unreadable page"
    finally:
        pipeline.load_pages, pipeline.ocr, pipeline.qa = original


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS", name)
            except Exception as error:  # report every test, not just the first failure
                failures += 1
                print("FAIL", name, "-", repr(error))
    raise SystemExit(1 if failures else 0)
