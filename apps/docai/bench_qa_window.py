"""Hypothesis H2: LayoutLM is slow because every question tokenises the whole
page, and Cyrillic OCR words blow up to ~7 byte-level tokens each, so one
question becomes many 512-token windows.

Test: OCR the document once, then ask each field's question over
  (a) all words on the page, and
  (b) only the words on the few lines around the field's label anchor.
Report tokens, windows, seconds and whether the answer contains the known value.

    .venv/Scripts/python bench_qa_window.py eval/specimens/synthetic-invoice-a4.png
"""

import re
import sys
import time

from PIL import Image

import pipeline

# Commercial invoice fields: question, anchors (as in document-specs.ts), known value.
FIELDS = [
    ("invoice_no", "What is the invoice number?", [r"номер сч[её]та", r"invoice\s*(no|number|№)"], "inv-2026/0457"),
    ("invoice_date", "What is the invoice date?", [r"дата", r"date"], "12.09.2026"),
    ("seller", "Who is the sender company?", [r"отправитель", r"sent by"], "samarkand"),
    ("buyer", "Who is the recipient company?", [r"получатель", r"sent to"], "московский"),
    ("goods", "What is the description of goods?", [r"описание товар", r"description of goods"], "black tea"),
    ("hs_code", "What is the customs commodity code?", [r"commodity code", r"таможенная спецификация"], "0902"),
    ("quantity", "What is the total net weight?", [r"total net weight", r"вес нетто"], "60 000"),
    ("total_value", "What is the total value?", [r"total value", r"всего"], "192 000"),
    ("currency", "What is the currency of invoice?", [r"currency of invoice", r"валюта"], "usd"),
    ("incoterms", "What are the terms of transportation?", [r"incoterms", r"инкотермс"], "fca"),
]
RADIUS = 1  # lines above and below the anchor line


def window(segments, anchors, width, height):
    lines = pipeline.lines_of(segments)
    rx = [re.compile(a, re.IGNORECASE) for a in anchors]
    hit_rows = [i for i, line in enumerate(lines) if any(r.search(" ".join(s["text"] for s in line)) for r in rx)]
    if not hit_rows:
        return None
    keep = sorted({j for i in hit_rows for j in range(max(0, i - RADIUS), min(len(lines), i + RADIUS + 1))})
    return pipeline.words_of([s for j in keep for s in lines[j]], width, height)


def ask(qa, image, question, words):
    tokens = len(qa.tokenizer(question.split(), [w for w, _ in words], is_split_into_words=True, truncation=False)["input_ids"])
    windows = max(1, -(-max(tokens - 256, 1) // 256))
    started = time.time()
    answer = qa(image=image, question=question, word_boxes=words, top_k=1)
    elapsed = time.time() - started
    if isinstance(answer, list):
        answer = answer[0] if answer else {}
    return tokens, windows, elapsed, str(answer.get("answer", "")), float(answer.get("score", 0) or 0)


image = pipeline.prepare(Image.open(sys.argv[1]).convert("RGB"))
started = time.time()
segments = pipeline.ocr(image)
print(f"OCR {image.width}x{image.height}: {len(segments)} segments in {time.time() - started:.1f}s", flush=True)

qa = pipeline.qa()
all_words = pipeline.words_of(segments, image.width, image.height)
totals = {"full": [0.0, 0], "window": [0.0, 0]}

for key, question, anchors, truth in FIELDS:
    t_tok, t_win, t_s, t_ans, t_score = ask(qa, image, question, all_words)
    ok_full = truth in t_ans.lower()
    totals["full"][0] += t_s
    totals["full"][1] += ok_full
    words = window(segments, anchors, image.width, image.height)
    if words:
        w_tok, w_win, w_s, w_ans, w_score = ask(qa, image, question, words)
        ok_win = truth in w_ans.lower()
        totals["window"][0] += w_s
        totals["window"][1] += ok_win
        win = f"window {w_tok:4d} tok {w_s:5.1f}s {'OK ' if ok_win else 'no '} {w_ans!r} ({w_score:.2f})"
    else:
        win = "window: anchor not found"
    print(f"{key:12s} full {t_tok:5d} tok ~{t_win}w {t_s:5.1f}s {'OK ' if ok_full else 'no '} {t_ans!r} ({t_score:.2f}) | {win}", flush=True)

n = len(FIELDS)
print(f"TOTAL full: {totals['full'][0]:.1f}s, {totals['full'][1]}/{n} correct | window: {totals['window'][0]:.1f}s, {totals['window'][1]}/{n} correct", flush=True)
