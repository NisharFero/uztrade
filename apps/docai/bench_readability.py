"""Evidence for an "unreadable document" guard: how readable pages differ from
thumbnails in OCR box height, OCR confidence and LayoutLM tokens per word.

    .venv/Scripts/python bench_readability.py <image> [<image> ...]
"""

import statistics
import sys
import time

from PIL import Image
from transformers import AutoTokenizer

import pipeline

tokenizer = AutoTokenizer.from_pretrained(pipeline.QA_MODEL, add_prefix_space=True)

for path in sys.argv[1:]:
    image = pipeline.prepare(Image.open(path).convert("RGB"))
    started = time.time()
    segments = pipeline.ocr(image)
    elapsed = time.time() - started
    heights = [s["box"][3] - s["box"][1] for s in segments] or [0]
    confs = [s["conf"] for s in segments] or [0]
    words = [w for s in segments for w in s["text"].split()]
    tokens = len(tokenizer(words, is_split_into_words=True)["input_ids"]) if words else 0
    print(
        f"{path.split('/')[-1]:44s} {image.width}x{image.height} ocr {elapsed:5.1f}s "
        f"segments={len(segments):4d} median_h={statistics.median(heights):5.1f}px "
        f"mean_conf={statistics.mean(confs):.2f} median_conf={statistics.median(confs):.2f} "
        f"words={len(words):4d} tokens/word={tokens / max(len(words), 1):.2f}",
        flush=True,
    )
