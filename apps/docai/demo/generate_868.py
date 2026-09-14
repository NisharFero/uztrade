"""Generates the demo document pack for procedure 868 (export of tea by train).

Reads apps/web/app/data/demo/scenario-868.json - the single source of every demo
value - and writes readable A4 pages (150 dpi) to apps/web/public/demo/868/.
Every page carries DEMO banners; every company, person, number and stamp is
invented. Printed labels follow the specimens' bilingual labels so the document
AI reads a demo page the way it reads a real one.

    .venv/Scripts/python demo/generate_868.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

APPS = Path(__file__).resolve().parents[2]
SCENARIO = APPS / "web" / "app" / "data" / "demo" / "scenario-868.json"
OUT = APPS / "web" / "public" / "demo" / "868"
W, H = 1240, 1754  # A4 at 150 dpi
MARGIN = 70
FONT = "C:/Windows/Fonts/arial.ttf"
BOLD = "C:/Windows/Fonts/arialbd.ttf"
INK = (15, 15, 15)
LABEL = (80, 80, 80)
DEMO_RED = (185, 28, 28)
STAMP_BLUE = (30, 64, 175)

_fonts: dict[tuple[int, bool], ImageFont.FreeTypeFont] = {}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, bold)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(BOLD if bold else FONT, size)
    return _fonts[key]


class Page:
    def __init__(self, title: str, subtitle: str = ""):
        self.image = Image.new("RGB", (W, H), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.y = 120
        self._banner(0)
        self._banner(H - 56)
        for line in self.wrap(title, font(38, True), W - 2 * MARGIN):
            self.draw.text((MARGIN, self.y), line, fill=INK, font=font(38, True))
            self.y += 54
        if subtitle:
            self.draw.text((MARGIN, self.y), subtitle, fill=LABEL, font=font(24))
            self.y += 40
        self.y += 18

    def _banner(self, top: int) -> None:
        self.draw.rectangle([0, top, W, top + 56], fill=DEMO_RED)
        self.draw.text((MARGIN, top + 14), "DEMO — NOT A REAL DOCUMENT · UzTrade demo pack · all names and numbers are invented", fill="white", font=font(22, True))

    def wrap(self, text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
        words, lines, current = text.split(), [], ""
        for word in words:
            trial = f"{current} {word}".strip()
            if self.draw.textlength(trial, font=f) <= width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    def line(self, label: str, value: str = "", size: int = 30) -> None:
        text = f"{label}: {value}" if value else label
        for chunk in self.wrap(text, font(size), W - 2 * MARGIN):
            self.draw.text((MARGIN, self.y), chunk, fill=INK, font=font(size))
            self.y += int(size * 1.5)

    def paragraph(self, text: str, size: int = 26) -> None:
        for chunk in self.wrap(text, font(size), W - 2 * MARGIN):
            self.draw.text((MARGIN, self.y), chunk, fill=INK, font=font(size))
            self.y += int(size * 1.45)
        self.y += 10

    def box(self, label: str, value: str) -> None:
        """A numbered form box: small grey label, value below it, framed."""
        label_lines = self.wrap(label, font(20), W - 2 * MARGIN - 24)
        value_lines = self.wrap(value, font(30), W - 2 * MARGIN - 24)
        height = 16 + 28 * len(label_lines) + 44 * len(value_lines) + 8
        self.draw.rectangle([MARGIN - 8, self.y - 6, W - MARGIN + 8, self.y + height], outline=(120, 120, 120), width=2)
        y = self.y + 4
        for chunk in label_lines:
            self.draw.text((MARGIN + 6, y), chunk, fill=LABEL, font=font(20))
            y += 28
        for chunk in value_lines:
            self.draw.text((MARGIN + 6, y + 4), chunk, fill=INK, font=font(30))
            y += 44
        self.y += height + 14

    def gap(self, px: int = 20) -> None:
        self.y += px

    def stamp(self, lines: list[str], center: tuple[int, int], radius: int = 120) -> None:
        cx, cy = center
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        color = STAMP_BLUE + (190,)
        d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=color, width=6)
        d.ellipse([cx - radius + 14, cy - radius + 14, cx + radius - 14, cy + radius - 14], outline=color, width=3)
        y = cy - 18 * len(lines)
        for text in lines:
            width = d.textlength(text, font=font(26, True))
            d.text((cx - width / 2, y), text, fill=color, font=font(26, True))
            y += 36
        self.image = Image.alpha_composite(self.image.convert("RGBA"), layer.rotate(-12, center=center)).convert("RGB")
        self.draw = ImageDraw.Draw(self.image)

    def datestamp(self, text: str, top_left: tuple[int, int]) -> None:
        x, y = top_left
        self.draw.rectangle([x, y, x + 330, y + 110], outline=STAMP_BLUE, width=5)
        self.draw.text((x + 22, y + 14), "STATION DATESTAMP", fill=STAMP_BLUE, font=font(22, True))
        self.draw.text((x + 22, y + 50), text, fill=STAMP_BLUE, font=font(40, True))

    def save(self, name: str) -> None:
        self.image.save(OUT / name, optimize=True)


def f(doc: dict, key: str) -> str:
    return doc["fields"].get(key, "")


# ---------------------------------------------------------------- templates ---


def commercial_invoice(doc, s):
    sh, ex, buyer = s["shipment"], s["parties"]["exporter"], s["parties"]["buyer"]
    p = Page(f"СЧЕТ/INVOICE № {f(doc, 'invoice_no')}", "страница/page 1 из/of 1")
    p.line("Дата/Date", f(doc, "invoice_date"))
    p.gap()
    p.line("ОТПРАВИТЕЛЬ/SENT BY", f(doc, "seller"))
    p.line("Адрес/Address", ex["address"])
    p.line("Налоговый номер/VAT Reg. No", ex["tin"])
    p.gap()
    p.line("ПОЛУЧАТЕЛЬ/SENT TO", f(doc, "buyer"))
    p.line("Адрес/Address", buyer["address"])
    p.gap()
    p.line("Транспортный документ/WAYBILL/CMR/Bill of lading №", f(doc, "transport_doc"))
    p.line("Количество мест/Number of pieces", sh["cartons"])
    p.line("Общий вес брутто/Total Gross Weight", f(doc, "gross_weight"))
    p.line("Общий вес нетто/Total Net Weight", f(doc, "quantity"))
    p.line("Валюта инвойса/Currency of invoice", f(doc, "currency"))
    p.line("Номер/Дата контракта/Number/Date of contract", f"{f(doc, 'contract_no')} от {s['shipment']['contractDate']}")
    p.gap()
    p.line("Полное описание товаров/Full description of goods", f"Черный чай / {f(doc, 'goods')}")
    p.line("Таможенная спецификация/Customs Commodity Code", f(doc, "hs_code"))
    p.line("Страна происхождения/Country of origin", f(doc, "origin_country"))
    p.line("Количество/Quantity", f"{f(doc, 'quantity')}    Цена/Unit value: 3.20    Стоимость/Sub Total: {f(doc, 'total_value')}")
    p.gap()
    p.line("Всего/Total Value FOB", f(doc, "total_value"))
    p.line("Условия поставки (Инкотермс)/Terms of Transportation (INCOTERMS)", f(doc, "incoterms"))
    p.gap(30)
    p.line("Подпись/Signature", f"{ex['manager']}    Место и дата/Place and date: Samarkand, {f(doc, 'invoice_date')}")
    p.save(doc["file"])


def contract(doc, s):
    sh = s["shipment"]
    p = Page(f"CONTRACT № {f(doc, 'contract_no')} / КОНТРАКТ № {f(doc, 'contract_no')}")
    p.line("City / Город", f"Tashkent    Date / Дата: {f(doc, 'contract_date')}")
    p.gap()
    p.line("Seller / Продавец", f(doc, "seller"))
    p.line("Buyer / Покупатель", f(doc, "buyer"))
    p.gap()
    p.paragraph(f"1. SUBJECT OF THE CONTRACT / ПРЕДМЕТ КОНТРАКТА. The Seller shall sell and the Buyer shall accept and pay for {f(doc, 'goods').lower()} (HS {sh['hs']}), hereinafter referred to as \"Product\", on delivery terms {f(doc, 'incoterms')} (Incoterms 2020).")
    p.line("2. QUANTITY OF PRODUCT / Количество товара", f(doc, "quantity"))
    p.line("3. CONTRACT COST / Стоимость контракта", f(doc, "total_value"))
    p.paragraph("4. TERMS OF PAYMENT / Условия оплаты. 100% by bank transfer within 30 days of the date of the railway bill.")
    p.paragraph(f"5. TERMS OF SHIPMENT / Условия отгрузки. By rail in covered wagons from {sh['departureStation']} to {sh['destinationStation']} via {sh['borderStations']}.")
    p.paragraph("6. QUALITY / Качество. The Product shall conform to the manufacturer's quality certificate.")
    p.gap(30)
    p.line("Seller / Продавец", f"{s['parties']['exporter']['manager']}, Director")
    p.line("Buyer / Покупатель", "I. Sokolova, General Director")
    p.save(doc["file"])


def passport(doc, s):
    p = Page("PASSPORT / ПАСПОРТ — DEMO, FICTIONAL PERSON", "Specimen for the demo pack only. Not an identity document.")
    p.box("Type / Тип", "P")
    p.box("Surname / Фамилия", f(doc, "full_name").split()[0])
    p.box("Given names / Имя", " ".join(f(doc, "full_name").split()[1:]))
    p.box("Passport No / Номер паспорта", f(doc, "passport_no"))
    p.box("Nationality / Гражданство", "DEMO")
    p.box("Date of expiry / Срок действия", f(doc, "expiry"))
    p.save(doc["file"])


def poa(doc, s):
    ex = s["parties"]["exporter"]
    p = Page(f"ДОВЕРЕННОСТЬ № {f(doc, 'poa_no')} / POWER OF ATTORNEY")
    p.line("г. / City", "Tashkent")
    p.line("Дата / Date", f(doc, "issue_date"))
    p.gap()
    p.line("Доверенность выдана / Issued to", f(doc, "representative"))
    p.line("серия паспорта / Passport series and number", f(doc, "passport"))
    p.gap()
    p.paragraph(f"{ex['name']} (TIN {ex['tin']}) authorises the representative to receive and send cargo, to carry out customs operations, to attend customs operations and inspections at the railway station and the Transportation Unit, and to sign, receive and submit documents for this shipment.")
    p.line("Сроком до / Valid until", f(doc, "valid_until"))
    p.paragraph("Полномочия по доверенности не могут быть передоверены третьим лицам.")
    p.gap(30)
    p.line("Директор / Director", ex["manager"])
    p.save(doc["file"])


def invoice_for_payment(doc, s):
    p = Page(f"СЧЕТ на оплату № {f(doc, 'invoice_no')} от {f(doc, 'invoice_date')}")
    p.line("Дата / Date", f(doc, "invoice_date"))
    p.line("К договору / Contract", f(doc, "contract_no"))
    p.gap()
    p.line("Поставщик / Supplier", f(doc, "supplier"))
    p.line("ИНН / INN", f(doc, "supplier_inn"))
    p.line("Заказчик / Customer", f(doc, "customer"))
    p.gap()
    p.line("Наименование услуг / Services", doc["title"].split(" — ")[-1])
    p.line("Ставка НДС / VAT rate", f"{f(doc, 'vat_rate')}%")
    p.line("Всего к оплате / Total to pay", f"{f(doc, 'total')} UZS")
    p.gap(30)
    p.line("Директор / Director", "A. Demo")
    p.line("Главный бухгалтер / Chief accountant", "B. Demo")
    p.save(doc["file"])


def receipt(doc, s):
    p = Page(f"КВИТАНЦИЯ / RECEIPT № {f(doc, 'receipt_no')}")
    p.line("Плательщик / Payer", f(doc, "payer"))
    p.line("ИНН / INN", f(doc, "payer_inn"))
    p.line("Получатель платежа / Recipient", f(doc, "recipient"))
    p.line("Вид платежа / Description", f(doc, "payment_type"))
    p.line("Назначение / Payment purpose", f"{doc['title'].split(' — ')[-1]}, export of tea by train")
    p.gap()
    p.line("Итого / Total", f"{f(doc, 'amount')} UZS")
    p.line("Дата / Date", f(doc, "date"))
    p.gap(30)
    p.line("Подпись плательщика / Payer's signature", "Dilshod Rakhimov")
    p.stamp(["DEMO BANK", "PAID", f(doc, "date")], (W - 260, p.y + 60), radius=110)
    p.save(doc["file"])


def offer(doc, s):
    ex = s["parties"]["exporter"]
    p = Page(f"Оферта шартномаси № {f(doc, 'agreement_no')} / Offer agreement")
    p.line("Тошкент шаҳар / Tashkent city", f(doc, "agreement_date"))
    p.gap()
    p.paragraph("Ўсимликлар карантини ва ҳимояси агентлиги (\"Inspection\") ва ариза берувчи (\"Applicant\") ўртасидаги оферта шартномаси. Offer agreement between the Agency of Plant Quarantine and Protection and the Applicant.")
    p.line("Хизмат номи / Service", f(doc, "service"))
    p.line("Миқдори / Quantity", f(doc, "units"))
    p.line("Суммаси / Сумма", f"{f(doc, 'amount')} UZS")
    p.gap()
    p.line("Tax Identification Number of the organization or individual", ex["tin"])
    p.line("Name of the organization", ex["name"])
    p.line("Full name of an organization's manager", ex["manager"])
    p.line("Contact phone number", ex["phone"])
    p.line("Agency region", "Samarkand region")
    p.save(doc["file"])


def gu12(doc, s):
    p = Page("ЗАЯВКА НА ПЕРЕВОЗКУ ГРУЗОВ (форма ГУ-12)", "Application for cargo transportation GU-12 · Перевозчик: JSC Uzbekistan Temir Yo'llari")
    p.box("Наименование и почтовый адрес отправителя", f"{f(doc, 'shipper')}, Samarkand")
    p.box("Наименование станции отправления", f(doc, "departure_station"))
    p.box("Точное наименование груза", f(doc, "cargo"))
    p.box("Код груза ЕТСНГ", f(doc, "etsng"))
    p.box("Наименование станции и дороги назначения", f(doc, "destination_station"))
    p.box("Наименование грузополучателя", f(doc, "consignee"))
    p.box("Кол-во тонн", f(doc, "tonnes"))
    p.box("Количество вагонов", f(doc, "wagons"))
    p.line("Подпись грузоотправителя", "Dilshod Rakhimov")
    p.save(doc["file"])


def smgs(doc, s):
    p = Page(f"Накладная СМГС — {doc['title'].split(' — ')[0]}", f"29 Отправка № {f(doc, 'dispatch_no')}")
    p.box("1 Отправитель / Sender", f(doc, "sender"))
    p.box("2 Станция отправления / Departure station", f(doc, "departure_station"))
    p.box("4 Получатель / Consignee", f(doc, "consignee"))
    p.box("5 Станция назначения / Destination station", f(doc, "destination_station"))
    if f(doc, "border_stations"):
        p.box("6 Пограничные станции переходов / Border crossing stations", f(doc, "border_stations"))
    p.box("7 Вагон / Wagon", f(doc, "wagon_no"))
    p.box("15 Наименование груза / Name of cargo", f(doc, "cargo"))
    if f(doc, "packaging"):
        p.box("16 Род упаковки / Type of packaging", f(doc, "packaging"))
    if f(doc, "places"):
        p.box("17 К-во мест / Number of places", f(doc, "places"))
    p.box("18 Масса (в кг) / Weight (kg)", f(doc, "weight"))
    if f(doc, "seals"):
        p.box("19 Пломбы / Seals", f(doc, "seals"))
    if f(doc, "documents_attached"):
        p.box("24 Документы, приложенные отправителем / Documents attached", f(doc, "documents_attached"))
    if doc.get("stamp") == "customs":
        p.stamp(["CUSTOMS", "RELEASED · DEMO", "13.09.2026"], (W - 290, H - 280))
    if doc.get("stamp") == "datestamp":
        p.datestamp("14 SEP 2026", (W - 440, H - 230))
    p.save(doc["file"])


def phyto(doc, s):
    p = Page(f"PHYTOSANITARY CERTIFICATE / ФИТОСАНИТАРНЫЙ СЕРТИФИКАТ № {f(doc, 'cert_no')}", "Agency of Plant Quarantine and Protection of the Republic of Uzbekistan (demo)")
    p.box("1. Name and address of exporter / Экспортер", f(doc, "exporter"))
    p.box("3. Declared name and address of consignee / Получатель", f(doc, "consignee"))
    p.box("4. To: Plant protection organization of / Организация по карантину растений", f(doc, "destination_country"))
    p.box("5. Declared point of entry / Пункт ввоза", f(doc, "point_of_entry"))
    p.box("6. Place of origin / Место происхождения", f(doc, "place_of_origin"))
    p.box("7. Declared means of conveyance", "Rail, 2 covered wagons")
    p.box("8. Name of produce / Наименование продукции", f(doc, "produce"))
    p.box("Botanical name of plants / Ботаническое название", f(doc, "botanical_name"))
    p.box("9. Quantity declared / Заявленное количество", f(doc, "quantity"))
    p.box("12. Treatment / Способ обработки", f(doc, "treatment"))
    p.line("Date / Дата", f(doc, "issue_date"))
    p.stamp(["PLANT QUARANTINE", "DEMO", f(doc, "issue_date")], (W - 250, p.y + 40), radius=105)
    p.save(doc["file"])


def ct1(doc, s):
    p = Page("СЕРТИФИКАТ О ПРОИСХОЖДЕНИИ ТОВАРА ФОРМА СТ-1 / CERTIFICATE OF ORIGIN CT-1", f"4. № {f(doc, 'cert_no')} · Выдан в / Issued in: Uzbekistan")
    p.box("1. Экспортер / Exporter", f(doc, "exporter"))
    p.box("2. Получатель / Consignee", f(doc, "consignee"))
    p.box("3. Средства транспорта и маршрут / Means of transport and route", f(doc, "transport_route"))
    p.box("8. Описание товара / Description of goods", f(doc, "goods"))
    p.box("9. Вес брутто (кг) / Gross weight", f(doc, "weight"))
    p.box("10. Номер и дата счета-фактуры / Number and date of invoices", f(doc, "invoice_ref"))
    p.box("Для представления в / For presentation in (exported to)", f(doc, "exported_to"))
    p.stamp(["UZBEKEXPERTIZA", "DEMO", "12.09.2026"], (W - 260, p.y + 90), radius=110)
    p.save(doc["file"])


def letter(doc, s):
    ex, sh = s["parties"]["exporter"], s["shipment"]
    p = Page(doc["title"], f"{ex['name']} · {ex['address']} · TIN {ex['tin']} · {ex['phone']}")
    p.line("Date / Дата", "05.09.2026")
    p.line("Case", f"Export of {sh['netKg']} kg of black tea, {sh['departureStation']} → {sh['destinationStation']} by rail")
    p.gap()
    p.paragraph(doc.get("body") or f"{ex['name']} submits this {doc['title'].lower()} for the shipment under contract {sh['contractNo']} of {sh['contractDate']}: {sh['cartons']} cartons, {sh['netKg']} kg net, in wagons {', '.join(sh['wagons'])}.")
    p.gap(40)
    p.line("Director / Директор", ex["manager"])
    p.save(doc["file"])


TEMPLATES = {
    "commercial_invoice": commercial_invoice,
    "contract": contract,
    "passport": passport,
    "poa": poa,
    "invoice_for_payment": invoice_for_payment,
    "receipt": receipt,
    "offer": offer,
    "gu12": gu12,
    "smgs": smgs,
    "phyto": phyto,
    "ct1": ct1,
    "letter": letter,
}


def main() -> None:
    scenario = json.loads(SCENARIO.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for doc in scenario["documents"]:
        TEMPLATES[doc["template"]](doc, scenario)
        print("wrote", doc["file"])
    print(f"{len(scenario['documents'])} documents in {OUT}")


if __name__ == "__main__":
    main()
