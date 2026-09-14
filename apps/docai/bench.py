"""Where parsing time goes, and how OCR settings change what is actually read.

    .venv/Scripts/python bench.py eval/specimens/kz-phytosanitary-certificate.jpg triticum фосфин 02.03.2021 68,75 янгиюль

Truth strings are values known to be printed on the specimen; a hit means the OCR
text contains them (case-insensitive).
"""

import sys
import time

import numpy as np
import torch
from PIL import Image

import pipeline

path = sys.argv[1]
truth = [s.lower() for s in sys.argv[2:]]
print("torch threads:", torch.get_num_threads(), flush=True)

raw = pipeline.load_pages(open(path, "rb").read(), path, None)[0]
reader = pipeline.reader()


def run_ocr(image, **kwargs):
    started = time.time()
    results = reader.readtext(np.array(image), detail=1, paragraph=False, **kwargs)
    elapsed = time.time() - started
    text = " ".join(str(r[1]) for r in results).lower()
    hits = [s for s in truth if s in text]
    return elapsed, len(results), hits


def scaled(width):
    if width == raw.width:
        return raw
    return raw.resize((width, round(raw.height * width / raw.width)), Image.LANCZOS)


variants = [
    ("original", raw.width, {}),
    ("x2", raw.width * 2, {}),
    ("1600 (current)", 1600, {}),
    ("1600 batch16", 1600, {"batch_size": 16}),
    ("x2 batch16 canvas1280", raw.width * 2, {"batch_size": 16, "canvas_size": 1280}),
]
for label, width, kwargs in variants:
    image = scaled(width)
    elapsed, count, hits = run_ocr(image, **kwargs)
    print(f"OCR {label:24s} {image.width}x{image.height} {elapsed:6.1f}s segments={count:4d} truth {len(hits)}/{len(truth)} {hits}", flush=True)

image = pipeline.prepare(raw)
segments = pipeline.ocr(image)
words = pipeline.words_of(segments, image.width, image.height)
qa = pipeline.qa()
questions = ["What is the date?", "What is the certificate number?", "What is the botanical name?", "What is the quantity declared?"]

started = time.time()
for q in questions:
    qa(image=image, question=q, word_boxes=words, top_k=1)
sequential = time.time() - started

started = time.time()
qa([{"image": image, "question": q, "word_boxes": words} for q in questions], top_k=1, batch_size=len(questions))
batched = time.time() - started

started = time.time()
qa(image=None, question=questions[0], word_boxes=words, top_k=1)
no_image = time.time() - started

print(
    f"LayoutLM over {len(words)} words: sequential {sequential:.1f}s for {len(questions)} questions "
    f"({sequential / len(questions):.1f}s each); batched {batched:.1f}s; one question without image {no_image:.1f}s",
    flush=True,
)
