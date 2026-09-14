"""UzTrade Document AI pipeline.

OCR (EasyOCR, Russian + English) -> words with boxes -> two independent readings
per field:
  * LayoutLM document question answering (impira/layoutlm-document-qa) over the
    OCR words and their boxes - no Tesseract;
  * bilingual label anchors taken from the published specimens: the value on the
    same line after the label, to its right, or directly below it.

The service only returns candidates with scores. The app validates each value
against the field's kind, scores and gates it, and asks the trader to confirm
anything uncertain. Nothing here is sent to an external API; the Hugging Face
key is only used to download the model.
"""

from __future__ import annotations

import io
import os
import re
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("DOCAI_CACHE", ROOT / ".cache"))
# Must be set before transformers / huggingface_hub are imported.
os.environ.setdefault("HF_HOME", str(CACHE / "hf"))

EASYOCR_DIR = CACHE / "easyocr"
QA_MODEL = os.environ.get("DOCAI_QA_MODEL", "impira/layoutlm-document-qa")
OCR_LANGS = ["ru", "en"]
# OCR cost scales with pixels while accuracy doesn't: an A4 300 dpi invoice read
# 10/11 known values at 1240 px in 16 s against 45 s at full size, and upscaling
# a 549 px thumbnail tripled the time without reading anything more (bench_*.py).
MAX_WIDTH = 1280
MAX_PAGES = 6
# An unreadable page (bench_readability.py): the thumbnails had text 6-8 px high and
# mean OCR confidence 0.11-0.13; readable pages 16-28.5 px and 0.75-0.77. Both must
# fail, so large-but-messy handwriting still gets read.
MIN_TEXT_HEIGHT = 11
MIN_CONFIDENCE = 0.35

_lock = threading.Lock()
_reader = None
_qa = None


def hf_token() -> str | None:
    token = os.environ.get("HF_API_KEY") or os.environ.get("HF_TOKEN")
    if token:
        return token
    env = ROOT.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("HF_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return None


def reader():
    global _reader
    with _lock:
        if _reader is None:
            import easyocr

            EASYOCR_DIR.mkdir(parents=True, exist_ok=True)
            _reader = easyocr.Reader(
                OCR_LANGS,
                gpu=False,
                model_storage_directory=str(EASYOCR_DIR),
                user_network_directory=str(EASYOCR_DIR / "user"),
                verbose=False,
            )
    return _reader


def qa():
    global _qa
    with _lock:
        if _qa is None:
            from transformers import pipeline

            _qa = pipeline("document-question-answering", model=QA_MODEL, token=hf_token(), device=-1)
    return _qa


def health_info() -> dict:
    return {
        "ok": True,
        "ocr": {"engine": "easyocr", "languages": OCR_LANGS, "loaded": _reader is not None},
        "qa": {"model": QA_MODEL, "loaded": _qa is not None},
        "cache": str(CACHE),
    }


# ------------------------------------------------------------------ pages ---


def load_pages(data: bytes, filename: str | None, content_type: str | None):
    from PIL import Image, ImageOps

    name = (filename or "").lower()
    if data[:4] == b"%PDF" or name.endswith(".pdf") or content_type == "application/pdf":
        import fitz

        pages = []
        with fitz.open(stream=data, filetype="pdf") as doc:
            for page in list(doc)[:MAX_PAGES]:
                pix = page.get_pixmap(dpi=200)
                pages.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
        return pages
    image = Image.open(io.BytesIO(data))
    return [ImageOps.exif_transpose(image).convert("RGB")]


def prepare(image):
    """Downscales large scans to the OCR width; never upscales."""
    from PIL import Image

    if image.width > MAX_WIDTH:
        scale = MAX_WIDTH / image.width
        image = image.resize((MAX_WIDTH, round(image.height * scale)), Image.LANCZOS)
    return image


# -------------------------------------------------------------------- ocr ---


def ocr(image) -> list[dict]:
    import numpy as np

    segments = []
    for box, text, conf in reader().readtext(np.array(image), detail=1, paragraph=False):
        text = str(text).strip()
        if not text:
            continue
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        segments.append({"text": text, "conf": float(conf), "box": [min(xs), min(ys), max(xs), max(ys)]})
    return segments


def readability(segments: list[dict]) -> dict:
    """Whether OCR found text worth asking questions of, with the measurements."""
    import statistics

    if not segments:
        return {"readable": False, "medianHeight": 0.0, "meanConfidence": 0.0, "reason": "No text was found on the page — upload a clearer scan"}
    median_height = statistics.median(s["box"][3] - s["box"][1] for s in segments)
    mean_confidence = statistics.mean(s["conf"] for s in segments)
    readable = not (median_height < MIN_TEXT_HEIGHT and mean_confidence < MIN_CONFIDENCE)
    reason = "" if readable else (
        f"Text is about {median_height:.0f} px high and OCR confidence is {mean_confidence:.2f} — "
        "upload a clearer scan (about 150 dpi or more)"
    )
    return {"readable": readable, "medianHeight": round(median_height, 1), "meanConfidence": round(mean_confidence, 2), "reason": reason}


def center_y(segment: dict) -> float:
    return (segment["box"][1] + segment["box"][3]) / 2


def lines_of(segments: list[dict]) -> list[list[dict]]:
    """Groups segments whose vertical centres overlap into reading-order lines."""
    lines: list[list[dict]] = []
    for seg in sorted(segments, key=lambda s: (center_y(s), s["box"][0])):
        height = seg["box"][3] - seg["box"][1]
        for line in lines:
            ref = line[0]
            if abs(center_y(ref) - center_y(seg)) < max(height, ref["box"][3] - ref["box"][1]) * 0.5:
                line.append(seg)
                break
        else:
            lines.append([seg])
    return [sorted(line, key=lambda s: s["box"][0]) for line in lines]


def normalise(value: float, size: int) -> int:
    return max(0, min(1000, int(round(1000 * value / max(size, 1)))))


def words_of(segments: list[dict], width: int, height: int) -> list[tuple[str, list[int]]]:
    """Splits OCR segments into words; each word gets a proportional slice of the
    segment's box, normalised to 0-1000 as LayoutLM expects."""
    words = []
    for line in lines_of(segments):
        for seg in line:
            tokens = seg["text"].split()
            x0, y0, x1, y1 = seg["box"]
            total = sum(len(t) for t in tokens) + max(len(tokens) - 1, 0)
            cursor = 0
            for token in tokens:
                start = x0 + (x1 - x0) * cursor / max(total, 1)
                cursor += len(token)
                end = x0 + (x1 - x0) * cursor / max(total, 1)
                cursor += 1
                words.append((token, [normalise(start, width), normalise(y0, height), normalise(end, width), normalise(y1, height)]))
    return words


# ------------------------------------------------------------- candidates ---


def ask(image, words, questions: list[str]) -> dict | None:
    best = None
    for question in questions:
        try:
            answers = qa()(image=image, question=question, word_boxes=words, top_k=1)
        except Exception:  # one field's failure must not sink the document
            continue
        if isinstance(answers, dict):
            answers = [answers]
        for answer in answers or []:
            value = str(answer.get("answer") or "").strip()
            if not value:
                continue
            score = float(answer.get("score") or 0)
            if best is None or score > best["score"]:
                best = {"value": value, "score": score, "source": "layoutlm", "question": question}
    return best


def anchor_candidates(segments: list[dict], patterns: list[str], label_patterns: list[re.Pattern]) -> list[dict]:
    def is_label(text: str) -> bool:
        return any(p.search(text) for p in label_patterns)

    out = []
    for pattern in patterns:
        try:
            rx = re.compile(pattern, re.IGNORECASE)
        except re.error:
            continue
        for seg in segments:
            match = rx.search(seg["text"])
            if not match:
                continue
            lx0, ly0, lx1, ly1 = seg["box"]
            height = max(ly1 - ly0, 1)

            rest = seg["text"][match.end():].strip(" :.-—№#\t/")
            if len(rest) >= 2 and not is_label(rest):
                out.append({"value": rest, "score": 0.75 * seg["conf"], "source": "anchor-inline", "anchor": pattern})

            right = [
                t for t in segments
                if t is not seg and t["box"][0] >= lx1 - 4 and abs(center_y(t) - center_y(seg)) < height * 0.7
            ]
            if right:
                nearest = min(right, key=lambda t: t["box"][0] - lx1)
                if not is_label(nearest["text"]):
                    out.append({"value": nearest["text"], "score": 0.7 * nearest["conf"], "source": "anchor-right", "anchor": pattern})

            below = [
                t for t in segments
                if t is not seg
                and 0 <= t["box"][1] - ly1 < 3.5 * height
                and t["box"][0] < lx1
                and t["box"][2] > lx0
            ]
            if below:
                nearest = min(below, key=lambda t: t["box"][1])
                if not is_label(nearest["text"]):
                    out.append({"value": nearest["text"], "score": 0.55 * nearest["conf"], "source": "anchor-below", "anchor": pattern})
    out.sort(key=lambda c: -c["score"])
    return out[:4]


# ------------------------------------------------------------------ parse ---


def parse(data: bytes, filename: str | None, content_type: str | None, spec: dict) -> dict:
    started = time.time()
    fields = spec.get("fields") or []
    label_patterns = []
    for f in fields:
        for pattern in f.get("anchors") or []:
            try:
                label_patterns.append(re.compile(pattern, re.IGNORECASE))
            except re.error:
                pass

    result = {f["key"]: {"candidates": []} for f in fields}
    pages, texts, verdicts = [], [], []
    ocr_ms = qa_ms = 0

    for index, raw in enumerate(load_pages(data, filename, content_type)):
        image = prepare(raw)
        t0 = time.time()
        segments = ocr(image)
        ocr_ms += int((time.time() - t0) * 1000)
        pages.append({"width": image.width, "height": image.height, "segments": len(segments)})
        texts.append("\n".join(" ".join(s["text"] for s in line) for line in lines_of(segments)))

        verdict = readability(segments)
        verdicts.append(verdict)
        if not verdict["readable"]:
            continue  # questions over garbled text cost ~7 s each and return junk

        words = words_of(segments, image.width, image.height)
        t1 = time.time()
        for f in fields:
            candidates = result[f["key"]]["candidates"]
            if words and f.get("questions"):
                answer = ask(image, words, f["questions"])
                if answer:
                    answer["page"] = index
                    candidates.append(answer)
            for candidate in anchor_candidates(segments, f.get("anchors") or [], label_patterns):
                candidate["page"] = index
                candidates.append(candidate)
        qa_ms += int((time.time() - t1) * 1000)

    for entry in result.values():
        entry["candidates"] = sorted(entry["candidates"], key=lambda c: -c["score"])[:5]

    readable_pages = [v for v in verdicts if v["readable"]]
    return {
        "docType": spec.get("docType"),
        "readability": readable_pages[0] if readable_pages else (verdicts[0] if verdicts else readability([])),
        "pages": pages,
        "text": "\n\n".join(texts),
        "fields": result,
        "timings": {"ocr_ms": ocr_ms, "fields_ms": qa_ms, "total_ms": int((time.time() - started) * 1000)},
        "models": {"ocr": f"easyocr {'+'.join(OCR_LANGS)}", "qa": QA_MODEL},
    }
