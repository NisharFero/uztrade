"""Hypothesis H1: OCR quality is limited by specimen resolution, not by EasyOCR.

1) A higher-resolution printed specimen (bilingual contract, 778x1100).
2) A synthetic filled invoice rendered at real scan resolution (A4, 300 dpi),
   OCR'd at full size and downscaled - the resolution real uploads arrive at.
   Saved as eval/specimens/synthetic-invoice-a4.png (clearly synthetic).

    .venv/Scripts/python -m bench.resolution <contract-specimen.jpg>
"""

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from docai import pipeline

reader = pipeline.reader()


def ocr_hits(image, truth):
    started = time.time()
    results = reader.readtext(np.array(image), detail=1, paragraph=False)
    elapsed = time.time() - started
    text = " ".join(str(r[1]) for r in results).lower()
    hits = [s for s in truth if s.lower() in text]
    return elapsed, len(results), hits


def report(label, image, truth):
    elapsed, count, hits = ocr_hits(image, truth)
    print(f"{label:34s} {image.width}x{image.height} {elapsed:6.1f}s segments={count:4d} truth {len(hits)}/{len(truth)} {hits}", flush=True)


# 1) Higher-resolution printed specimen
contract = Image.open(sys.argv[1]).convert("RGB")
report(
    "contract specimen (original)",
    contract,
    ["contract", "subject of the contract", "incoterms", "alashinkoy", "novoufimsky", "продавец", "покупатель", "количество товара", "sgs"],
)

# 2) Synthetic filled invoice at A4 300 dpi
W, H = 2480, 3508
page = Image.new("RGB", (W, H), "white")
draw = ImageDraw.Draw(page)
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 42)  # ~10 pt at 300 dpi
bold = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 58) if Path("C:/Windows/Fonts/arialbd.ttf").exists() else font
lines = [
    ("СЧЕТ/INVOICE № INV-2026/0457", bold),
    ("Дата/Date: 12.09.2026", font),
    ("", font),
    ("ОТПРАВИТЕЛЬ/SENT BY: ООО \"Samarkand Choy\"", font),
    ("Адрес/Address: Самарканд, ул. Регистан 12, Uzbekistan", font),
    ("Налоговый номер/VAT Reg. No: 301245678", font),
    ("", font),
    ("ПОЛУЧАТЕЛЬ/SENT TO: ООО \"Московский Чай\"", font),
    ("Адрес/Address: Москва, ул. Тверская 7, Russia", font),
    ("", font),
    ("Транспортный документ/WAYBILL/CMR/Bill of lading № SMGS 77120045", font),
    ("Количество мест/Number of pieces: 2400", font),
    ("Общий вес брутто/Total Gross Weight: 61 200 kg", font),
    ("Общий вес нетто/Total Net Weight: 60 000 kg", font),
    ("Валюта инвойса/Currency of invoice: USD", font),
    ("Номер/Дата контракта/Number/Date of contract: UZ-2026/118 от 01.08.2026", font),
    ("", font),
    ("Полное описание товаров/Full description of goods: Черный чай байховый / Black tea", font),
    ("Таможенная спецификация/Customs Commodity Code: 0902 40 000 0", font),
    ("Страна происхождения/Country of origin: Uzbekistan", font),
    ("Количество/Quantity: 60 000 kg    Цена/Unit value: 3.20    Стоимость/Sub Total: 192 000.00", font),
    ("", font),
    ("Всего/Total Value FOB: 192 000.00", font),
    ("Условия поставки (Инкотермс)/Terms of Transportation (INCOTERMS): FCA Tashkent", font),
    ("", font),
    ("Подпись/Signature: ______________    Место и дата/Place and date: Samarkand, 12.09.2026", font),
]
y = 220
for text, f in lines:
    draw.text((180, y), text, fill="black", font=f)
    y += 92 if f is bold else 70
out = Path("eval/specimens/synthetic-invoice-a4.png")
page.save(out)
print("saved", out, flush=True)

truth = ["inv-2026/0457", "12.09.2026", "301245678", "samarkand", "московский", "60 000", "usd", "uz-2026/118", "0902", "192 000", "fca"]
report("synthetic invoice A4 300dpi", page, truth)
for width in (1754, 1240):
    scaled = page.resize((width, round(H * width / W)), Image.LANCZOS)
    report(f"synthetic invoice {width} wide", scaled, truth)
