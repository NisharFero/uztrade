"""Full-layout demo documents: each page is drawn the way the printed form it
stands in for is laid out - numbered box grids, line-item tables, totals,
requisites, signatures and seals - and filled from the scenario.

Printed labels keep the bilingual wording of the published specimens (and the
anchors in apps/web/modules/documents/specs.ts), so the document AI reads a
demo page the way it reads a real one. Everything is invented and every page
carries DEMO banners.

    render_pack(scenario, out_dir)   # every document of a scenario
"""

from __future__ import annotations

import re
from pathlib import Path

from kit import (
    BOTTOM, FAINT, FILL, H, INK, L, LABEL, R, SEAL, SEAL_VIOLET, SHADE, TOP, W,
    Sheet, amount_value, money, seeded, sum_in_words,
)

# ------------------------------------------------------------------ context ---

PARTY_DEFAULTS = {"name": "", "address": "", "tin": "—", "manager": "A. Demo", "phone": "—", "email": "—", "bank": "—"}

# 868 is hand-written and predates the fields the generated scenarios carry.
FALLBACK = {
    "868": {"from": "Tashkent, Uzbekistan", "to": "Moscow, Russia", "goodsRu": "Чай черный", "packaging": "Cartons, 25 kg", "unitKind": "wagon"},
}


def fill(party: dict | None) -> dict:
    out = dict(PARTY_DEFAULTS)
    out.update({k: v for k, v in (party or {}).items() if v})
    return out


class Ctx:
    def __init__(self, scenario: dict, out: Path):
        self.s = scenario
        self.out = out
        self.pid = str(scenario.get("procedureId", "868"))
        sh = dict(FALLBACK.get(self.pid, {}))
        sh.update(scenario["shipment"])
        self.sh = sh
        parties = scenario["parties"]
        exporter = parties["exporter"]
        self.trader = fill(parties.get("trader") or exporter)
        self.seller = fill(parties.get("seller") or exporter)
        self.buyer = fill(parties.get("buyer"))
        self.rep = parties.get("representative") or {"name": "B. Demo", "passport": "AA 0000000"}
        self.values = scenario.get("values", {})
        self.mode = {"wagon": "rail", "truck": "road", "air pallet": "air"}.get(sh.get("unitKind") or "wagon", "rail")
        self.units = sh.get("wagons") or []
        self.seals = sh.get("seals") or []

    # places
    @property
    def origin(self) -> str:
        return self.sh.get("from") or f"{self.sh['departureStation']}, Uzbekistan"

    @property
    def dest(self) -> str:
        return self.sh.get("to") or self.sh["destinationStation"]

    @staticmethod
    def country(place: str) -> str:
        return place.split(",")[-1].strip() if "," in place else place

    @staticmethod
    def city(place: str) -> str:
        return place.split(",")[0].strip()

    @property
    def importing(self) -> bool:
        return self.country(self.dest).lower() == "uzbekistan"

    @property
    def case_line(self) -> str:
        return self.sh.get("caseLine") or f"export of {self.sh['goods'].lower()} by train, {self.sh['netKg']} kg"

    @property
    def transport(self) -> str:
        return {"rail": "Rail", "road": "Road", "air": "Air"}[self.mode]

    @property
    def unit_list(self) -> str:
        return ", ".join(self.units) or "—"

    @property
    def goods_bi(self) -> str:
        ru = self.sh.get("goodsRu")
        return f"{ru} / {self.sh['goods']}" if ru else self.sh["goods"]

    def rng(self, doc: dict):
        return seeded(self.pid, doc.get("id") or doc["file"])

    def initial(self, doc: dict, salt: str = "") -> str:
        return seeded(self.pid, doc.get("id") or doc["file"], "initial", salt).choice("ABDFGIKMNORSTU")

    def num(self, doc: dict, digits: int, salt: str = "") -> str:
        rng = seeded(self.pid, doc.get("id") or doc["file"], salt)
        return "".join(str(rng.randint(0, 9)) for _ in range(digits))

    def date(self, doc: dict, *keys: str) -> str:
        for key in keys:
            value = doc["fields"].get(key)
            if value:
                return value
        return self.sh.get("invoiceDate") or self.sh.get("contractDate") or "05.09.2026"

    @property
    def kg_per_place(self) -> float:
        try:
            return amount_value(self.sh["netKg"]) / max(1.0, amount_value(self.sh["cartons"]))
        except Exception:
            return 0.0


def f(doc: dict, key: str) -> str:
    return doc["fields"].get(key, "")


def title_of(doc: dict) -> str:
    return re.sub(r"\s+—\s+step\s+\d+$", "", doc["title"])


def step_of(doc: dict) -> str:
    hit = re.search(r"step\s+(\d+)", doc["title"])
    return hit.group(1) if hit else ""


def signature_block(p: Sheet, x: float, y: float, role: str, name: str, width: float = 520, seal: tuple[str, list[str]] | None = None) -> float:
    p.text(x, y, role, 17, color=LABEL)
    sx = x + max(150, p.width(role, 17) + 16)
    p.hline(sx, sx + 180, y + 22)
    p.signature(sx + 10, y + 8, 150)
    p.text(sx + 195, y, f"/ {name} /", 18, color=FILL)
    if seal:
        p.seal(x + width - 90, y + 10, seal[0], seal[1], radius=78)
    return y + 60


def company_seal(p: Sheet, cx: float, cy: float, party: dict, city: str = "TOSHKENT", radius: int = 82) -> None:
    name = re.sub(r'^(OOO|OcOO|LLC|JSC|AO)\s+', "", party["name"]).replace('"', "").upper()
    p.seal(cx, cy, f"{name} · {city} · DEMO", ["MCHJ", f"STIR {party['tin']}"], radius=radius)


# ------------------------------------------------------------ trade papers ---


def commercial_invoice(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    sh, seller, buyer = c.sh, c.seller, c.buyer
    mono = "mono"
    p.text(W / 2, TOP + 14, f"СЧЕТ/INVOICE № {f(doc, 'invoice_no')}", 32, True, mono, align="center")
    p.text(W / 2, TOP + 56, f"Дата/Date: {f(doc, 'invoice_date')}", 20, face=mono, color=INK, align="center")
    p.text(R, TOP + 90, "страница/page 1 из/of 1", 16, face=mono, color=LABEL, align="right")

    def party_block(y: float, heading: str, party: dict, name: str) -> float:
        p.text(L, y, heading, 20, True, mono)
        y += 30
        rows = [
            ("Название компании/Company Name:", name),
            ("Имя/Отдел Name/Department:", f"{party['manager']}, sales department" if party["manager"] != "A. Demo" else "Foreign trade department"),
            ("Адрес/Address:", party["address"]),
            ("Город/Почт.Индекс/City/Postal Code:", f"{c.city(party['address'] or 'Tashkent')}, 1000{c.num(doc, 2, heading)}"),
            ("Страна/Country:", c.country(party["address"]) if party["address"] else "—"),
            ("Тел/Факс/Tel./Fax:", party["phone"]),
            ("Налоговый номер/VAT Reg. No:", party["tin"]),
        ]
        for label, value in rows:
            p.text(L, y, f"{label} {value}", 17, face=mono, color=INK)
            y += 26
        return y + 10

    y = party_block(TOP + 118, "ОТПРАВИТЕЛЬ/SENT BY", seller, f(doc, "seller"))
    company_seal(p, R - 110, TOP + 230, seller)
    y = party_block(y, "ПОЛУЧАТЕЛЬ/SENT TO", buyer, f(doc, "buyer"))

    p.text(L, y, f"Транспортный документ/WAYBILL/CMR/Bill of lading № {f(doc, 'transport_doc')}", 18, True, mono)
    y += 28
    box_top = y
    rows = [
        ("Количество мест/Number of pieces:", sh["cartons"]),
        ("Общий вес брутто/Total Gross Weight:", f(doc, "gross_weight")),
        ("Общий вес нетто/Total Net Weight:", f(doc, "quantity")),
        ("Перевозчик/Carrier:", {"rail": "JSC Uzbekistan Temir Yo'llari", "road": "Demo Transit LLC (TIR)", "air": "Uzbekistan Airways"}[c.mode]),
    ]
    for label, value in rows:
        p.text(L + 8, y + 4, f"{label} {value}", 17, face=mono, color=INK)
        y += 27
    p.rect(L, box_top, R, y + 6, 2)
    y += 22
    p.text(L, y, f"Валюта инвойса/Currency of invoice: {f(doc, 'currency')}", 19, True, mono)
    y += 28
    p.text(L, y, f"Номер/Дата контракта/Number/Date of contract: {f(doc, 'contract_no')} от {sh['contractDate']}", 19, True, mono)
    y += 38

    net = amount_value(sh["netKg"])
    total = amount_value(f(doc, "total_value"))
    unit_price = total / net if net else 0
    cols = [(330, "Полное описание товаров/Full description of goods"), (170, "Таможенная спецификация/Customs Commodity Code"), (160, "Страна происхождения/Country of origin"), (140, "Количество/Quantity"), (140, "Цена за шт./Unit value"), (180, "Общая стоимость/Sub Total Value")]
    rows = [
        [f"{c.goods_bi}; {sh.get('packaging', 'cartons')}, {sh['cartons']} places", f(doc, "hs_code"), f(doc, "origin_country"), f(doc, "quantity"), f"{unit_price:.2f} /kg", f(doc, "total_value")],
        ["", "", "", "", "", ""],
        ["", "", "", "", "", ""],
    ]
    y = p.table(L, y, cols, rows, hs=13, rs=17, min_h=34, align=["left", "center", "center", "right", "right", "right"])
    y += 14

    tx = R - 520
    totals = [
        ("Всего/Total Value FOB:", f(doc, "total_value")),
        ("Ст-ть перевозки/Freight:", "—"),
        ("Ст-ть страховки/Insurance:", "—"),
        ("Общая стоимость/Total Value CIF:", f(doc, "total_value")),
    ]
    for i, (label, value) in enumerate(totals):
        p.rect(tx, y, tx + 330, y + 30, 1, fill=SHADE if i == 3 else None)
        p.rect(tx + 330, y, R, y + 30, 1)
        p.text(tx + 6, y + 5, f"{label} {value}", 16, i == 3, mono)
        y += 30
    y += 24
    p.text(L, y, f"Условия поставки/Terms of Transportation (INCOTERMS): {f(doc, 'incoterms')}", 19, True, mono)
    y += 76
    p.text(L, y, f"Сумма прописью / Amount in words: {sum_in_words(total, 'USD')}", 16, face="italic", color=INK)
    y += 34
    p.para(L, y, R - L, "Подтверждаю, что все указанное верно / I declare that the above information is true and correct to the best of my knowledge.", 17, face="italic", color=LABEL)
    y += 70
    p.text(L, y, "Подпись/Signature:", 18, True, mono)
    p.signature(L + 220, y + 8, 160)
    p.text(L + 430, y, "Имя/Name:", 18, True, mono)
    p.text(L + 540, y - 1, seller["manager"], 18, color=FILL)
    p.text(L + 790, y, "Место и дата/Place and date:", 16, True, mono)
    p.text(L + 790, y + 26, f"{c.city(seller['address'] or 'Tashkent')}, {f(doc, 'invoice_date')}", 18, color=FILL)
    if doc.get("stamp") == "customs":
        p.box_stamp(R - 380, y - 240, ["ТАМОЖЕННЫЙ КОНТРОЛЬ", "CUSTOMS · RELEASED · DEMO", c.date(doc)], color=SEAL_VIOLET)
    return p


def contract(doc, c: Ctx) -> Sheet:
    p = Sheet(pages=2, seed=doc["file"])
    sh, seller, buyer = c.sh, c.seller, c.buyer
    # Sans: the document AI reads Arial far better than Times at body sizes.
    serif = "sans"
    no = f(doc, "contract_no")
    city = c.city(seller["address"] or "Tashkent")
    p.text(W / 2, TOP + 12, f"CONTRACT № {no}", 30, True, serif, align="center")
    p.text(W / 2, TOP + 50, f"КОНТРАКТ № {no}", 30, True, serif, align="center")
    p.text(L, TOP + 100, f"City / Город: {city}", 20, face=serif)
    p.text(R, TOP + 100, f"Date / Дата: {f(doc, 'contract_date')}", 20, face=serif, align="right")

    col = (R - L - 30) / 2
    lx, rx = L, L + col + 30
    y = TOP + 150

    def clause(en: str, ru: str, y: float, head: bool = False) -> float:
        size = 19 if head else 17
        y1 = p.para(lx, y, col, en, size, head, serif, align="left" if head else "justify")
        y2 = p.para(rx, y, col, ru, size, head, serif, align="left" if head else "justify")
        return max(y1, y2) + (4 if head else 10)

    p.vline(L + col + 15, y - 6, BOTTOM - 20, 1, color=FAINT)
    y = clause(
        f"{f(doc, 'seller')}, {seller['address']}, in the person of Director {seller['manager']}, acting on the basis of the Charter, hereinafter called further \"Seller\", on the one part, and {f(doc, 'buyer')}, {buyer['address']}, in the person of Director {buyer['manager']}, hereinafter called further \"Buyer\", on the other part, have concluded this contract as follows:",
        f"{f(doc, 'seller')}, {seller['address']}, в лице директора {seller['manager']}, действующего на основании Устава, именуемое в дальнейшем «Продавец», с одной стороны, и {f(doc, 'buyer')}, {buyer['address']}, в лице директора {buyer['manager']}, именуемое в дальнейшем «Покупатель», с другой стороны, заключили настоящий контракт о нижеследующем:",
        y,
    )
    sections = [
        ("1. SUBJECT OF THE CONTRACT", "1. ПРЕДМЕТ КОНТРАКТА",
         f"1.1. The Seller sells and the Buyer buys {f(doc, 'goods').lower()} (HS {f(doc, 'hs_code') or sh['hs']}), hereinafter referred to as \"Product\", on delivery terms {f(doc, 'incoterms')} (Incoterms 2020).",
         f"1.1. Продавец продает, а Покупатель покупает {sh.get('goodsRu', f(doc, 'goods')).lower()} (код ТН ВЭД {f(doc, 'hs_code') or sh['hs']}), именуемое в дальнейшем «Товар», на условиях поставки {f(doc, 'incoterms')} (Инкотермс 2020)."),
        ("2. QUANTITY OF PRODUCT", "2. КОЛИЧЕСТВО ТОВАРА",
         f"2.1. Quantity of product: {f(doc, 'quantity')} net, {sh['cartons']} places, {sh.get('packaging', 'in cartons')}. A deviation of ±5% is allowed at the Seller's option.",
         f"2.1. Количество товара: {f(doc, 'quantity')} нетто, {sh['cartons']} мест, упаковка: {sh.get('packaging', 'картонные коробки')}. Допускается отклонение ±5% по выбору Продавца."),
        ("3. PRICE AND CONTRACT COST", "3. ЦЕНА И СТОИМОСТЬ КОНТРАКТА",
         f"3.1. Contract cost: {f(doc, 'total_value')}. 3.2. The price is fixed for the term of the contract and includes packing and marking.",
         f"3.1. Стоимость контракта: {f(doc, 'total_value')}. 3.2. Цена фиксирована на весь срок действия контракта и включает упаковку и маркировку."),
        ("4. TERMS OF PAYMENT", "4. УСЛОВИЯ ОПЛАТЫ",
         "4.1. 100% by bank transfer to the Seller's account within 30 (thirty) banking days of the date of the transport document. 4.2. Bank charges in the Buyer's country are for the Buyer's account, in the Seller's country for the Seller's account.",
         "4.1. 100% банковским переводом на счет Продавца в течение 30 (тридцати) банковских дней с даты транспортного документа. 4.2. Банковские расходы в стране Покупателя несет Покупатель, в стране Продавца — Продавец."),
        ("5. TERMS OF SHIPMENT", "5. УСЛОВИЯ ОТГРУЗКИ",
         f"5.1. {c.transport} transport from {c.origin} to {c.dest} via {sh['borderStations']}. 5.2. Shipment within 30 days of the contract registration in the UEISFTO. 5.3. The Seller hands over: invoice, packing list, certificate of origin, phytosanitary certificate where required, transport document.",
         f"5.1. {c.transport} транспортом из {c.origin} в {c.dest} через {sh['borderStations']}. 5.2. Отгрузка в течение 30 дней с даты регистрации контракта в ЕЭИСВО. 5.3. Продавец передает: счет-фактуру, упаковочный лист, сертификат происхождения, фитосанитарный сертификат (при необходимости), транспортный документ."),
        ("6. QUALITY AND PACKING", "6. КАЧЕСТВО И УПАКОВКА",
         "6.1. The quality of the Product shall conform to the manufacturer's certificate and the standards of the country of origin. 6.2. Packing shall protect the Product during carriage; each place is marked with the contract number.",
         "6.1. Качество Товара должно соответствовать сертификату производителя и стандартам страны происхождения. 6.2. Упаковка должна обеспечивать сохранность Товара при перевозке; каждое место маркируется номером контракта."),
    ]
    for en_h, ru_h, en, ru in sections:
        y = clause(en_h, ru_h, y + 6, head=True)
        y = clause(en, ru, y)

    # page 2
    y = Sheet.top(1) + TOP + 20
    p.vline(L + col + 15, y - 6, Sheet.top(1) + BOTTOM - 20, 1, color=FAINT)
    more = [
        ("7. FORCE MAJEURE", "7. ФОРС-МАЖОР",
         "7.1. Neither party is liable for failure to perform caused by circumstances beyond its control (fire, flood, war, acts of state bodies), confirmed by the Chamber of Commerce of the respective country. 7.2. The affected party notifies the other within 10 days.",
         "7.1. Стороны освобождаются от ответственности за неисполнение обязательств вследствие обстоятельств непреодолимой силы (пожар, наводнение, военные действия, акты государственных органов), подтвержденных Торговой палатой соответствующей страны. 7.2. Пострадавшая сторона уведомляет другую в течение 10 дней."),
        ("8. CLAIMS", "8. ПРЕТЕНЗИИ",
         "8.1. Claims on quantity are made within 15 days, on quality within 30 days of the arrival of the Product, with an inspection report of an independent surveyor.",
         "8.1. Претензии по количеству предъявляются в течение 15 дней, по качеству — в течение 30 дней с даты прибытия Товара с приложением акта независимой экспертизы."),
        ("9. ARBITRATION", "9. АРБИТРАЖ",
         "9.1. Disputes not settled by negotiation are referred to the Tashkent International Arbitration Centre (TIAC) under its rules. The applicable law is the law of the Republic of Uzbekistan.",
         "9.1. Споры, не урегулированные путем переговоров, передаются в Ташкентский международный арбитражный центр (TIAC) в соответствии с его регламентом. Применимое право — право Республики Узбекистан."),
        ("10. OTHER CONDITIONS", "10. ПРОЧИЕ УСЛОВИЯ",
         "10.1. The contract enters into force on signature and is valid until 31.12.2027. 10.2. Amendments are valid only in writing. 10.3. Made in two copies in English and Russian, both equally authentic.",
         "10.1. Контракт вступает в силу с момента подписания и действует до 31.12.2027. 10.2. Изменения действительны только в письменной форме. 10.3. Составлен в двух экземплярах на английском и русском языках, имеющих одинаковую силу."),
    ]
    for en_h, ru_h, en, ru in more:
        y = clause(en_h, ru_h, y + 6, head=True)
        y = clause(en, ru, y)
    y = clause("11. LEGAL ADDRESSES AND BANK DETAILS", "11. ЮРИДИЧЕСКИЕ АДРЕСА И РЕКВИЗИТЫ СТОРОН", y + 10, head=True)

    def requisites(x: float, heading: str, party: dict, name: str) -> float:
        yy = y + 4
        p.text(x, yy, heading, 18, True, serif)
        yy += 28
        for line in [name, party["address"], f"TIN / ИНН: {party['tin']}", f"Bank / Банк: {party['bank']}", f"Tel.: {party['phone']}", f"E-mail: {party['email']}"]:
            yy = p.para(x, yy, col, line, 17, face=serif, color=FILL)
        return yy

    end = max(requisites(lx, "SELLER / ПРОДАВЕЦ", seller, f(doc, "seller")), requisites(rx, "BUYER / ПОКУПАТЕЛЬ", buyer, f(doc, "buyer")))
    y = end + 50
    for x, party in ((lx, seller), (rx, buyer)):
        p.text(x, y, "Director / Директор", 17, face=serif)
        p.hline(x, x + 260, y + 70)
        p.signature(x + 30, y + 58, 170)
        p.text(x, y + 78, f"/ {party['manager']} /", 17, face=serif, color=FILL)
        p.text(x, y + 108, "М.П. / L.S.", 15, face=serif, color=LABEL)
    company_seal(p, lx + 360, y + 70, seller)
    p.seal(rx + 360, y + 70, f"{re.sub(r'[^A-Za-z ]', '', buyer['name']).upper()[:26]} · DEMO", ["SEAL", "DEMO"], radius=76, color=SEAL_VIOLET)
    if f(doc, "ueisfto_id") or c.values.get("Identification number of foreign trade contract"):
        p.box_stamp(L, y + 170, ["ЕЭИСВО / UEISFTO", f"Идентификационный номер {f(doc, 'ueisfto_id') or c.values.get('Identification number of foreign trade contract')}"])
    return p


def packing_list(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    sh, seller, buyer = c.sh, c.seller, c.buyer
    p.text(W / 2, TOP + 14, f"УПАКОВОЧНЫЙ ЛИСТ № {f(doc, 'list_no')}", 30, True, align="center")
    p.text(W / 2, TOP + 52, f"PACKING LIST № {f(doc, 'list_no')}", 26, True, align="center")
    p.text(W / 2, TOP + 90, f"от / dd. {f(doc, 'list_date')}", 20, align="center")
    y = TOP + 136
    half = (R - L) / 2
    parties = [
        ("Продавец / Seller", seller, f(doc, "seller")),
        ("Покупатель / Buyer", buyer, buyer["name"]),
        ("Грузоотправитель / Shipper", seller, f(doc, "seller")),
        ("Грузополучатель / Consignee", buyer, f(doc, "consignee")),
    ]
    for i, (label, party, name) in enumerate(parties):
        x = L + (i % 2) * half
        yy = y + (i // 2) * 150
        p.rect(x, yy, x + half, yy + 150, 1)
        p.text(x + 8, yy + 6, label, 16, True)
        p.text(x + 8, yy + 32, name, 19, color=FILL)
        p.para(x + 8, yy + 58, half - 16, party["address"], 16, color=FILL)
        p.text(x + 8, yy + 100, f"ИНН: {party['tin'] if party is seller or party['tin'] != '—' else '—'}", 16, color=FILL)
        p.text(x + 8, yy + 124, f"Tel.: {party['phone']}", 16, color=FILL)
    y += 320
    p.text(L, y, f"Контракт / Contract: {sh['contractNo']} от {sh['contractDate']}    Инвойс / Invoice: {sh['invoiceNo']} от {sh['invoiceDate']}", 17)
    y += 34
    places = int(amount_value(f(doc, "packages")) or 1)
    net = amount_value(f(doc, "net_weight"))
    gross = amount_value(f(doc, "gross_weight"))
    cols = [(50, "№"), (310, "Наименование товара / Name of product"), (160, "Код ТН ВЭД / H.S. code"), (210, "Упаковка / Packaging"), (130, "Количество упаковок / Number of packages"), (130, "Вес нетто, кг / Net weight"), (130, "Вес брутто, кг / Gross weight")]
    marks = [(1, places // 2), (places // 2 + 1, places)]
    rows = []
    for i, (a, b) in enumerate(marks, 1):
        share = (b - a + 1) / places
        rows.append([str(i), f"{f(doc, 'goods')} (места {a}–{b})", f(doc, "hs_code"), f(doc, "packaging"), str(b - a + 1), money(net * share, 0), money(gross * share, 0)])
    rows.append(["", "ИТОГО / TOTAL", "", "", f(doc, "packages"), f(doc, "net_weight"), f(doc, "gross_weight")])
    y = p.table(L, y, cols, rows, hs=13, rs=17, min_h=40, align=["center", "left", "center", "left", "right", "right", "right"], bold_last=True)
    y += 30
    p.kv_table(L, y, (380, R - L - 380), [
        ("Наименование товара / Name of product", f(doc, "goods")),
        ("Количество упаковок / Number of packages", f(doc, "packages")),
        ("Вес нетто / Net weight", f(doc, "net_weight")),
        ("Вес брутто / Gross weight", f(doc, "gross_weight")),
        ("Маркировка / Marks", f"{sh['contractNo']} · 1–{places}"),
        ("Транспорт / Transport", f"{c.transport}: {c.unit_list}"),
    ])
    y += 6 * 34 + 60
    signature_block(p, L, y, "Директор / Director", seller["manager"])
    company_seal(p, R - 160, y + 20, seller)
    return p


def passport(doc, c: Ctx) -> Sheet:
    """Deliberately a specimen card, not a replica of a travel document."""
    p = Sheet(seed=doc["file"])
    p.watermark("SPECIMEN")
    p.text(W / 2, TOP + 20, "IDENTITY DATA PAGE — FICTIONAL SPECIMEN", 28, True, align="center")
    p.text(W / 2, TOP + 60, "Demo pack only. Not an identity document and not modelled on any state's passport.", 17, color=LABEL, align="center")
    x0, y0 = L + 40, TOP + 130
    p.rect(x0, y0, R - 40, y0 + 620, 3, color=(120, 120, 140))
    p.rect(x0 + 30, y0 + 40, x0 + 290, y0 + 380, 2, fill=(236, 238, 244))
    p.text(x0 + 160, y0 + 200, "PHOTO", 26, True, color=FAINT, align="center")
    name = f(doc, "full_name").split()
    rows = [
        ("Type / Тип", "P"),
        ("Surname / Фамилия", name[0] if name else ""),
        ("Given names / Имя", " ".join(name[1:])),
        ("Passport No / Номер паспорта", f(doc, "passport_no")),
        ("Nationality / Гражданство", "DEMO"),
        ("Date of expiry / Срок действия", f(doc, "expiry")),
    ]
    yy = y0 + 40
    for label, value in rows:
        p.text(x0 + 330, yy, label, 16, color=LABEL)
        p.text(x0 + 330, yy + 22, value, 24, True, color=FILL)
        yy += 60
    p.text(x0 + 30, y0 + 420, "Holder's signature / Подпись владельца", 15, color=LABEL)
    p.signature(x0 + 60, y0 + 470, 200)
    p.text(x0 + 30, y0 + 560, "SPECIMEN · DEMO · SPECIMEN · DEMO · SPECIMEN · DEMO · SPECIMEN · DEMO", 18, True, "mono", color=FAINT)
    return p


def poa(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    t = c.trader
    serif = "sans"
    p.text(L, TOP + 10, t["name"], 20, True, serif)
    p.text(L, TOP + 36, f"{t['address']} · ИНН {t['tin']} · {t['bank']}", 15, face=serif, color=LABEL)
    p.hline(L, R, TOP + 62, 2)
    p.text(W / 2, TOP + 96, f"ДОВЕРЕННОСТЬ № {f(doc, 'poa_no')}", 32, True, serif, align="center")
    p.text(W / 2, TOP + 138, "POWER OF ATTORNEY", 20, face=serif, color=LABEL, align="center")
    y = TOP + 190
    p.text(L, y, f"г. {c.city(t['address'] or 'Tashkent')}", 20, face=serif)
    p.text(R, y, f"Дата: {f(doc, 'issue_date')}", 20, face=serif, align="right")
    y += 50
    y = p.para(L, y, R - L, f"{t['name']} (ИНН {t['tin']}), в лице директора {t['manager']}, действующего на основании Устава, настоящей доверенностью уполномочивает:", 20, face=serif, align="justify", indent=40)
    y += 14
    y = p.field_line(L, y, R - L, "Доверенность выдана", f(doc, "representative"), 20, face=serif)
    y = p.field_line(L, y, R - L, "серия паспорта", f(doc, "passport"), 20, face=serif)
    y = p.field_line(L, y, R - L, "выдан", f"ОВД Юнусабадского района г. Ташкента, {c.date(doc, 'issue_date')[:6]}2019", 20, face=serif)
    y = p.field_line(L, y, R - L, "проживающему по адресу", f"г. Ташкент, ул. Демо, д. {c.num(doc, 2)}, кв. {c.num(doc, 2, 'kv')}", 20, face=serif)
    y += 10
    y = p.para(L, y, R - L, "представлять интересы Общества и совершать от его имени следующие действия:", 20, face=serif)
    powers = [
        "получать и отправлять грузы на железнодорожных станциях, в аэропортах и на складах временного хранения;",
        "выполнять таможенные операции и присутствовать при таможенном досмотре и осмотре товаров;",
        "присутствовать при карантинном и фитосанитарном контроле, отборе проб и фумигации;",
        "подписывать, получать и подавать документы, связанные с перевозкой и оформлением грузов:",
        f"по поставке — {c.case_line}.",
    ]
    for i, text in enumerate(powers, 1):
        y = p.para(L + 30, y + 4, R - L - 30, f"{i}. {text}", 19, face=serif)
    y += 16
    y = p.field_line(L, y, R - L, "Доверенность выдана сроком до", f(doc, "valid_until"), 20, face=serif)
    y = p.para(L, y + 6, R - L, "Полномочия по настоящей доверенности не могут быть передоверены третьим лицам.", 19, face="italic")
    y += 30
    p.text(L, y, "Подпись лица, получившего доверенность", 18, face=serif)
    p.hline(L + 420, L + 640, y + 22)
    p.signature(L + 430, y + 10, 150)
    p.text(L + 660, y, "удостоверяем.", 18, face=serif)
    y += 90
    signature_block(p, L, y, "Директор", t["manager"])
    signature_block(p, L, y + 70, "Главный бухгалтер", f"{c.initial(doc)}. Karimova")
    p.text(L, y + 150, "М.П.", 18, face=serif, color=LABEL)
    company_seal(p, L + 700, y + 70, t, radius=90)
    return p


# ---------------------------------------------------------------- payments ---


def _supplier_for(doc: dict, c: Ctx) -> dict:
    rng = c.rng(doc)
    return {
        "name": f(doc, "supplier"),
        "address": "г. Ташкент, Мирабадский р-н, ул. Демо, " + str(rng.randint(2, 90)),
        "inn": f(doc, "supplier_inn"),
        "oked": f"{rng.randint(49, 84)}{rng.randint(100, 999)}",
        "account": "2020 8000 " + " ".join(f"{rng.randint(1000, 9999)}" for _ in range(3)),
        "bank": "АКБ «Demo Bank», Ташкентский филиал",
        "mfo": "00" + str(rng.randint(400, 999)),
    }


def invoice_for_payment(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    sup = _supplier_for(doc, c)
    t = c.trader
    y = TOP + 10
    y = p.kv_table(L, y, (240, R - L - 240), [
        ("Поставщик", sup["name"]),
        ("Юридический адрес", sup["address"]),
        ("ИНН", sup["inn"]),
        ("ОКЭД", sup["oked"]),
        ("Расчетный счет", sup["account"]),
        ("Банк", f"{sup['bank']}, МФО {sup['mfo']}"),
    ], ls=16, vs=18, min_h=30)
    y += 30
    p.text(W / 2, y, f"СЧЕТ на оплату № {f(doc, 'invoice_no')}", 32, True, align="center")
    p.text(W / 2, y + 44, f"Дата: {f(doc, 'invoice_date')}", 22, align="center")
    p.text(W / 2, y + 76, f"к договору № {f(doc, 'contract_no')}", 19, color=LABEL, align="center")
    y += 120
    y = p.kv_table(L, y, (240, R - L - 240), [
        ("Заказчик", f(doc, "customer")),
        ("Адрес", t["address"]),
        ("ИНН заказчика", t["tin"]),
        ("Расчетный счет", t["bank"]),
    ], ls=16, vs=18, min_h=30)
    y += 26
    total = amount_value(f(doc, "total"))
    rate = amount_value(f(doc, "vat_rate")) or 12
    vat = total * rate / (100 + rate)
    net = total - vat
    service = title_of(doc).replace("Invoice for payment", "").strip(" —-") or "Услуги"
    cols = [(40, "№"), (340, "Наименование товаров (услуг)"), (70, "Ед. изм."), (70, "Кол-во"), (140, "Цена"), (140, "Стоимость"), (90, "Ставка НДС, %"), (110, "Сумма НДС"), (120, "Всего с НДС")]
    rows = [["1", f"{service} — {c.case_line}", "усл.", "1", money(net), money(net), f(doc, "vat_rate"), money(vat), money(total)],
            ["", "Итого", "", "", "", money(net), "", money(vat), money(total)]]
    y = p.table(L, y, cols, rows, hs=13, rs=16, min_h=34, align=["center", "left", "center", "center", "right", "right", "center", "right", "right"], bold_last=True)
    y += 26
    p.text(L, y, f"Всего к оплате: {f(doc, 'total')} UZS", 22, True)
    y += 36
    p.para(L, y, R - L, f"Сумма прописью: {sum_in_words(total)}, в т.ч. НДС {money(vat)} сум.", 18, face="italic")
    y += 60
    p.para(L, y, R - L, f"Оплата по настоящему счету означает согласие с условиями договора. Счет действителен в течение 5 банковских дней. В назначении платежа укажите номер счета {f(doc, 'invoice_no')}.", 16, color=LABEL)
    y += 90
    signature_block(p, L, y, "Руководитель", f"{c.initial(doc, 'a')}. Yusupov")
    signature_block(p, L, y + 70, "Главный бухгалтер", f"{c.initial(doc, 'b')}. Aminova")
    p.seal(L + 780, y + 60, f"{re.sub(r'[^A-Za-z ]', '', sup['name']).upper()[:28]} · TOSHKENT", ["DEMO", f"STIR {sup['inn']}"], radius=88)
    p.qr(R - 140, BOTTOM - 180, 130, seed=doc["file"])
    return p


def _receipt_copy(p: Sheet, doc, c: Ctx, top: float, copy: str) -> float:
    t = c.trader
    left = 250
    p.rect(L, top, R, top + 780, 2)
    p.vline(L + left, top, top + 780, 2)
    p.text(L + left / 2, top + 20, copy, 20, True, align="center")
    p.text(L + left / 2, top + 690, "Кассир", 17, align="center")
    p.signature(L + 40, top + 735, 160)
    x = L + left + 14
    width = R - x - 14
    y = top + 12
    p.text(x + width / 2, y, f"КВИТАНЦИЯ № {f(doc, 'receipt_no')}", 22, True, align="center")
    y += 36
    y = p.field_line(x, y, width, "Получатель платежа:", f(doc, "recipient"), 16, 18)
    y = p.field_line(x, y, width, "Банк получателя:", "РКЦ ЦБ РУз, г. Ташкент", 16, 18)
    p.text(x, y, "Счет:", 16)
    p.digit_boxes(x + 60, y - 4, "23402000300100001010", box=22)
    p.text(x + 540, y, "Код банка:", 16)
    p.digit_boxes(x + 640, y - 4, "00014", box=22)
    y += 44
    y = p.field_line(x, y, width, "Плательщик:", f(doc, "payer"), 16, 18)
    y = p.field_line(x, y, width, "Адрес:", t["address"], 16, 18)
    y = p.field_line(x, y, width, "ИНН:", re.sub(r"\D", "", f(doc, "payer_inn"))[:9], 16, 19)
    y = p.field_line(x, y, width, "Вид платежа / description:", f(doc, "payment_type"), 16, 18)
    y = p.field_line(x, y, width, "Назначение:", f"{f(doc, 'payment_type')}; {c.case_line}; договор {c.sh['contractNo']}", 16, 17)
    amount = f(doc, "amount")
    y = p.table(x, y + 4, [(width * 0.34, "Вид налога"), (width * 0.22, "Недоимка"), (width * 0.22, "Текущий платеж"), (width * 0.22, "Пеня")], [[f(doc, "payment_type"), "0", amount, "0"]], hs=13, rs=16, min_h=30)
    y += 12
    p.text(x, y, f"Итого: {amount} UZS", 20, True)
    y += 30
    p.para(x, y, width, f"Сумма прописью: {sum_in_words(amount_value(amount))}", 15, face="italic")
    y += 44
    p.text(x, y, "Подпись:", 15, color=LABEL)
    p.signature(x + 110, y + 10, 130)
    p.text(x + 420, y, f"Дата: {f(doc, 'date')}", 18)
    y += 50
    p.text(x, y, f"Банк плательщика: {t['bank']}", 15, color=LABEL)
    p.text(x, y + 24, f"Операция № {c.num(doc, 10, copy)} · платежный терминал DEMO-{c.num(doc, 4, 'term')}", 15, color=LABEL)
    return top + 780


def receipt(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    p.text(W / 2, TOP + 6, "ИЗВЕЩЕНИЕ / КВИТАНЦИЯ ОБ ОПЛАТЕ · RECEIPT OF PAYMENT", 20, True, align="center")
    end = _receipt_copy(p, doc, c, TOP + 40, "ИЗВЕЩЕНИЕ")
    p.dotted(L, R, end + 22)
    p.text(W / 2, end + 6, "линия отреза", 13, color=FAINT, align="center")
    _receipt_copy(p, doc, c, end + 40, "КВИТАНЦИЯ")
    p.box_stamp(R - 330, TOP + 380, ["DEMO BANK · ОПЛАЧЕНО", "PAID", f(doc, "date")], color=SEAL)
    return p


def offer(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    t = c.trader
    service = f(doc, "service") or title_of(doc)
    amount = f(doc, "amount")
    units = f(doc, "units") or "1"
    unit_price = amount_value(amount) / max(1.0, amount_value(units))
    p.emblem(L + 50, TOP + 60, 40)
    p.text(L + 110, TOP + 18, "O'SIMLIKLAR KARANTINI VA HIMOYASI AGENTLIGI (DEMO)", 18, True)
    p.text(L + 110, TOP + 44, "Агентство по карантину и защите растений · Agency of Plant Quarantine and Protection", 15, color=LABEL)
    p.qr(R - 120, TOP + 6, 110, seed=doc["file"])
    y = TOP + 150
    p.text(W / 2, y, f"Оферта шартномаси № {f(doc, 'agreement_no')}", 30, True, align="center")
    p.text(W / 2, y + 40, "Offer agreement (public offer)", 18, color=LABEL, align="center")
    y += 90
    p.text(L, y, f"Тошкент шаҳар  {f(doc, 'agreement_date')}", 20)
    y += 40
    y = p.para(L, y, R - L, f"Бир томондан Ўсимликлар карантини ва ҳимояси агентлиги (кейинги ўринларда «Инспекция»), иккинчи томондан {t['name']} (кейинги ўринларда «Буюртмачи») ушбу оферта шартномасини қуйидагилар ҳақида туздилар:", 18, align="justify", indent=30)
    y += 10
    terms = [
        ("1. Шартнома предмети.", f"Инспекция Буюртмачига «{service}» хизматини кўрсатади, Буюртмачи эса хизмат ҳақини тўлайди."),
        ("2. Хизмат ҳақи ва тўлов тартиби.", "Хизмат ҳақи 100% олдиндан тўланади. Тўлов оферта рақами кўрсатилган ҳолда амалга оширилади; тўлов амалга оширилиши оферта шартларини қабул қилишни англатади."),
        ("3. Томонларнинг мажбуриятлари.", "Инспекция тўлов тушган кундан бошлаб 3 иш куни ичида хизмат кўрсатади. Буюртмачи юкни кўрик учун тақдим этади."),
        ("4. Амал қилиш муддати.", "Шартнома тўлов амалга оширилган кундан кучга киради ва мажбуриятлар тўлиқ бажарилгунга қадар амал қилади."),
    ]
    for head, body in terms:
        p.text(L, y, head, 18, True)
        y = p.para(L, y + 26, R - L, body, 17, align="justify") + 6
    y += 8
    cols = [(50, "№"), (470, "Хизмат номи / Наименование услуги"), (170, "Нархи, сўм"), (150, "Миқдори / Кол-во"), (280, "Сумма")]
    y = p.table(L, y, cols, [["1", service, money(unit_price, 0), units, amount], ["", "Жами / Итого", "", "", amount]], hs=14, rs=18, min_h=36, align=["center", "left", "right", "center", "right"], bold_last=True)
    y += 16
    p.text(L, y, f"Сумма: {amount} UZS", 20, True)
    y += 30
    p.para(L, y, R - L, f"({sum_in_words(amount_value(amount))})", 16, face="italic")
    y += 50
    half = (R - L) / 2
    p.text(L, y, "ИНСПЕКЦИЯ", 18, True)
    p.text(L + half, y, "БУЮРТМАЧИ / Applicant", 18, True)
    y += 30
    left_rows = ["Toshkent sh., Demo ko'chasi, 1", "STIR 201 122 919", "Hisob raqami 2340 2000 3001 0000 1010", "Bank: MB HKKM, MFO 00014"]
    right_rows = [
        ("Tax Identification Number of the organization or individual", t["tin"]),
        ("Name of the organization", t["name"]),
        ("Full name of an organization's manager", t["manager"]),
        ("Contact phone number", t["phone"]),
        ("Agency region", c.values.get("Agency region", "Tashkent region")),
    ]
    yl = y
    for line in left_rows:
        p.text(L, yl, line, 16, color=FILL)
        yl += 26
    yr = y
    for label, value in right_rows:
        p.text(L + half, yr, label, 13, color=LABEL)
        p.text(L + half, yr + 17, value, 17, color=FILL)
        yr += 44
    p.seal(L + 300, yl + 60, "O'SIMLIKLAR KARANTINI AGENTLIGI · DEMO", ["INSPEKSIYA", "DEMO"], radius=80)
    p.text(L, BOTTOM - 70, "Ушбу оферта электрон шаклда яратилган ва QR-код орқали текширилади / Generated electronically, verifiable by QR code.", 14, color=LABEL)
    return p


# -------------------------------------------------------------- transport ---


def gu12(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    t = c.trader
    p.text(R, TOP + 6, "Форма ГУ-12", 18, True, align="right")
    p.text(W / 2, TOP + 30, "ЗАЯВКА НА ПЕРЕВОЗКУ ГРУЗОВ (форма ГУ-12)", 28, True, align="center")
    p.text(W / 2, TOP + 68, f"№ {c.num(doc, 7)}   на {c.date(doc)[3:]} · Application for cargo transportation GU-12", 17, color=LABEL, align="center")
    p.text(W / 2, TOP + 94, "Перевозчик: АО «Узбекистон темир йуллари» (JSC Uzbekistan Temir Yo'llari)", 17, align="center")
    y = TOP + 130
    w1 = (R - L) * 0.6
    p.cell(L, y, w1, 90, "Наименование и почтовый адрес отправителя", f"{f(doc, 'shipper')}, {t['address']}", vs=19)
    p.cell(L + w1, y, R - L - w1, 90, "ИНН/ОКПО", f"{t['tin']} / {c.num(doc, 8, 'okpo')}", vs=19)
    y += 90
    p.cell(L, y, w1, 70, "Наименование станции отправления", f(doc, "departure_station"), vs=20)
    p.cell(L + w1, y, R - L - w1, 70, "Код станции / дороги", f"{c.num(doc, 6, 'st')} / 73", vs=20)
    y += 70
    p.cell(L, y, R - L, 60, "Способ отправки / Род вагона", "Повагонная · крытый вагон (КР)" if c.mode == "rail" else "—", vs=19)
    y += 80
    cols = [(160, "Станции и дороги назначения"), (110, "Страна назначения"), (200, "Наименование грузополучателя"), (200, "Точное наименование груза"), (110, "Код груза ЕТСНГ"), (90, "Кол-во тонн"), (110, "Количество вагонов"), (140, "Собственник")]
    row = [f(doc, "destination_station"), c.country(c.dest), f(doc, "consignee"), f(doc, "cargo"), f(doc, "etsng"), f(doc, "tonnes"), f(doc, "wagons"), "Инвентарный парк"]
    y = p.table(L, y, cols, [row, [""] * 8, [""] * 8], hs=12, rs=16, min_h=40, numbered_header=True, align=["left", "left", "left", "left", "center", "center", "center", "left"])
    y += 20
    p.text(L, y, "Распределение по датам погрузки / Loading schedule", 17, True)
    y += 28
    days = [(90, "Дата")] + [(51, str(d)) for d in range(1, 21)]
    wagons = int(amount_value(f(doc, "wagons")) or 1)
    sched = ["Вагонов"] + [""] * 20
    for i in range(wagons):
        sched[1 + (4 + i * 2) % 20] = "1"
    y = p.table(L, y, days, [sched, ["Тонн"] + [("%.0f" % (amount_value(f(doc, "tonnes")) / wagons) if v else "") for v in sched[1:]]], hs=12, rs=14, min_h=28, align=["left"] + ["center"] * 20)
    y += 26
    y = p.kv_table(L, y, (420, R - L - 420), [
        ("Пограничные станции перехода", c.sh["borderStations"]),
        ("Экспедитор / плательщик тарифа", f"{t['name']}, код плательщика {c.num(doc, 7, 'pay')}"),
        ("Контракт", f"{c.sh['contractNo']} от {c.sh['contractDate']}"),
    ], ls=16, vs=17)
    y += 40
    signature_block(p, L, y, "Подпись грузоотправителя", t["manager"])
    company_seal(p, L + 820, y + 30, t)
    y += 150
    p.rect(L, y, R, y + 150, 1, fill=(246, 246, 246))
    p.text(L + 10, y + 8, "Отметки перевозчика / Carrier's approval", 16, True)
    p.text(L + 10, y + 40, f"Заявка согласована. Рег. № {c.num(doc, 6, 'reg')}", 18, color=FILL)
    p.box_stamp(R - 340, y + 20, ["ДС СТАНЦИИ · СОГЛАСОВАНО", "APPROVED · DEMO"], color=SEAL_VIOLET, size=18)
    return p


def smgs(doc, c: Ctx) -> Sheet:
    """SMGS consignment note: the numbered-box layout of the 2015 form."""
    p = Sheet(seed=doc["file"])
    rng = c.rng(doc)
    x0, x1, x2 = L, L + 560, R
    y0 = TOP + 8
    kind = title_of(doc)
    p.text(x0, y0, "1 Оригинал накладной (для получателя)", 20, True)
    p.text(x0, y0 + 26, f"Накладная СМГС · {kind}", 16, color=LABEL)
    p.cell(x1 + 250, y0 - 4, x2 - x1 - 250, 56, "", f"29 Отправка № {f(doc, 'dispatch_no')}", vs=22)
    y = y0 + 62
    # left column: 1, 4, 5 ; right: 2, 3
    p.cell(x0, y, x1 - x0, 130, "1 Отправитель", f"{f(doc, 'sender')}, {c.seller['address'] if not c.importing else c.origin}", vs=19)
    p.signature(x1 - 190, y + 112, 110)
    p.cell(x1, y, x2 - x1, 70, "2 Станция отправления", f(doc, "departure_station"), vs=20)
    p.cell(x1, y + 70, x2 - x1, 160, "3 Заявления отправителя", f"Груз следует по контракту {c.sh['contractNo']}. Вагоны: {c.unit_list}. Перевозка по СМГС, оплата провозных платежей по территории УТИ — отправителем.", vs=16)
    p.cell(x0, y + 130, x1 - x0, 100, "4 Получатель", f"{f(doc, 'consignee')}, {c.buyer['address'] if not c.importing else c.trader['address']}", vs=19)
    y += 230
    p.cell(x0, y, x1 - x0, 70, "5 Станция назначения", f(doc, "destination_station"), vs=20)
    labels = [("8 Вагон предост.", "УТИ"), ("9 Кг/подъемность", "68 т"), ("10 Оси", "4"), ("11 Тара, т", "24,5 т"), ("12 Цистерна", "—")]
    cw = (x2 - x1) / 5
    for i, (lab, val) in enumerate(labels):
        p.cell(x1 + i * cw, y, cw, 70, lab, val, ls=12, vs=16)
    y += 70
    p.cell(x0, y, x1 - x0, 190, "6 Пограничные станции", f(doc, "border_stations") or c.sh["borderStations"], vs=19)
    p.cell(x1, y, x2 - x1, 34, "7 Вагон", "", ls=15)
    wagons = [w.strip() for w in (f(doc, "wagon_no") or c.unit_list).split(",") if w.strip()] or ["—"]
    weight = amount_value(f(doc, "weight"))
    per = weight / len(wagons) if wagons else weight
    rows = [[w, "УТИ", "68", "4", "24,5", money(per, 0)] for w in wagons]
    p.table(x1, y + 34, [(cw * 1.4, "№ вагона"), (cw * 1.1, "8"), (cw * 0.6, "9"), (cw * 0.5, "10"), (cw * 0.6, "11"), (cw * 0.8, "13 Масса груза")], rows + [[""] * 6] * max(0, 3 - len(rows)), hs=12, rs=15, min_h=26)
    y += 190
    # goods row
    gw = [(x1 - x0), (x2 - x1) * 0.3, (x2 - x1) * 0.2, (x2 - x1) * 0.25, (x2 - x1) * 0.25]
    xs = [x0, x1, x1 + gw[1], x1 + gw[1] + gw[2], x1 + gw[1] + gw[2] + gw[3]]
    hrow = 330
    p.cell(xs[0], y, gw[0], hrow, "15 Наименование груза", f"{f(doc, 'cargo')}\nКод ГНГ {c.sh['hs'].replace(' ', '')[:8]} · ЕТСНГ {c.num(doc, 6, 'etsng')}\nМарки: {c.sh['contractNo']}", vs=18)
    p.cell(xs[1], y, gw[1], hrow, "16 Род упаковки", f(doc, "packaging") or c.sh.get("packaging", ""), ls=13, vs=16)
    p.cell(xs[2], y, gw[2], hrow, "17 К-во мест", f(doc, "places") or c.sh["cartons"], ls=13, vs=17)
    p.cell(xs[3], y, gw[3], hrow, "18 Масса", f(doc, "weight"), ls=13, vs=17)
    seals = f(doc, "seals") or ", ".join(c.seals)
    p.cell(xs[4], y, gw[4], hrow, "19 Пломбы", f"к-во {len([s for s in seals.split(',') if s.strip()]) or '—'}\n{seals or '—'}", ls=13, vs=15)
    y += hrow
    p.cell(x0, y, x1 - x0, 60, "20 Погружено", "отправителем", vs=17)
    p.cell(x1, y, x2 - x1, 60, "21 Способ определения массы", "на вагонных весах", vs=17)
    y += 60
    p.cell(x0, y, x1 - x0, 150, "23 Уплата провозных платежей", f"до {f(doc, 'border_stations').split(',')[0] if f(doc, 'border_stations') else 'границы'} — отправителем; далее — получателем. Код плательщика {c.num(doc, 7, 'payer')}", vs=16)
    p.table(x1, y, [((x2 - x1) * 0.45, "22 Перевозчики"), ((x2 - x1) * 0.3, "Участок от/до"), ((x2 - x1) * 0.25, "Коды станций")],
            [["АО «УТИ»", f"{f(doc, 'departure_station')} — граница", c.num(doc, 6, 'a')], ["Следующий перевозчик", f"граница — {f(doc, 'destination_station')}", c.num(doc, 6, 'b')]], hs=12, rs=14, min_h=28)
    y += 150
    docs_attached = f(doc, "documents_attached") or f"Инвойс {c.sh['invoiceNo']}"
    p.cell(x0, y, x1 - x0, 170, "24 Документы, приложенные", docs_attached, vs=16)
    p.cell(x1, y, x2 - x1, 170, "25 Информация, не предназначенная для перевозчика, № договора на поставку", f"Контракт {c.sh['contractNo']} от {c.sh['contractDate']}", vs=16)
    y += 170
    cw3 = (x1 - x0) / 2
    p.cell(x0, y, cw3, BOTTOM - 20 - y, "26 Дата заключения договора перевозки", c.date(doc), vs=18)
    p.cell(x0 + cw3, y, cw3, BOTTOM - 20 - y, "27 Дата прибытия", "", vs=18)
    p.cell(x1, y, x2 - x1, BOTTOM - 20 - y, "28 Отметки для выполнения таможенных и других административных формальностей", "", ls=13)
    if doc.get("stamp") == "customs":
        p.box_stamp(x1 + 40, y + 10, ["ТАМОЖЕННЫЙ ПОСТ · ВЫПУСК РАЗРЕШЕН", "CUSTOMS · RELEASED · DEMO", c.date(doc)], color=SEAL_VIOLET, size=17)
    if doc.get("stamp") == "datestamp":
        p.box_stamp(x0 + 20, y - 260, ["КАЛЕНДАРНЫЙ ШТЕМПЕЛЬ", "STATION DATESTAMP", c.date(doc)], color=SEAL, size=20)
    else:
        p.seal(x0 + cw3 / 2, y + 150, f"{f(doc, 'departure_station').upper()[:18]} · СТАНЦИЯ · DEMO", ["ДЕМО", c.date(doc)], radius=62, color=SEAL)
    return p


def cmr(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    x0, xm, x1 = L, (L + R) / 2, R
    y = TOP + 6
    p.text(x0, y, "1 Экземпляр для отправителя / Copy for sender", 15, color=LABEL)
    p.text(xm + 10, y, f"CMR № {f(doc, 'cmr_no')}", 26, True)
    y += 30
    p.cell(x0, y, xm - x0, 120, "1 Отправитель / Sender", f"{f(doc, 'sender')}, {c.origin}", ls=13, vs=18)
    p.cell(xm, y, x1 - xm, 120, "", "", ls=13)
    p.text(xm + 10, y + 12, "МЕЖДУНАРОДНАЯ ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ", 17, True)
    p.text(xm + 10, y + 40, "INTERNATIONAL CONSIGNMENT NOTE", 17, True)
    p.para(xm + 10, y + 68, x1 - xm - 20, "Настоящая перевозка осуществляется в соответствии с Конвенцией о договоре международной дорожной перевозки грузов (КДПГ/CMR).", 12, color=LABEL)
    y += 120
    p.cell(x0, y, xm - x0, 110, "2 Получатель / Consignee", f"{f(doc, 'consignee')}, {c.dest}", ls=13, vs=18)
    p.cell(xm, y, x1 - xm, 110, "16 Перевозчик / Carrier", f(doc, "carrier"), ls=13, vs=18)
    y += 110
    p.cell(x0, y, xm - x0, 80, "3 Место разгрузки / Place of delivery", f(doc, "delivery_place"), ls=13, vs=18)
    p.cell(xm, y, x1 - xm, 80, "17 Последующий перевозчик / Successive carriers", "—", ls=13, vs=18)
    y += 80
    p.cell(x0, y, xm - x0, 80, "4 Место и дата погрузки / taking over", f(doc, "loading_place"), ls=13, vs=18)
    p.cell(xm, y, x1 - xm, 160, "18 Оговорки и замечания перевозчика / Carrier's reservations", "Груз принят без замечаний. Пломбы: " + (", ".join(c.seals) or "—"), ls=13, vs=16)
    y += 80
    p.cell(x0, y, xm - x0, 80, "5 Прилагаемые документы / Documents attached", f"Invoice {c.sh['invoiceNo']}, packing list, certificate of origin", ls=13, vs=16)
    y += 80
    cols = [(150, "6 Знаки и номера / Marks and Nos"), (140, "7 Количество мест"), (150, "8 Род упаковки / Method of packing"), (260, "9 Наименование груза"), (130, "10 Стат. номер / Statistical number"), (140, "11 Вес брутто / Gross weight"), (150, "12 Объем, м³ / Volume")]
    y = p.table(x0, y, cols, [[c.sh["contractNo"], f(doc, "places"), c.sh.get("packaging", ""), f(doc, "goods"), c.sh["hs"].replace(" ", "")[:6], f(doc, "weight"), str(round(amount_value(f(doc, 'weight')) / 350, 1))], [""] * 7, [""] * 7], hs=11, rs=15, min_h=34)
    p.cell(x0, y, xm - x0, 90, "13 Указания отправителя / Sender's instructions", "Температурный режим не требуется. Таможенное оформление в месте назначения.", ls=13, vs=15)
    p.cell(xm, y, x1 - xm, 90, "19 Особые согласования / Special agreements", f"Контракт {c.sh['contractNo']}; {c.sh.get('incoterms', '')}", ls=13, vs=15)
    y += 90
    p.cell(x0, y, xm - x0, 80, "14 Возврат / Cash on delivery", "—", ls=13, vs=16)
    p.table(xm, y, [(180, "20 Подлежит оплате / To be paid by"), (130, "Отправитель"), (130, "Получатель")], [["Провозная плата / Carriage charges", "—", "по договору"], ["Итого / Total", "", ""]], hs=11, rs=13, min_h=24)
    y += 80
    p.cell(x0, y, xm - x0, 70, "15 Условия оплаты / Terms of payment", "Франко / Carriage paid", ls=13, vs=16)
    y += 70
    p.cell(x0, y, (x1 - x0) / 3, 60, "21 Составлена в / Established in", c.city(c.origin), ls=13, vs=16)
    p.cell(x0 + (x1 - x0) / 3, y, (x1 - x0) / 3, 60, "Составлена / Established on", f(doc, "issue_date"), ls=13, vs=17)
    p.cell(x0 + 2 * (x1 - x0) / 3, y, (x1 - x0) / 3, 60, "Регистрационный номер / Vehicle registration", f(doc, "vehicle"), ls=13, vs=16)
    y += 60
    w3 = (x1 - x0) / 3
    heads = ["22 Подпись и штамп отправителя / Signature and stamp of the sender", "23 Подпись и штамп перевозчика / Signature and stamp of the carrier", "24 Груз получен / Goods received — подпись и штамп получателя"]
    for i, head in enumerate(heads):
        p.cell(x0 + i * w3, y, w3, BOTTOM - 20 - y, head, "", ls=12)
    p.signature(x0 + 60, y + 90, 150)
    p.seal(x0 + 260, y + 110, f"{re.sub(r'[^A-Za-z ]', '', f(doc, 'sender')).upper()[:22]} · DEMO", ["SENDER"], radius=60, color=SEAL)
    p.signature(x0 + w3 + 60, y + 90, 150)
    p.seal(x0 + w3 + 260, y + 110, f"{re.sub(r'[^A-Za-z ]', '', f(doc, 'carrier')).upper()[:22]} · DEMO", ["CARRIER"], radius=60, color=SEAL_VIOLET)
    return p


def awb(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    x0, xm, x1 = L, (L + R) / 2, R
    no = f(doc, "awb_no")
    y = TOP + 4
    p.text(x0, y, no.replace("-", " "), 24, True, "mono")
    p.text(x1, y, no, 24, True, "mono", align="right")
    y += 36
    p.cell(x0, y, xm - x0, 130, "Shipper's Name and Address", f"{f(doc, 'shipper')}\n{c.seller['address']}", ls=14, vs=17)
    p.cell(xm, y, x1 - xm, 130, "", "", ls=14)
    p.text(xm + 12, y + 10, "Not negotiable", 15, color=LABEL)
    p.text(xm + 12, y + 32, "AIR WAYBILL", 30, True)
    p.text(xm + 12, y + 70, "Issued by  UZBEKISTAN AIRWAYS CARGO (demo)", 16)
    p.text(xm + 12, y + 94, "Copies 1, 2 and 3 of this Air Waybill are originals and have the same validity.", 12, color=LABEL)
    y += 130
    p.cell(x0, y, xm - x0, 120, "Consignee's Name and Address", f"{f(doc, 'consignee')}\n{c.buyer['address']}", ls=14, vs=17)
    p.cell(xm, y, x1 - xm, 120, "", "It is agreed that the goods described herein are accepted in apparent good order and condition for carriage SUBJECT TO THE CONDITIONS OF CONTRACT ON THE REVERSE HEREOF.", ls=12, vs=12)
    y += 120
    p.cell(x0, y, xm - x0, 70, "Issuing Carrier's Agent Name and City", f"Demo Cargo Sales Agent, {c.city(c.origin)} · IATA 73-4{c.num(doc, 4)}", ls=14, vs=16)
    p.cell(xm, y, x1 - xm, 70, "Accounting Information", "FREIGHT PREPAID", ls=14, vs=16)
    y += 70
    p.cell(x0, y, xm - x0, 60, "Airport of Departure (Addr. of First Carrier) and Requested Routing", f(doc, "departure_airport"), ls=13, vs=17)
    cw = (x1 - xm) / 4
    for i, (lab, val) in enumerate([("Currency", "USD"), ("Declared Value for Carriage", "NVD"), ("Declared Value for Customs", f(doc, "declared_customs")), ("Amount of Insurance", "NIL")]):
        p.cell(xm + i * cw, y, cw, 60, lab, val, ls=12, vs=15)
    y += 60
    p.cell(x0, y, (xm - x0) / 2, 60, "Airport of Destination", f(doc, "destination_airport"), ls=13, vs=17)
    p.cell(x0 + (xm - x0) / 2, y, (xm - x0) / 2, 60, "Flight/Date", f(doc, "flight_date"), ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 60, "Handling Information", "Keep dry. Tea — food product, do not stack above 1.6 m.", ls=13, vs=15)
    y += 76
    gross = amount_value(f(doc, "gross_weight"))
    rate = 2.85
    cols = [(110, "No. of Pieces RCP"), (140, "Gross Weight"), (50, "kg lb"), (90, "Rate Class"), (140, "Chargeable Weight"), (110, "Rate / Charge"), (150, "Total"), (330, "Nature and Quantity of Goods (incl. Dimensions or Volume)")]
    y = p.table(x0, y, cols, [[f(doc, "pieces"), f(doc, "gross_weight"), "K", "Q", money(gross, 0), f"{rate:.2f}", money(gross * rate), f"{f(doc, 'goods')}\nDIMS 120x80x160 cm × {max(1, len(c.units))} ULD {c.unit_list}"]], hs=12, rs=15, min_h=110)
    y += 14
    half = (x1 - x0) / 2
    charges = [("Prepaid Weight Charge", money(gross * rate)), ("Valuation Charge", "—"), ("Tax", "—"), ("Total Other Charges Due Agent", "25.00"), ("Total Other Charges Due Carrier", "85.00"), ("Total Prepaid", money(gross * rate + 110))]
    yy = y
    for label, value in charges:
        p.cell(x0, yy, half * 0.6, 44, label, "", ls=12)
        p.cell(x0 + half * 0.6, yy, half * 0.4, 44, "", value, vs=16)
        yy += 44
    p.cell(x0 + half, y, half, 150, "Other Charges", "AWC 25.00 · SCC 60.00 · XBC 25.00", ls=13, vs=15)
    p.cell(x0 + half, y + 150, half, 114, "Shipper certifies that the particulars on the face hereof are correct.", "", ls=12)
    p.signature(x0 + half + 60, y + 230, 160)
    y = yy + 10
    p.cell(x0, y, x1 - x0, 90, "Executed on (date)  at (place)  Signature of Issuing Carrier or its Agent", f"Executed on {f(doc, 'executed_on')} at {c.city(c.origin)}", ls=13, vs=18)
    p.signature(x1 - 300, y + 64, 180)
    p.seal(x1 - 120, y + 40, "UZBEKISTAN AIRWAYS CARGO · DEMO", ["ACCEPTED"], radius=62, color=SEAL)
    p.barcode(x0, BOTTOM - 110, 520, 60, seed=no)
    p.text(x0, BOTTOM - 44, no, 18, face="mono")
    return p


def shippers_letter(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    x0, xm, x1 = L, (L + R) / 2, R
    p.text(W / 2, TOP + 8, "SHIPPER'S LETTER OF INSTRUCTION", 30, True, align="center")
    p.text(W / 2, TOP + 48, "for issuing an Air Waybill · Uzbekistan Airways Cargo (demo form)", 17, color=LABEL, align="center")
    y = TOP + 90
    rows = [
        [("1 Shipper", f"{f(doc, 'shipper')}, {c.seller['address']}"), ("2 Consignee", f"{f(doc, 'consignee')}, {c.buyer['address']}")],
        [("3 Airport of Departure", f(doc, "departure_airport")), ("4 Airport of Destination", f(doc, "destination_airport"))],
        [("5 Notify party", f(doc, "consignee")), ("6 Routing / requested flight", "direct")],
        [("7 Customs broker", "self"), ("8 Special handling", "Food product · keep dry")],
    ]
    for pair in rows:
        h = 110 if pair is rows[0] else 70
        p.cell(x0, y, xm - x0, h, pair[0][0], pair[0][1], ls=14, vs=18)
        p.cell(xm, y, x1 - xm, h, pair[1][0], pair[1][1], ls=14, vs=18)
        y += h
    y += 16
    cols = [(220, "9 No. & Kind of Pkgs"), (420, "10 Description of Goods"), (220, "11 Gross Weight"), (260, "12 Dimensions, cm")]
    y = p.table(x0, y, cols, [[f(doc, "packages"), f(doc, "goods"), f(doc, "gross_weight"), "120 × 80 × 160"]], hs=14, rs=18, min_h=60)
    y += 16
    items = [
        ("13 Marks and numbers", c.sh["contractNo"]),
        ("14 Commercial invoice", f"{c.sh['invoiceNo']} of {c.sh['invoiceDate']}"),
        ("15 Freight charges", "PREPAID"),
        ("16 Declared value for carriage", "NVD"),
        ("17 Declared value for customs", c.sh.get("valueUsd", "") + " USD"),
        ("18 Documents attached", "Invoice, packing list, phytosanitary certificate, certificate of origin"),
    ]
    y = p.kv_table(x0, y, (420, x1 - x0 - 420), items, ls=16, vs=18)
    y += 30
    p.para(x0, y, x1 - x0, "The shipper certifies that the particulars are correct and that the consignment contains no dangerous goods. The carrier's agent is authorised to issue the air waybill on the shipper's behalf.", 16, color=LABEL)
    y += 80
    p.text(x0, y, "19 Date", 16, color=LABEL)
    p.text(x0, y + 22, "Date", 16, color=LABEL)
    p.text(x0 + 80, y + 20, f(doc, "date"), 20, color=FILL)
    signature_block(p, x0 + 360, y, "Signature", c.seller["manager"])
    company_seal(p, x1 - 110, y + 20, c.seller)
    return p


# ------------------------------------------------------------ certificates ---


def phyto(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    issuing = "KAZAKHSTAN" if f(doc, "cert_no").startswith("KZ") else "UZBEKISTAN"
    x0, xm, x1 = L, (L + R) / 2, R
    p.guilloche(L - 20, TOP - 6, R + 20, BOTTOM + 10)
    y = TOP + 30
    p.text(W / 2, y, f"Plant Protection Organization of {issuing.title()} (demo)", 16, color=LABEL, align="center")
    p.text(W / 2, y + 26, "ФИТОСАНИТАРНЫЙ СЕРТИФИКАТ", 28, True, align="center")
    p.text(W / 2, y + 62, "PHYTOSANITARY CERTIFICATE", 24, True, align="center")
    y += 100
    p.cell(x0, y, xm - x0, 100, "1. Экспортер / Name and address of exporter", f"{f(doc, 'exporter')}, {c.seller['address'] if not c.importing else c.origin}", ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 100, "2. № / Номер", f"{f(doc, 'cert_no')}\nSeries AA № {c.num(doc, 7)}", ls=13, vs=18)
    y += 100
    p.cell(x0, y, xm - x0, 100, "3. Получатель / Declared name and address of consignee", f"{f(doc, 'consignee')}, {c.buyer['address'] if not c.importing else c.trader['address']}", ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 100, "4. To: Plant protection organization(s) of / Организация по карантину растений", f(doc, "destination_country"), ls=13, vs=18)
    y += 100
    p.text(x0, y + 8, "Description of consignment / Описание груза", 17, True)
    y += 34
    p.cell(x0, y, xm - x0, 70, "5. Declared point of entry / Пункт ввоза", f(doc, "point_of_entry"), ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 70, "6. Place of origin / Место происхождения", f(doc, "place_of_origin"), ls=13, vs=17)
    y += 70
    p.cell(x0, y, x1 - x0, 60, "7. Declared means of conveyance / Заявленные транспортные средства", f"{c.transport}: {c.unit_list}", ls=13, vs=17)
    y += 60
    p.cell(x0, y, xm - x0, 110, "8. Name of produce / Наименование продукции", f(doc, "produce"), ls=13, vs=18)
    p.cell(xm, y, x1 - xm, 110, "Botanical name of plants / Ботаническое название", f(doc, "botanical_name"), ls=13, vs=18)
    y += 110
    p.cell(x0, y, xm - x0, 80, "9. Количество мест и описание упаковки", f"{c.sh['cartons']} · {c.sh.get('packaging', '')}", ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 80, "Quantity declared / Заявленное количество", f(doc, "quantity"), ls=13, vs=18)
    y += 80
    p.cell(x0, y, x1 - x0, 60, "10. Distinguishing marks / Отличительные знаки", c.sh["contractNo"], ls=13, vs=17)
    y += 60
    p.para(x0, y + 8, x1 - x0, "This is to certify that the plants, plant products or other regulated articles described herein have been inspected and/or tested according to appropriate official procedures and are considered to be free from the quarantine pests specified by the importing contracting party and to conform with the current phytosanitary requirements of the importing contracting party.", 14, color=INK, align="justify")
    y += 100
    p.cell(x0, y, x1 - x0, 60, "11. Additional declaration / Дополнительная декларация", "The consignment is free from Trogoderma granarium and other regulated pests.", ls=13, vs=15)
    y += 60
    p.text(x0, y + 8, "Disinfestation and/or disinfection treatment / Обеззараживание", 17, True)
    y += 34
    w4 = (x1 - x0) / 4
    treatment = f(doc, "treatment")
    none = not treatment or re.search(r"not required|не требуется", treatment, re.I)
    p.cell(x0, y, w4, 70, "12. Treatment / Способ обработки", treatment, ls=12, vs=15)
    p.cell(x0 + w4, y, w4, 70, "13. Chemical (active ingredient) / Химикат", "—" if none else "Phosphine (PH3)", ls=12, vs=15)
    p.cell(x0 + 2 * w4, y, w4, 70, "14. Duration and temperature", "—" if none else "72 h, +15 °C", ls=12, vs=15)
    p.cell(x0 + 3 * w4, y, w4, 70, "15. Concentration / 16. Date", "—" if none else f"2 g/m³ · {f(doc, 'issue_date')}", ls=12, vs=15)
    y += 70
    p.cell(x0, y, x1 - x0, 50, "17. Additional information", "—", ls=12, vs=15)
    y += 50
    p.cell(x0, y, xm - x0, 130, "Place of issue / Место выдачи", c.city(c.origin), ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 130, "Name of authorized officer / Ф.И.О. уполномоченного лица", f"Inspector {c.initial(doc)}. Rakhimberdiev", ls=13, vs=17)
    p.text(x0 + 8, y + 76, "Date", 14, color=LABEL)
    p.text(x0 + 8, y + 94, f(doc, "issue_date"), 18, color=FILL)
    p.signature(xm + 60, y + 105, 170)
    p.seal(xm + 420, y + 64, f"PLANT QUARANTINE · {issuing} · DEMO", ["INSPECTOR", f(doc, "issue_date")], radius=70, color=SEAL)
    p.qr(x1 - 110, BOTTOM - 20 - 100, 90, seed=doc["file"])
    return p


def ct1(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    x0, xm, x1 = L, L + 600, R
    p.guilloche(L - 20, TOP - 6, R + 20, BOTTOM + 10, color=(214, 230, 214))
    y = TOP + 26
    p.cell(x0, y, xm - x0, 130, "1. Грузоотправитель/экспортер", f"{f(doc, 'exporter')}, {c.seller['address']}", ls=13, vs=17)
    p.cell(xm, y, x1 - xm, 290, "", "", ls=13)
    p.text(xm + 12, y + 10, f"4. № {f(doc, 'cert_no')}", 22, True)
    p.text((xm + x1) / 2, y + 60, "СЕРТИФИКАТ", 26, True, align="center")
    p.text((xm + x1) / 2, y + 94, "о происхождении товара", 20, True, align="center")
    p.text((xm + x1) / 2, y + 126, "ФОРМА СТ-1", 24, True, align="center")
    p.text((xm + x1) / 2, y + 164, "CERTIFICATE OF ORIGIN CT-1", 16, color=LABEL, align="center")
    p.text(xm + 12, y + 206, "Выдан в / Issued in: Республика Узбекистан", 16)
    p.text(xm + 12, y + 234, "Для представления в / For presentation in:", 15, color=LABEL)
    p.text(xm + 12, y + 256, f(doc, "exported_to"), 18, color=FILL)
    y += 130
    p.cell(x0, y, xm - x0, 90, "2. Грузополучатель/импортер", f"{f(doc, 'consignee')}, {c.buyer['address']}", ls=13, vs=17)
    y += 90
    p.cell(x0, y, xm - x0, 70, "3. Средства транспорта и маршрут", f(doc, "transport_route"), ls=13, vs=17)
    y += 70
    p.cell(x0, y, x1 - x0, 60, "5. Для служебных отметок / For official use", "", ls=13)
    y += 60
    cols = [(70, "6. № п/п"), (210, "7. Количество мест и вид упаковки"), (400, "8. Описание товара / Description of goods"), (150, "Код ТН ВЭД"), (140, "9. Вес брутто"), (150, "10. Номер и дата счета-фактуры")]
    y = p.table(x0, y, cols, [["1", f"{c.sh['cartons']}; {c.sh.get('packaging', '')}", f(doc, "goods"), c.sh["hs"], f(doc, "weight"), f(doc, "invoice_ref")], [""] * 6, [""] * 6], hs=12, rs=16, min_h=80, numbered_header=False, align=["center", "left", "left", "center", "right", "left"])
    p.text(x0 + 290, y + 10, f"Критерий происхождения: полностью произведен (П) · Вес брутто: {f(doc, 'weight')}", 15, color=LABEL)
    y += 50
    w2 = (x1 - x0) / 2
    p.cell(x0, y, w2, BOTTOM - 20 - y, "11. Удостоверение / Certification", "", ls=13)
    p.para(x0 + 10, y + 34, w2 - 20, "Настоящим удостоверяется, что декларация заявителя соответствует действительности.", 15)
    p.text(x0 + 10, y + 120, f"{c.city(c.origin)}, {c.date(doc)}", 17, color=FILL)
    p.signature(x0 + 40, y + 190, 170)
    p.seal(x0 + w2 - 150, y + 170, "UZBEKEXPERTIZA · TOSHKENT · DEMO", ["CT-1", "DEMO"], radius=80, color=SEAL)
    p.cell(x0 + w2, y, w2, BOTTOM - 20 - y, "12. Декларация заявителя / Declaration by the exporter", "", ls=13)
    p.para(x0 + w2 + 10, y + 34, w2 - 20, f"Нижеподписавшийся заявляет, что вышеприведенные сведения соответствуют действительности, что все товары полностью произведены в Республике Узбекистан и что они отвечают требованиям происхождения, установленным в отношении таких товаров. Страна назначения: {f(doc, 'exported_to')}.", 14)
    p.text(x0 + w2 + 10, y + 170, f"{c.city(c.origin)}, {c.date(doc)}", 17, color=FILL)
    p.signature(x0 + w2 + 40, y + 230, 150)
    company_seal(p, x1 - 110, y + 210, c.seller, radius=70)
    return p


def declaration(doc, c: Ctx) -> Sheet:
    """Cargo customs declaration (TD1 / ГТД), 54-box layout, abridged to the boxes the case fills."""
    p = Sheet(seed=doc["file"])
    x0, x1 = L, R
    xa = L + 560
    y = TOP + 4
    p.text(x0, y, "ГРУЗОВАЯ ТАМОЖЕННАЯ ДЕКЛАРАЦИЯ / CUSTOMS DECLARATION", 20, True)
    p.text(x1, y, title_of(doc), 15, color=LABEL, align="right")
    y += 30
    col = (x1 - xa) / 3

    def row(cells: list[tuple[float, float, str, str]], h: float, ls: int = 12, vs: int = 15):
        for x, w, lab, val in cells:
            p.cell(x, y, w, h, lab, val, ls=ls, vs=vs)

    row([(x0, xa - x0, "2 Отправитель/экспортер", f"{f(doc, 'exporter')}\n{c.origin if c.importing else c.seller['address']}"), (xa, col, "1 Тип декларации", f(doc, "decl_type")), (xa + col, col, "3 Формы", "1 / 1"), (xa + 2 * col, col, "4 Отгр. спец.", "—")], 110, vs=16)
    y += 110
    row([(xa, col, "5 Всего наименований", "1"), (xa + col, col, "6 Кол-во мест", c.sh["cartons"]), (xa + 2 * col, col, "7 Справочный номер", c.num(doc, 8))], 60)
    y -= 0
    p.cell(x0, y, xa - x0, 110, "8 Получатель/импортер", f"{f(doc, 'consignee')}\n{c.trader['address'] if c.importing else c.buyer['address']}", ls=12, vs=16)
    y += 60
    row([(xa, col * 1.5, "9 Лицо, ответственное за финансовое урегулирование", f"{c.trader['name']} · ИНН {c.trader['tin']}"), (xa + col * 1.5, col * 1.5, "10 Страна первого назначения", f(doc, "destination_country"))], 50, vs=14)
    y += 50
    row([(x0, xa - x0, "14 Декларант", f"{c.trader['name']}, ИНН {c.trader['tin']}, {c.trader['manager']}"), (xa, col, "11 Торгующая страна", c.country(c.dest if not c.importing else c.origin)), (xa + col, col, "12 Общая таможенная стоимость", f(doc, "customs_value")), (xa + 2 * col, col, "13", "")], 80, vs=14)
    y += 80
    row([(x0, xa - x0, "18 Идентификация и страна регистрации трансп. средства при отправлении", f"{c.transport}: {c.unit_list}"), (xa, col, "15 Страна отправления", c.country(c.origin)), (xa + col, col, "16 Страна происхождения", f(doc, "origin_country")), (xa + 2 * col, col, "17 Страна назначения", f(doc, "destination_country"))], 80, vs=15)
    y += 80
    row([(x0, (xa - x0) / 2, "19 Конт.", "0"), (x0 + (xa - x0) / 2, (xa - x0) / 2, "21 Трансп. средство на границе", c.unit_list[:30]), (xa, col * 1.2, "20 Условия поставки", f(doc, "delivery_terms")), (xa + col * 1.2, col * 1.8, "22 Валюта и общая сумма по счету", f(doc, "invoice_amount"))], 70, vs=15)
    y += 70
    row([(x0, (xa - x0) / 3, "25 Вид транспорта на границе", {"rail": "20", "road": "30", "air": "40"}[c.mode]), (x0 + (xa - x0) / 3, (xa - x0) / 3, "26 Вид транспорта внутри страны", {"rail": "20", "road": "30", "air": "40"}[c.mode]), (x0 + 2 * (xa - x0) / 3, (xa - x0) / 3, "27 Место погрузки/разгрузки", c.city(c.origin if not c.importing else c.dest)), (xa, col, "23 Курс валюты", "12 650,00"), (xa + col, col, "24 Характер сделки", "11"), (xa + 2 * col, col, "28 Финансовые и банковские сведения", c.trader["bank"][:40])], 80, vs=14)
    y += 80
    row([(x0, (xa - x0) / 2, "29 Таможня на границе", c.sh["borderStations"]), (x0 + (xa - x0) / 2, x1 - x0 - (xa - x0) / 2, "30 Местонахождение товаров", c.city(c.origin if not c.importing else c.dest) + ", СВХ (demo)")], 60, vs=15)
    y += 60
    # item block
    p.cell(x0, y, 120, 260, "31 Грузовые места и описание товаров", "", ls=12)
    p.cell(x0 + 120, y, xa - x0 - 120, 260, "", f"1) {c.goods_bi}\n2) {c.sh['cartons']} мест, {c.sh.get('packaging', '')}\n3) Марки: {c.sh['contractNo']}\n4) Контракт {c.sh['contractNo']} от {c.sh['contractDate']}", vs=15)
    row([(xa, col * 0.7, "32 Товар №", "1"), (xa + col * 0.7, col * 2.3, "33 Код товара", f(doc, "hs_code"))], 60, vs=17)
    y += 60
    row([(xa, col, "34 Код страны происх.", {"Uzbekistan": "860", "Kyrgyzstan": "417", "Kazakhstan": "398", "Russia": "643"}.get(f(doc, 'origin_country'), "—")), (xa + col, col, "35 Вес брутто (кг)", f(doc, "gross_weight")), (xa + 2 * col, col, "36 Преференция", "ОО-ОО")], 60, vs=15)
    y += 60
    row([(xa, col, "37 Процедура", f(doc, "procedure_code")), (xa + col, col, "38 Вес нетто (кг)", f(doc, "net_weight")), (xa + 2 * col, col, "39 Квота", "—")], 70, vs=16)
    y += 70
    row([(xa, col * 3, "40 Общая декларация/Предшествующий документ", "—")], 70)
    y += 70
    row([(x0, xa - x0, "44 Дополнит. информация/Представл. документы", f"Контракт {c.sh['contractNo']}; инвойс {c.sh['invoiceNo']} от {c.sh['invoiceDate']}; транспортный документ; сертификат происхождения; фитосанитарный / ветеринарный сертификат (при необходимости)"), (xa, col, "41 Доп. единицы", c.sh["netKg"]), (xa + col, col, "42 Фактурная стоимость", f(doc, "invoice_amount")), (xa + 2 * col, col, "45 Таможенная стоимость", f(doc, "customs_value"))], 110, vs=14)
    y += 110
    cols = [(150, "47 Вид"), (230, "Основа начисления"), (120, "Ставка"), (200, "Сумма"), (150, "СП")]
    base = f(doc, "customs_value")
    duty_rows = [["10 (сбор)", base, "0,2%", "расчет", "БН"], ["20 (пошлина)", base, "0%" if not c.importing else "5%", "расчет", "БН"], ["29 (НДС)", base, "0%" if not c.importing else "12%", "расчет", "БН"]]
    yt = p.table(x0, y, cols, duty_rows, hs=12, rs=14, min_h=28)
    p.cell(x0 + 850, y, x1 - x0 - 850, yt - y, "46 Статистическая стоимость", f(doc, "customs_value"), ls=12, vs=14)
    y = yt + 6
    row([(x0, (x1 - x0) / 2, "54 Место и дата", f"{c.city(c.origin if not c.importing else c.dest)}, {c.date(doc)}"), (x0 + (x1 - x0) / 2, (x1 - x0) / 2, "D Отметки таможенного органа отправления", "")], BOTTOM - 20 - y, vs=16)
    p.signature(x0 + 60, y + 90, 160)
    p.text(x0 + 10, y + 110, f"Декларант: {c.trader['manager']}", 15, color=FILL)
    p.box_stamp(x0 + (x1 - x0) / 2 + 30, y + 26, ["ТАМОЖЕННЫЙ ПОСТ (DEMO)", "ВЫПУСК РАЗРЕШЕН", c.date(doc)], color=SEAL_VIOLET, size=17)
    return p


def lab_report(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    p.text(W / 2, TOP + 8, "ИСПЫТАТЕЛЬНАЯ ЛАБОРАТОРИЯ «DEMO TEST LAB»", 22, True, align="center")
    p.text(W / 2, TOP + 38, f"Аттестат аккредитации {f(doc, 'lab_accreditation')} · г. Ташкент, ул. Демо, 7 · тел. +998 71 000 00 00", 15, color=LABEL, align="center")
    p.hline(L, R, TOP + 64, 2)
    p.text(R, TOP + 80, "УТВЕРЖДАЮ", 17, True, align="right")
    p.text(R, TOP + 104, "Руководитель лаборатории", 15, align="right")
    p.signature(R - 260, TOP + 140, 120)
    p.text(R, TOP + 150, "/ D. Nazarova /", 15, color=FILL, align="right")
    y = TOP + 200
    p.text(W / 2, y, f"ПРОТОКОЛ ИСПЫТАНИЙ № {f(doc, 'protocol_no')}", 28, True, align="center")
    p.text(W / 2, y + 40, f"от {f(doc, 'protocol_date')}", 20, align="center")
    y += 90
    y = p.kv_table(L, y, (420, R - L - 420), [
        ("Протокол испытаний / Test report date", f(doc, "protocol_date")),
        ("Аттестат аккредитации / Accreditation", f(doc, "lab_accreditation")),
        ("Наименование образца / Sample", f(doc, "sample")),
        ("Изготовитель / Manufacturer", f(doc, "manufacturer")),
        ("Заявитель / Applicant", c.trader["name"]),
        ("Количество образца / Sample quantity", "2 кг, 2 упаковки"),
        ("Дата отбора / поступления образца", f(doc, "protocol_date")),
        ("Испытания проведены / Tests carried out", f(doc, "test_period")),
        ("НД на продукцию", "O'z DSt 3017, ГОСТ 32573 (demo)"),
    ], ls=16, vs=17)
    y += 26
    p.text(L, y, "Результаты испытаний / Test results", 19, True)
    y += 30
    cols = [(40, "№"), (330, "Наименование показателя"), (230, "НД на метод испытаний"), (200, "Норма по НД"), (180, "Результат"), (140, "Соответствие")]
    rows = [
        ["1", "Массовая доля влаги, %", "ГОСТ 1936", "не более 8,0", "6,4", "соотв."],
        ["2", "Массовая доля золы общей, %", "ГОСТ 1936", "4,0–8,0", "5,7", "соотв."],
        ["3", "Свинец, мг/кг", "ГОСТ 30178", "не более 10,0", "0,42", "соотв."],
        ["4", "Кадмий, мг/кг", "ГОСТ 30178", "не более 1,0", "< 0,01", "соотв."],
        ["5", "Пестициды (ГХЦГ), мг/кг", "ГОСТ 32308", "не более 0,1", "не обнаружено", "соотв."],
        ["6", "Радионуклиды Cs-137, Бк/кг", "МУК 2.6.1", "не более 400", "12", "соотв."],
        ["7", "Плесени, КОЕ/г", "ГОСТ 10444.12", "не более 1·10³", "< 10", "соотв."],
    ]
    y = p.table(L, y, cols, rows, hs=13, rs=16, min_h=32, align=["center", "left", "left", "center", "center", "center"])
    y += 24
    y = p.para(L, y, R - L, "Заключение: образец соответствует требованиям нормативных документов по проверенным показателям. Result: the sample meets the requirements tested.", 18, True)
    y += 10
    p.para(L, y, R - L, "Протокол распространяется только на образец, подвергнутый испытаниям. Частичная перепечатка протокола без разрешения лаборатории запрещена.", 14, color=LABEL)
    y += 80
    signature_block(p, L, y, "Исполнитель", "Sh. Alimova")
    signature_block(p, L, y + 70, "Зав. отделом", "R. Tursunov")
    p.seal(R - 150, y + 60, "DEMO TEST LAB · ACCREDITED · DEMO", ["ПРОТОКОЛ", "ИСПЫТАНИЙ"], radius=86)
    return p


def vet_cert(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    p.guilloche(L - 20, TOP - 6, R + 20, BOTTOM + 10, color=(232, 214, 214))
    y = TOP + 34
    p.emblem(W / 2, y + 36, 38, color=(150, 40, 40))
    y += 100
    p.text(W / 2, y, "ГОСУДАРСТВЕННАЯ ВЕТЕРИНАРНАЯ СЛУЖБА (DEMO)", 16, color=LABEL, align="center")
    p.text(W / 2, y + 26, f"ВЕТЕРИНАРНЫЙ СЕРТИФИКАТ № {f(doc, 'cert_no')}", 28, True, align="center")
    p.text(W / 2, y + 62, f"Veterinary certificate · Форма № 3 · {title_of(doc)}", 16, color=LABEL, align="center")
    y += 100
    y = p.kv_table(L, y, (420, R - L - 420), [
        ("Дата выдачи / Date of issue", f(doc, "issue_date")),
        ("Отправитель / Consignor (наименование, адрес)", f"{f(doc, 'consignor')}, {c.origin}"),
        ("Получатель / Consignee (наименование, адрес)", f"{f(doc, 'consignee')}, {c.dest}"),
        ("Наименование продукции / Name of goods", f(doc, "goods")),
        ("Количество / Quantity", f(doc, "quantity")),
        ("Упаковка, число мест / Packing", f"{c.sh.get('packaging', '')}, {c.sh['cartons']} мест"),
        ("Страна происхождения / Country of origin", f(doc, "origin_country")),
        ("Изготовитель / Producer", f"{f(doc, 'consignor')}, рег. № {c.num(doc, 6, 'prod')}"),
        ("Транспорт / Means of transport", f"{c.transport}: {c.unit_list}"),
        ("Маршрут / Route", f"{c.origin} — {c.sh['borderStations']} — {c.dest}"),
        ("Разрешение на ввоз / Import permit", f(doc, "vet_permit_no")),
    ], ls=16, vs=17)
    y += 26
    p.text(L, y, "Ветеринарные условия / Veterinary conditions", 19, True)
    y += 30
    for i, line in enumerate([
        "Продукция получена от здоровых животных / сырья из хозяйств, благополучных по особо опасным болезням.",
        "Продукция прошла термическую обработку и ветеринарно-санитарную экспертизу; признана пригодной для реализации без ограничений.",
        "Транспортное средство очищено и продезинфицировано в установленном порядке.",
    ], 1):
        y = p.para(L + 20, y, R - L - 20, f"{i}. {line}", 16) + 4
    y += 30
    signature_block(p, L, y, "Ветеринарный врач", f"{c.initial(doc)}. Sadykov")
    p.text(L, y + 60, "М.П.", 17, color=LABEL)
    p.seal(R - 200, y + 30, "STATE VETERINARY SERVICE · DEMO", ["VET", f(doc, "issue_date")], radius=90, color=(160, 40, 40))
    p.qr(R - 130, BOTTOM - 150, 110, seed=doc["file"])
    return p


def conformity(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    p.guilloche(L - 20, TOP - 6, R + 20, BOTTOM + 10, color=(206, 222, 240))
    y = TOP + 40
    p.text(W / 2, y, "НАЦИОНАЛЬНАЯ СИСТЕМА СЕРТИФИКАЦИИ (DEMO)", 16, color=LABEL, align="center")
    p.spaced(W / 2, y + 30, "СЕРТИФИКАТ СООТВЕТСТВИЯ", 32, spacing=4)
    p.text(W / 2, y + 80, "CERTIFICATE OF CONFORMITY", 20, True, color=LABEL, align="center")
    p.text(W / 2, y + 116, f"сертификат соответствия № {f(doc, 'cert_no')}", 22, True, align="center")
    y += 170
    p.text(L + 30, y, f"Дата выдачи / Date of issue: {f(doc, 'issue_date')}", 19)
    p.text(R - 30, y, f"Действителен до / Valid until: {f(doc, 'valid_until')}", 19, align="right")
    y += 50
    rows = [
        ("Орган по сертификации / Certification body", f(doc, "body")),
        ("Продукция / Product", f"{f(doc, 'product')}; партия {c.sh['netKg']} кг, {c.sh['cartons']} мест"),
        ("Код ТН ВЭД / HS code", f(doc, "hs_code")),
        ("Соответствует требованиям / Conforms to", f(doc, "standard")),
        ("Изготовитель / Manufacturer", c.seller["name"]),
        ("Заявитель / Applicant", f"{f(doc, 'applicant')}, ИНН {c.trader['tin']}"),
        ("Сертификат выдан на основании / Issued on the basis of", f"протокола испытаний № {c.num(doc, 5)} от {f(doc, 'issue_date')} испытательной лаборатории (demo); контракта {c.sh['contractNo']}"),
        ("Дополнительная информация / Additional information", "Схема сертификации 7 (партия). Маркирование знаком соответствия."),
    ]
    for label, value in rows:
        p.text(L + 30, y, label, 15, color=LABEL)
        y = p.para(L + 30, y + 20, R - L - 60, value, 20, color=FILL) + 12
    y += 30
    signature_block(p, L + 30, y, "Руководитель органа", f"{c.initial(doc)}. Ergashev")
    signature_block(p, L + 30, y + 70, "Эксперт", f"{c.initial(doc, 'e')}. Mirzaeva")
    p.seal(R - 220, y + 50, "CERTIFICATION BODY · UZ · DEMO", ["UZ", "SMT"], radius=95)
    p.qr(L + 40, BOTTOM - 170, 120, seed=doc["file"])
    p.text(L + 180, BOTTOM - 110, f"Регистрационный № {f(doc, 'cert_no')} · проверка по QR-коду", 15, color=LABEL)
    return p


def quarantine_permit(doc, c: Ctx) -> Sheet:
    p = Sheet(seed=doc["file"])
    y = TOP + 10
    p.emblem(L + 50, y + 45, 40, color=(30, 110, 60))
    p.text(L + 110, y + 4, "O'SIMLIKLAR KARANTINI VA HIMOYASI AGENTLIGI (DEMO)", 17, True)
    p.text(L + 110, y + 30, "Агентство по карантину и защите растений · Agency of Plant Quarantine and Protection", 14, color=LABEL)
    p.qr(R - 130, y, 120, seed=doc["file"])
    y += 150
    p.text(W / 2, y, "KARANTIN RUXSATNOMASI", 24, True, align="center")
    p.text(W / 2, y + 34, f"КАРАНТИННОЕ РАЗРЕШЕНИЕ / QUARANTINE PERMIT № {f(doc, 'permit_no')}", 22, True, align="center")
    y += 90
    p.text(L, y, f"Выдано / Issued: {f(doc, 'issued_date')}", 19)
    p.text(R, y, f"Срок до / Valid until: {f(doc, 'valid_until')}", 19, align="right")
    y += 44
    y = p.kv_table(L, y, (440, R - L - 440), [
        ("Ruxsatnoma berildi / Разрешение выдано / License is given to", f"{f(doc, 'issued_to')}, ИНН {c.trader['tin']}, {c.trader['address']}"),
        ("Eksport qiluvchi davlat / Наименование экспортирующей страны / Name of exporter country", f(doc, "exporter")),
        ("Mahsulot haqida ma'lumot / Информация о продукции / Product information", f(doc, "product")),
        ("Код ТН ВЭД / HS code", f(doc, "hs_code")),
        ("Kelib chiqish davlati / Страна и регион происхождения / Country and region of origin", f(doc, "origin")),
        ("Маршрут по территории Узбекистана / Route inside Uzbekistan", f"{f(doc, 'entry_post')} — {c.city(c.dest)}"),
        ("Chegara posti / Пограничный пост / Border post", f(doc, "entry_post")),
        ("Пункт пограничного контроля ВЭД / FEA border control point", f"{f(doc, 'entry_post')} (фитосанитарный пост)"),
        ("Transport turi / Вид транспорта / Type of transport", c.transport),
        ("Qo'shimcha ma'lumot / Дополнительная информация", "Груз подлежит карантинному досмотру в пункте пропуска и в месте назначения. Сопровождается фитосанитарным сертификатом страны-экспортера."),
    ], ls=15, vs=17)
    y += 40
    signature_block(p, L, y, "Инспектор / Inspector", f"{c.initial(doc)}. Toshmatov")
    p.seal(R - 200, y + 20, "O'SIMLIKLAR KARANTINI · DEMO", ["RUXSAT", f(doc, "issued_date")], radius=84, color=(30, 110, 60))
    p.text(L, BOTTOM - 50, "Документ сформирован в системе «Единое окно» (demo). Подлинность проверяется по QR-коду.", 14, color=LABEL)
    return p


# --------------------------------------------------- the "letter" documents ---


def letterhead(p: Sheet, party: dict, top: float = TOP) -> float:
    name = party["name"]
    p.rect(L, top, L + 70, top + 70, 0, fill=(30, 64, 120))
    initials = "".join(w[0] for w in re.sub(r'^(OOO|OcOO|LLC|JSC)\s+', "", name).replace('"', "").split()[:2]).upper()
    p.text(L + 35, top + 18, initials, 28, True, color=(255, 255, 255), align="center")
    p.text(L + 90, top + 4, name, 24, True)
    p.text(L + 90, top + 36, f"{party['address']}", 15, color=LABEL)
    p.text(L + 90, top + 56, f"ИНН / TIN {party['tin']} · {party['bank']}", 13, color=LABEL)
    p.text(R, top + 4, party["phone"], 14, color=LABEL, align="right")
    p.text(R, top + 24, party["email"], 14, color=LABEL, align="right")
    p.hline(L, R, top + 84, 3, color=(30, 64, 120))
    p.hline(L, R, top + 90, 1, color=(30, 64, 120))
    return top + 110


ADDRESSEES = [
    (r"railway|wagon|station|freight|forwarder|telegram", "Начальнику станции {station}\nАО «Узбекистон темир йуллари»"),
    (r"certificate of origin|expertiza", "Директору АО «Узэкспертиза»\n(региональный филиал)"),
    (r"visual inspection|customs|declaration|warehouse", "Начальнику таможенного поста\n{post}"),
    (r"technological center", "Директору Технологического центра\nАО «Узбекистон темир йуллари»"),
    (r"quarantine|phyto", "Руководителю территориальной инспекции\nАгентства по карантину и защите растений"),
    (r"veterinar", "Председателю Государственного комитета\nветеринарии и развития животноводства"),
]


def addressee(title: str, c: Ctx) -> str:
    for pattern, text in ADDRESSEES:
        if re.search(pattern, title, re.I):
            return text.format(station=c.sh["departureStation"], post=c.city(c.origin if not c.importing else c.dest))
    return "В уполномоченный орган\n(по месту оформления)"


def shipment_rows(c: Ctx) -> list[tuple[str, str]]:
    sh = c.sh
    return [
        ("Товар / Goods", f"{c.goods_bi}, HS {sh['hs']}"),
        ("Количество / Quantity", f"{sh['netKg']} kg net, {sh['grossKg']} kg gross, {sh['cartons']} places"),
        ("Маршрут / Route", f"{c.origin} → {c.dest} via {sh['borderStations']}"),
        ("Транспорт / Transport", f"{c.transport}: {c.unit_list}"),
        ("Контракт / Contract", f"{sh['contractNo']} of {sh['contractDate']}"),
        ("Инвойс / Invoice", f"{sh['invoiceNo']} of {sh['invoiceDate']}, {sh.get('valueUsd', '')} USD"),
    ]


def application_letter(doc, c: Ctx) -> Sheet:
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    y = letterhead(p, t)
    p.text(L, y, f"Исх. № {c.num(doc, 3)}/{c.pid}", 17)
    p.text(L, y + 26, f"от {c.sh.get('contractDate', '05.09.2026')}", 17)
    yy = y
    for line in addressee(title, c).split("\n"):
        p.text(R, yy, line, 18, align="right")
        yy += 26
    p.text(R, yy + 6, f"от {t['name']}", 18, align="right")
    y = max(yy + 60, y + 90)
    p.text(W / 2, y, "ЗАЯВЛЕНИЕ / APPLICATION", 28, True, align="center")
    p.text(W / 2, y + 40, title, 19, color=LABEL, align="center")
    y += 90
    body = doc.get("body") or ""
    lead = (
        f"{t['name']} (ИНН {t['tin']}) в лице директора {t['manager']} просит рассмотреть настоящее заявление "
        f"({title.lower()}) по поставке, указанной ниже, и выдать соответствующий документ в установленный срок."
    )
    y = p.para(L, y, R - L, lead, 19, align="justify", indent=40) + 10
    if body and "applies for" not in body:
        y = p.para(L, y, R - L, body, 18, align="justify", indent=40) + 10
    y = p.kv_table(L, y, (330, R - L - 330), shipment_rows(c), ls=16, vs=17) + 20
    if re.search(r"wagon|allotment|handover|returning", title, re.I):
        cols = [(60, "№"), (260, "№ вагона / Wagon"), (220, "Тип / Type"), (220, "Пломба / Seal"), (360, "Примечание / Note")]
        rows = [[str(i + 1), w, "крытый (КР)", (c.seals[i] if i < len(c.seals) else "—"), "исправен, очищен"] for i, w in enumerate(c.units or ["—"])]
        y = p.table(L, y, cols, rows, hs=13, rs=16, min_h=32) + 20
    p.text(L, y, "Приложения / Enclosures:", 18, True)
    y += 28
    for i, item in enumerate([f"Копия контракта {c.sh['contractNo']}", f"Инвойс {c.sh['invoiceNo']}", "Доверенность представителя", f"Копия свидетельства о регистрации ({t['name']})"], 1):
        p.text(L + 20, y, f"{i}. {item}", 17)
        y += 26
    y += 40
    signature_block(p, L, y, "Директор", t["manager"])
    p.text(L, y + 60, f"Исполнитель: {c.rep['name']}, {t['phone']}", 15, color=LABEL)
    company_seal(p, L + 760, y + 30, t, radius=86)
    if doc.get("stamp") != "none":
        p.box_stamp(R - 330, BOTTOM - 150, ["ВХОДЯЩИЙ № " + c.num(doc, 4, "in"), f"от {c.sh.get('invoiceDate', '')}"], color=SEAL_VIOLET, size=16)
    return p


def portal_printout(doc, c: Ctx) -> Sheet:
    """An online application as the Single Window prints it."""
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    p.rect(0, TOP - 22, W, TOP + 50, 0, fill=(22, 78, 140))
    p.text(L, TOP - 8, "YAGONA DARCHA · ЕДИНОЕ ОКНО · SINGLE WINDOW (demo)", 20, True, color=(255, 255, 255))
    p.text(R, TOP - 4, f"singlewindow.uz · {c.sh.get('invoiceDate', '')}", 14, color=(220, 230, 245), align="right")
    y = TOP + 76
    p.text(L, y, title, 26, True)
    y += 40
    app_no = f"SW-{c.num(doc, 4)}-{c.num(doc, 6, 'app')}"
    p.text(L, y, f"Заявка № {app_no}", 18)
    p.rect(R - 260, y - 6, R, y + 26, 0, fill=(223, 244, 229))
    p.text(R - 130, y - 1, "Статус: Отправлено / Submitted", 15, True, color=(22, 110, 60), align="center")
    y += 50
    sections = [
        ("Заявитель / Applicant", [
            ("Тип налогоплательщика", "Юридическое лицо"),
            ("ИНН", t["tin"]),
            ("Наименование", t["name"]),
            ("Руководитель", t["manager"]),
            ("Адрес", t["address"]),
            ("Телефон / E-mail", f"{t['phone']} · {t['email']}"),
        ]),
        ("Экспортер / Импортер", [
            ("Экспортер", c.seller["name"]),
            ("Страна экспортера", c.country(c.seller["address"]) if c.seller["address"] else c.country(c.origin)),
            ("Получатель", c.buyer["name"]),
            ("Страна назначения", c.country(c.dest)),
        ]),
        ("Товар / Product", [
            ("Код ТН ВЭД", c.sh["hs"]),
            ("Наименование", c.goods_bi),
            ("Количество и единица", f"{c.sh['netKg']} кг"),
            ("Вес брутто", f"{c.sh['grossKg']} кг"),
            ("Упаковка", f"{c.sh.get('packaging', '')}, {c.sh['cartons']} мест"),
        ]),
        ("Перевозка / Transport", [
            ("Вид транспорта", c.transport),
            ("Транспортные средства", c.unit_list),
            ("Маршрут", f"{c.origin} → {c.dest}"),
            ("Пункт пропуска", c.sh["borderStations"]),
        ]),
    ]
    for head, rows in sections:
        p.rect(L, y, R, y + 34, 0, fill=(236, 242, 250))
        p.text(L + 10, y + 7, head, 17, True, color=(22, 78, 140))
        y += 40
        y = p.kv_table(L, y, (340, R - L - 340), rows, ls=15, vs=16, min_h=28, shade_labels=False) + 14
    p.text(L, y + 6, "Прикрепленные файлы:", 16, True)
    y += 32
    for name in [f"contract_{c.sh['contractNo'].replace('/', '-')}.pdf", f"invoice_{c.sh['invoiceNo'].replace('/', '-')}.pdf", "power_of_attorney.pdf"]:
        p.text(L + 20, y, f"• {name}", 15, color=(22, 78, 140))
        y += 24
    p.text(L, BOTTOM - 70, f"Подписано ЭЦП: {t['manager']} · серийный № {c.num(doc, 8, 'eds')} · {c.sh.get('invoiceDate', '')}", 14, color=LABEL)
    p.qr(R - 120, BOTTOM - 150, 110, seed=doc["file"])
    return p


def issued_certificate(doc, c: Ctx) -> Sheet:
    """Certificates a body issues to the company: state registration, analysis, quality, funds."""
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    p.guilloche(L - 20, TOP - 6, R + 20, BOTTOM + 10, color=(222, 222, 236))
    issuers = [
        (r"state registration|registration certificate", "ДАВЛАТ ХИЗМАТЛАРИ АГЕНТЛИГИ (DEMO) · Агентство государственных услуг"),
        (r"availability of funds", "АКБ «DEMO BANK» · Ташкентский филиал"),
        (r"analysis|quality", "ИСПЫТАТЕЛЬНЫЙ ЦЕНТР ПРОИЗВОДИТЕЛЯ (DEMO)"),
        (r"normative", "УЗСТАНДАРТ (DEMO) · Агентство по техническому регулированию"),
    ]
    issuer = next((text for pat, text in issuers if re.search(pat, title, re.I)), "УПОЛНОМОЧЕННЫЙ ОРГАН (DEMO)")
    y = TOP + 40
    p.emblem(W / 2, y + 30, 36)
    y += 90
    p.text(W / 2, y, issuer, 16, color=LABEL, align="center")
    p.spaced(W / 2, y + 30, "СПРАВКА" if "funds" in title.lower() else "СВИДЕТЕЛЬСТВО" if "registration" in title.lower() else "СЕРТИФИКАТ", 32, spacing=5)
    p.text(W / 2, y + 80, title, 20, True, align="center")
    p.text(W / 2, y + 112, f"№ {c.num(doc, 6)} от {c.sh.get('contractDate', '')}", 18, align="center")
    y += 160
    if "funds" in title.lower():
        body = doc.get("body") or f"Настоящим подтверждается, что на расчетном счете {t['name']} достаточно средств для оплаты провозных платежей."
        y = p.para(L + 30, y, R - L - 60, body, 20, align="justify", indent=40) + 20
        rows = [("Клиент", t["name"]), ("ИНН", t["tin"]), ("Реквизиты", t["bank"]), ("Остаток на дату справки", f"{money(c.rng(doc).randint(250, 900) * 1_000_000, 0)} UZS"), ("Назначение", f"Оплата провозных платежей по контракту {c.sh['contractNo']}")]
    elif re.search(r"analysis|quality", title, re.I):
        rows = [("Продукция", c.sh["goods"]), ("Партия", f"{c.sh['netKg']} кг, {c.sh['cartons']} мест"), ("Изготовитель", c.seller["name"]), ("Получатель", t["name"]), ("Дата изготовления", c.sh.get("contractDate", ""))]
        y = p.kv_table(L + 30, y, (320, R - L - 380), rows, ls=16, vs=17) + 20
        cols = [(60, "№"), (420, "Показатель / Parameter"), (250, "Норма / Standard"), (270, "Результат / Result")]
        table = [["1", "Массовая доля азота (N), %", "не менее 1,5", "2,1"], ["2", "Массовая доля фосфора (P2O5), %", "не менее 1,0", "1,8"], ["3", "Влажность, %", "не более 45", "38"], ["4", "pH", "6,0–8,0", "7,1"], ["5", "Патогенная микрофлора", "не допускается", "не обнаружено"]]
        if "fertil" not in c.sh["goods"].lower():
            table = [["1", "Внешний вид", "по НД", "соответствует"], ["2", "Влажность, %", "не более 8", "6,2"], ["3", "Посторонние примеси", "не допускаются", "не обнаружено"]]
        y = p.table(L + 30, y, cols, table, hs=14, rs=16, min_h=32) + 20
        rows = []
        p.text(L + 30, y, "Заключение: продукция соответствует требованиям нормативных документов.", 18, True)
        y += 40
    elif re.search(r"normative", title, re.I):
        rows = [("Продукция", c.sh["goods"]), ("Код ТН ВЭД", c.sh["hs"]), ("Применимые стандарты", "O'z DSt 3182:2017; ГОСТ 33830-2016 (demo)"), ("Технический регламент", "Общий технический регламент о безопасности химической продукции (demo)"), ("Предоставлено для", t["name"])]
    else:
        rows = [("Наименование", t["name"]), ("Организационно-правовая форма", "Общество с ограниченной ответственностью"), ("ИНН", t["tin"]), ("Юридический адрес", t["address"]), ("Руководитель", t["manager"]), ("Уставный фонд", f"{money(c.rng(doc).randint(10, 500) * 1_000_000, 0)} UZS"), ("Дата регистрации", f"{c.rng(doc).randint(1, 28):02d}.{c.rng(doc).randint(1, 12):02d}.20{c.rng(doc).randint(10, 22)}"), ("Основной вид деятельности (ОКЭД)", "46.31 — оптовая торговля"), ("Регистрационный номер", c.num(doc, 6, "reg"))]
    if rows:
        y = p.kv_table(L + 30, y, (380, R - L - 440), rows, ls=16, vs=18) + 30
    signature_block(p, L + 30, y + 20, "Руководитель", f"{c.initial(doc)}. Abdullaev")
    p.seal(R - 220, y + 50, issuer.split("·")[0].strip()[:30] + " · DEMO", ["DEMO", c.sh.get("contractDate", "")], radius=92)
    p.qr(L + 40, BOTTOM - 170, 120, seed=doc["file"])
    return p


def carrier_document(doc, c: Ctx) -> Sheet:
    """Transit and vehicle papers: TIR carnet, control book, ATP, permits, transit declaration."""
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    carrier = "OcOO \"Demo Kyrgyz Transit\"" if c.mode == "road" else {"rail": "JSC Uzbekistan Temir Yo'llari", "air": "Uzbekistan Airways (demo)"}[c.mode]
    unit = c.units[0] if c.units else "—"
    kinds = [
        (r"tir carnet", "CARNET TIR", "TIR CARNET · ТИР КНИЖКА", "IRU / International Road Transport Union (demo)"),
        (r"control book", "КНИЖКА КОНТРОЛЯ ДОСТАВКИ ГРУЗОВ", "Cargo delivery control book", "Государственный таможенный комитет (demo)"),
        (r"atp certificate", "СВИДЕТЕЛЬСТВО СПС / ATP CERTIFICATE", "Certificate of compliance for special transport equipment", "Уполномоченный орган по ATP (demo)"),
        (r"authorization for international carriage", "РАЗРЕШЕНИЕ НА МЕЖДУНАРОДНУЮ ПЕРЕВОЗКУ", "Authorization for international carriage of goods by road", "Министерство транспорта (demo)"),
        (r"transit declaration", "ТРАНЗИТНАЯ ДЕКЛАРАЦИЯ / TRANSIT DECLARATION", "E-tranzit", "Государственный таможенный комитет (demo)"),
        (r"export declaration of the exporter", "ЭКСПОРТНАЯ ДЕКЛАРАЦИЯ СТРАНЫ ЭКСПОРТА", "Export declaration of the exporter's country", f"Таможенная служба — {c.country(c.origin)} (demo)"),
        (r"vehicle entrance permit", "ПРОПУСК ТРАНСПОРТНОГО СРЕДСТВА", "Vehicle entrance permit", "Администрация аэропорта (demo)"),
        (r"vehicle registration (certificate|number)|vehicle information", "СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ ТРАНСПОРТНОГО СРЕДСТВА", "Vehicle registration certificate — SPECIMEN", "Регистрирующий орган (demo)"),
        (r"non-tariff", "СВЕДЕНИЯ О МЕРАХ НЕТАРИФНОГО РЕГУЛИРОВАНИЯ", "Non-tariff measures", "Единое окно (demo)"),
        (r"description of goods", "ОПИСЬ ТОВАРОВ / DESCRIPTION OF GOODS", "Description of goods", c.trader["name"]),
    ]
    heading, sub, issuer = next(((h, s, i) for pat, h, s, i in kinds if re.search(pat, title, re.I)), (title.upper(), title, "Уполномоченный орган (demo)"))
    if "SPECIMEN" in sub:
        p.watermark("SPECIMEN")
    y = TOP + 10
    p.text(L, y, issuer, 16, color=LABEL)
    p.text(R, y, f"№ {c.num(doc, 2).upper()}{c.num(doc, 7, 'n')}", 20, True, "mono", align="right")
    y += 40
    p.text(W / 2, y, heading, 26, True, align="center")
    p.text(W / 2, y + 36, sub, 17, color=LABEL, align="center")
    y += 80
    rows = [
        ("Перевозчик / Carrier", carrier),
        ("Транспортное средство / Vehicle", unit),
        ("Отправитель / Consignor", c.seller["name"]),
        ("Получатель / Consignee", c.buyer["name"] if not c.importing else c.trader["name"]),
        ("Товар / Goods", f"{c.goods_bi}, HS {c.sh['hs']}"),
        ("Вес брутто / Gross weight", f"{c.sh['grossKg']} kg"),
        ("Мест / Packages", f"{c.sh['cartons']} · {c.sh.get('packaging', '')}"),
        ("Таможня отправления / Office of departure", c.city(c.origin)),
        ("Таможня назначения / Office of destination", c.city(c.dest)),
        ("Пункты пропуска / Border crossings", c.sh["borderStations"]),
        ("Пломбы / Seals", ", ".join(c.seals) or "—"),
        ("Срок доставки / Delivery deadline", "8 суток / 8 days"),
    ]
    if re.search(r"registration|vehicle information|atp", title, re.I):
        rows = [
            ("Регистрационный знак / Registration", unit),
            ("Марка, модель / Make", "DEMO TRUCK 460 / DEMO TRAILER S3"),
            ("VIN", f"DEMO{c.num(doc, 13, 'vin')}"),
            ("Год выпуска / Year", "2021"),
            ("Разрешенная макс. масса / Max. mass", "40 000 kg"),
            ("Владелец / Owner", carrier),
            ("Тип кузова / Body", "тентованный полуприцеп" if "atp" not in title.lower() else "изотермический FRC"),
            ("Действительно до / Valid until", "31.12.2027"),
        ]
    y = p.kv_table(L, y, (400, R - L - 400), rows, ls=16, vs=18) + 26
    if re.search(r"tir carnet|control book|transit", title, re.I):
        cols = [(200, "Таможня / Office"), (220, "Дата / Date"), (260, "Отметка / Endorsement"), (440, "Подпись, печать / Signature, stamp")]
        rows = [[c.city(c.origin), c.sh.get("invoiceDate", ""), "принято / accepted", ""], [c.sh["borderStations"].split("–")[0].strip()[:22], "", "выезд / exit", ""], [c.sh["borderStations"].split("–")[-1].strip()[:22], "", "въезд / entry", ""], [c.city(c.dest), "", "доставлено / delivered", ""]]
        y = p.table(L, y, cols, rows, hs=14, rs=16, min_h=50) + 20
        p.box_stamp(L + 700, y - 230, ["ТАМОЖНЯ ОТПРАВЛЕНИЯ", "ACCEPTED · DEMO", c.sh.get("invoiceDate", "")], color=SEAL_VIOLET, size=15)
    signature_block(p, L, y + 20, "Выдал / Issued by", f"{c.initial(doc)}. Rasulov")
    p.seal(R - 180, y + 40, issuer.upper()[:30] + " · DEMO", ["DEMO"], radius=80)
    p.barcode(L, BOTTOM - 90, 420, 50, seed=doc["file"])
    return p


def identity_specimen(doc, c: Ctx) -> Sheet:
    """Personal documents (driver's passport or licence, bank card) as plain specimens with masked data."""
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    p.watermark("SPECIMEN")
    p.text(W / 2, TOP + 20, f"{title.upper()} — FICTIONAL SPECIMEN", 26, True, align="center")
    p.text(W / 2, TOP + 58, "Demo pack only. Not an identity or payment document; numbers are masked.", 16, color=LABEL, align="center")
    body = doc.get("body") or ""
    name = re.search(r"of ([A-Z][a-z]+ [A-Z][a-z]+)", body)
    holder = name.group(1) if name else c.rep["name"]
    x0, y0 = L + 160, TOP + 150
    p.rect(x0, y0, R - 160, y0 + 520, 3, color=(120, 120, 140))
    if "card" in title.lower():
        p.rect(x0 + 40, y0 + 60, x0 + 140, y0 + 130, 2, fill=(220, 200, 120))
        p.text(x0 + 40, y0 + 200, f"8600 •••• •••• {c.num(doc, 4)}", 38, True, "mono", color=FILL)
        p.text(x0 + 40, y0 + 280, "VALID THRU  ••/••", 20, face="mono", color=LABEL)
        p.text(x0 + 40, y0 + 330, c.trader["name"].upper(), 24, True, "mono", color=FILL)
        p.text(x0 + 40, y0 + 400, "Payment of fees for entrance and transit (E-tranzit)", 17, color=LABEL)
    else:
        p.rect(x0 + 30, y0 + 40, x0 + 250, y0 + 320, 2, fill=(236, 238, 244))
        p.text(x0 + 140, y0 + 170, "PHOTO", 24, True, color=FAINT, align="center")
        parts = holder.split()
        rows = [("Surname / Фамилия", parts[-1].upper() if parts else ""), ("Given names / Имя", " ".join(parts[:-1]).upper()), ("Document No / Номер", f"{c.num(doc, 2).upper()} •••{c.num(doc, 4, 'x')}"), ("Categories / Категории" if "license" in title.lower() else "Nationality / Гражданство", "B, C, CE" if "license" in title.lower() else "DEMO"), ("Date of expiry / Действителен до", "••.••.2030")]
        yy = y0 + 40
        for label, value in rows:
            p.text(x0 + 290, yy, label, 15, color=LABEL)
            p.text(x0 + 290, yy + 20, value, 22, True, color=FILL)
            yy += 56
        p.signature(x0 + 60, y0 + 400, 180)
    p.text(W / 2, y0 + 560, f"Holder: {holder} · case: {c.case_line}", 16, color=LABEL, align="center")
    return p


def register_cover(doc, c: Ctx) -> Sheet:
    """Package of documents: a covering letter with the register of what is enclosed."""
    t = c.trader
    p = Sheet(seed=doc["file"])
    y = letterhead(p, t)
    p.text(R, y, addressee(title_of(doc) + " railway", c).split("\n")[0], 18, align="right")
    p.text(R, y + 26, "АО «Узбекистон темир йуллари»", 18, align="right")
    y += 80
    p.text(W / 2, y, "СОПРОВОДИТЕЛЬНОЕ ПИСЬМО / COVERING LETTER", 26, True, align="center")
    p.text(W / 2, y + 36, "Пакет документов / Package of documents", 18, color=LABEL, align="center")
    y += 80
    y = p.para(L, y, R - L, f"{t['name']} направляет пакет документов для отправки груза по контракту {c.sh['contractNo']} от {c.sh['contractDate']} ({c.case_line}).", 19, align="justify", indent=40) + 20
    body = doc.get("body") or ""
    enclosed = [part.strip(" .") for part in re.split(r",\s*(?=[a-z])", body.replace("Enclosed:", "")) if part.strip()] or ["Commercial invoice", "Railway bill", "Certificate of origin"]
    cols = [(60, "№"), (620, "Наименование документа / Document"), (220, "Кол-во листов / Sheets"), (220, "Экз. / Copies")]
    rows = [[str(i + 1), item, str(1 + i % 3), "1 оригинал"] for i, item in enumerate(enclosed)]
    y = p.table(L, y, cols, rows, hs=14, rs=17, min_h=36) + 20
    p.text(L, y, f"Всего документов: {len(rows)}", 18, True)
    y += 70
    signature_block(p, L, y, "Директор", t["manager"])
    signature_block(p, L, y + 70, "Документы сдал", c.rep["name"])
    company_seal(p, L + 780, y + 40, t, radius=86)
    p.rect(L, y + 170, R, y + 320, 1, fill=(246, 246, 246))
    p.text(L + 10, y + 180, "Документы принял / Received by:", 17, True)
    p.text(L + 10, y + 214, "товарный кассир станции ________________   дата ____________", 17)
    p.box_stamp(R - 330, y + 190, ["ПРИНЯТО · RECEIVED", c.sh.get("invoiceDate", "")], color=SEAL_VIOLET, size=18)
    return p


def not_applicable(doc, c: Ctx) -> Sheet:
    """A letter for a document the route doesn't need, stating why."""
    t = c.trader
    p = Sheet(seed=doc["file"])
    y = letterhead(p, t)
    p.text(W / 2, y + 20, "ПОЯСНИТЕЛЬНОЕ ПИСЬМО / EXPLANATORY NOTE", 26, True, align="center")
    p.text(W / 2, y + 56, title_of(doc), 18, color=LABEL, align="center")
    y += 110
    y = p.para(L, y, R - L, doc.get("body") or f"{title_of(doc)} is not required for this shipment.", 20, align="justify", indent=40) + 20
    y = p.kv_table(L, y, (330, R - L - 330), shipment_rows(c), ls=16, vs=17) + 40
    signature_block(p, L, y, "Директор", t["manager"])
    company_seal(p, L + 760, y + 30, t)
    return p


def purchase_or_land(doc, c: Ctx) -> Sheet:
    """Evidence of origin: a purchase act from a farm, or a land-plot lease."""
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    land = "land" in title.lower()
    serif = "serif"
    p.text(W / 2, TOP + 20, "ДОГОВОР АРЕНДЫ ЗЕМЕЛЬНОГО УЧАСТКА" if land else "АКТ ЗАКУПКИ СЕЛЬСКОХОЗЯЙСТВЕННОЙ ПРОДУКЦИИ", 26, True, serif, align="center")
    p.text(W / 2, TOP + 56, title, 17, face=serif, color=LABEL, align="center")
    p.text(W / 2, TOP + 84, f"№ {c.num(doc, 4)}-{c.pid}", 20, face=serif, align="center")
    y = TOP + 130
    p.text(L, y, f"г. {c.city(t['address'] or 'Tashkent')}", 19, face=serif)
    p.text(R, y, c.sh.get("contractDate", ""), 19, face=serif, align="right")
    y += 50
    farm = f"Фермерское хозяйство «Demo Bog'i {c.num(doc, 2)}»"
    body = doc.get("body") or ""
    if land:
        text = f"Хокимият района (demo), именуемый «Арендодатель», и {t['name']}, именуемое «Арендатор», заключили договор о нижеследующем: Арендодатель передает, а Арендатор принимает во временное пользование земельный участок для выращивания и переработки сельскохозяйственной продукции."
    else:
        text = f"Мы, нижеподписавшиеся, {farm} («Продавец») и {t['name']} («Покупатель»), составили настоящий акт о том, что Покупатель закупил у Продавца сельскохозяйственную продукцию собственного производства."
    y = p.para(L, y, R - L, text, 19, face=serif, align="justify", indent=40) + 14
    if body and "for the shipment" not in body:
        y = p.para(L, y, R - L, body, 18, face=serif, align="justify", indent=40) + 14
    if land:
        rows = [("Кадастровый номер", f"DEMO-{c.num(doc, 2)}-{c.num(doc, 4, 'cad')}"), ("Местоположение", t["address"]), ("Площадь", f"{c.rng(doc).randint(3, 40)} га"), ("Назначение", "сельскохозяйственное"), ("Срок аренды", "до 31.12.2030"), ("Арендная плата", f"{money(c.rng(doc).randint(5, 40) * 1_000_000, 0)} UZS в год")]
        y = p.kv_table(L, y, (380, R - L - 380), rows, ls=17, vs=18) + 30
    else:
        cols = [(60, "№"), (420, "Наименование продукции"), (180, "Кол-во, кг"), (200, "Цена, сум/кг"), (260, "Сумма, сум")]
        net = amount_value(c.sh["netKg"]) * 1.03
        price = c.rng(doc).randint(8, 30) * 1000
        y = p.table(L, y, cols, [["1", f"{c.sh['goods']} (урожай 2026 г.)", money(net, 0), money(price, 0), money(net * price, 0)], ["", "Итого", money(net, 0), "", money(net * price, 0)]], hs=14, rs=17, min_h=36, bold_last=True) + 20
        y = p.para(L, y, R - L, f"Сумма прописью: {sum_in_words(net * price)}. Оплата произведена банковским переводом.", 17, face="italic") + 30
    half = (R - L) / 2
    for x, role, name in ((L, "Арендодатель" if land else "Продавец", "Хокимият (demo)" if land else farm), (L + half, "Арендатор" if land else "Покупатель", t["name"])):
        p.text(x, y, role, 18, True, serif)
        p.para(x, y + 28, half - 20, name, 17, face=serif, color=FILL)
        p.hline(x, x + 260, y + 110)
        p.signature(x + 30, y + 98, 170)
    p.seal(L + 380, y + 90, "DEMO FERMER XO'JALIGI" if not land else "TUMAN HOKIMLIGI · DEMO", ["DEMO"], radius=70, color=SEAL)
    company_seal(p, L + half + 380, y + 90, t, radius=70)
    return p


def notification(doc, c: Ctx) -> Sheet:
    """A short official notice: code notification, telegram, identification number, stamp sample, data list."""
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    if re.search(r"telegram", title, re.I):
        p.rect(L, TOP + 10, R, TOP + 700, 2)
        p.text(W / 2, TOP + 30, "ТЕЛЕГРАММА · TELEGRAM", 28, True, "mono", align="center")
        p.text(L + 20, TOP + 90, f"ПРИНЯТА {c.sh.get('invoiceDate', '')} 10:4{c.num(doc, 1)}  № {c.num(doc, 5)}", 18, face="mono")
        lines = [f"КОМУ: ДС СТАНЦИИ {c.sh['departureStation'].upper()}", f"ОТ: {t['name'].upper()}", "", f"ОПЛАТА ЖД ТАРИФА ПО ЗАЯВКЕ ГУ-12 ПРОИЗВЕДЕНА ПЛАТЕЖНЫМ ПОРУЧЕНИЕМ {c.num(doc, 4, 'pp')}", f"СУММА {money(c.rng(doc).randint(20, 90) * 1_000_000, 0)} СУМ", f"ВАГОНЫ {c.unit_list}", f"ГРУЗ {c.sh['goods'].upper()} {c.sh['netKg']} КГ", "ПРОСИМ ОБЕСПЕЧИТЬ ПОДАЧУ ВАГОНОВ", f"ДИРЕКТОР {t['manager'].upper()}"]
        y = TOP + 150
        for line in lines:
            y = p.para(L + 20, y, R - L - 40, line, 22, face="mono") + 4
        p.box_stamp(R - 360, TOP + 560, ["ТЕЛЕГРАФ · ПЕРЕДАНО", c.sh.get("invoiceDate", "")], color=SEAL_VIOLET)
        return p
    if re.search(r"^stamp$", title, re.I):
        y = letterhead(p, t)
        p.text(W / 2, y + 30, "ОБРАЗЕЦ ОТТИСКА ПЕЧАТИ / SPECIMEN OF COMPANY STAMP", 24, True, align="center")
        company_seal(p, W / 2, y + 300, t, radius=150)
        p.text(W / 2, y + 520, "Подлинность оттиска подтверждаю", 18, align="center")
        signature_block(p, L + 250, y + 580, "Директор", t["manager"])
        return p
    y = letterhead(p, t) if not re.search(r"code notification", title, re.I) else TOP + 10
    if re.search(r"code notification", title, re.I):
        p.text(L, y, "ООО «Demo Forwarding» · экспедитор АО «Узбекистон темир йуллари»", 18, True)
        p.text(L, y + 28, "Договор № FWD-44 · ИНН 302987654", 15, color=LABEL)
        p.hline(L, R, y + 56, 2)
        y += 80
    p.text(W / 2, y + 10, "УВЕДОМЛЕНИЕ / NOTIFICATION", 26, True, align="center")
    p.text(W / 2, y + 46, title, 18, color=LABEL, align="center")
    y += 100
    rows = shipment_rows(c)
    if re.search(r"code notification", title, re.I):
        rows = [("Клиент", t["name"]), ("Присвоенный код плательщика", c.num(doc, 7, "code")), ("Код экспедитора", c.num(doc, 4, "fw")), ("Действует до", "31.12.2026")] + rows[:3]
    elif re.search(r"identification number", title, re.I):
        rows = [("Идентификационный номер контракта (ЕЭИСВО)", f"{c.num(doc, 3)}{c.num(doc, 9, 'id')}"), ("Дата регистрации", c.sh.get("contractDate", ""))] + rows
    elif re.search(r"documents requ|information from following", title, re.I):
        rows = [("Сведения", "Необходимые для заполнения заявки / декларации")] + rows + [("Документы", "контракт; инвойс; упаковочный лист; транспортный документ; разрешительные документы")]
    y = p.kv_table(L, y, (420, R - L - 420), rows, ls=16, vs=18) + 40
    body = doc.get("body") or ""
    if body and "for the shipment" not in body and "applies for" not in body:
        y = p.para(L, y, R - L, body, 18, align="justify") + 30
    signature_block(p, L, y, "Руководитель", t["manager"] if not re.search(r"code notification", title, re.I) else "A. Demo")
    p.seal(R - 200, y + 30, "DEMO FORWARDING · TOSHKENT" if re.search(r"code notification", title, re.I) else f"{re.sub(r'[^A-Za-z ]', '', t['name']).upper()[:24]} · DEMO", ["DEMO"], radius=82)
    return p


def agreement(doc, c: Ctx) -> Sheet:
    """Service agreements with the Technological Center, railway, warehouse."""
    t = c.trader
    title = title_of(doc)
    p = Sheet(seed=doc["file"])
    serif = "serif"
    provider = "Технологический центр АО «Узбекистон темир йуллари» (demo)" if "technolog" in title.lower() else "ООО «Demo Customs Warehouse»" if "warehouse" in title.lower() else "АО «Узбекистон темир йуллари» (demo)"
    no = f"{c.num(doc, 3)}/{c.pid}-{c.num(doc, 2, 'y')}"
    p.text(W / 2, TOP + 10, f"ДОГОВОР № {no}", 30, True, serif, align="center")
    p.text(W / 2, TOP + 50, title, 18, face=serif, color=LABEL, align="center")
    p.text(L, TOP + 100, f"г. {c.city(t['address'] or 'Tashkent')}", 19, face=serif)
    p.text(R, TOP + 100, c.sh.get("contractDate", ""), 19, face=serif, align="right")
    y = TOP + 150
    y = p.para(L, y, R - L, f"{provider}, именуемое «Исполнитель», в лице директора, действующего на основании Устава, с одной стороны, и {t['name']}, именуемое «Заказчик», в лице директора {t['manager']}, с другой стороны, заключили настоящий договор о нижеследующем:", 18, face=serif, align="justify", indent=40) + 10
    clauses = [
        ("1. ПРЕДМЕТ ДОГОВОРА", "1.1. Исполнитель оказывает Заказчику услуги, указанные в Приложении № 1, а Заказчик оплачивает их. 1.2. Услуги оказываются в отношении груза Заказчика: " + c.case_line + "."),
        ("2. СТОИМОСТЬ И ПОРЯДОК РАСЧЕТОВ", "2.1. Стоимость услуг определяется по тарифам Исполнителя и указывается в счете на оплату. 2.2. Оплата производится 100% предоплатой в течение 3 банковских дней с даты выставления счета. В назначении платежа указывается номер счета."),
        ("3. ОБЯЗАННОСТИ СТОРОН", "3.1. Исполнитель оказывает услуги в согласованные сроки и уведомляет Заказчика об их выполнении в электронном виде. 3.2. Заказчик своевременно предоставляет документы и оплачивает услуги."),
        ("4. ОТВЕТСТВЕННОСТЬ", "4.1. За просрочку оплаты Заказчик уплачивает пеню 0,1% за каждый день, но не более 10% суммы. 4.2. Споры разрешаются в экономическом суде г. Ташкента."),
        ("5. СРОК ДЕЙСТВИЯ", "5.1. Договор вступает в силу с даты подписания (акцепта в электронной системе) и действует до 31.12.2026."),
    ]
    for head, body in clauses:
        p.text(L, y + 6, head, 18, True, serif)
        y = p.para(L, y + 32, R - L, body, 17, face=serif, align="justify") + 8
    cols = [(60, "№"), (620, "Приложение № 1 — Услуги"), (200, "Ед. изм."), (240, "Тариф")]
    services = [["1", "Оформление перевозочных документов в электронном виде", "отправка", "по тарифу"], ["2", "Присвоение кода плательщика и расчеты по провозным платежам", "договор", "по тарифу"], ["3", "Информационное сопровождение груза", "вагон/сутки", "по тарифу"]]
    if "warehouse" in title.lower():
        services = [["1", "Размещение и хранение товаров на СВХ", "т/сутки", "по тарифу"], ["2", "Погрузочно-разгрузочные работы", "т", "по тарифу"], ["3", "Предоставление места для таможенного досмотра", "операция", "по тарифу"]]
    y = p.table(L, y + 10, cols, services, hs=14, rs=16, min_h=32) + 30
    half = (R - L) / 2
    for x, role, name, bank in ((L, "ИСПОЛНИТЕЛЬ", provider, "р/с 2020 8000 0000 0000 0101, МФО 00014"), (L + half, "ЗАКАЗЧИК", t["name"], t["bank"])):
        p.text(x, y, role, 18, True, serif)
        yy = p.para(x, y + 28, half - 20, name, 16, face=serif, color=FILL)
        yy = p.para(x, yy, half - 20, bank, 15, face=serif, color=FILL)
        p.hline(x, x + 240, yy + 50)
        p.signature(x + 30, yy + 40, 150)
    p.seal(L + 350, y + 160, "UZBEKISTON TEMIR YO'LLARI · DEMO" if "warehouse" not in title.lower() else "DEMO CUSTOMS WAREHOUSE", ["DEMO"], radius=70, color=SEAL)
    company_seal(p, L + half + 350, y + 160, t, radius=70)
    return p


LETTER_KINDS = [
    (r"islamic republic of iran|\(own wagons\)", not_applicable),
    (r"^online application|^electronic application", portal_printout),
    (r"certificate of state registration|registration certificate|certificate of analysis|quality certificate|availability of funds|normative documents", issued_certificate),
    (r"tir carnet|control book|atp certificate|authorization for international|transit declaration|export declaration of the exporter|vehicle entrance|vehicle registration|vehicle information|non-tariff|description of goods", carrier_document),
    (r"international passport|driver'?s license|bank card", identity_specimen),
    (r"package of documents", register_cover),
    (r"purchase of agricultural|right to use a land plot", purchase_or_land),
    (r"telegram|code notification|identification number|^stamp$|documents requ|information from following", notification),
    (r"^agreement|^contract for", agreement),
]


def letter(doc, c: Ctx) -> Sheet:
    title = title_of(doc)
    for pattern, render in LETTER_KINDS:
        if re.search(pattern, title, re.I):
            return render(doc, c)
    return application_letter(doc, c)


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
    "cmr": cmr,
    "awb": awb,
    "shippers_letter": shippers_letter,
    "declaration": declaration,
    "lab_report": lab_report,
    "packing_list": packing_list,
    "vet_cert": vet_cert,
    "conformity": conformity,
    "quarantine_permit": quarantine_permit,
    "letter": letter,
}


def render_pack(scenario: dict, out: Path, only: set[str] | None = None) -> int:
    c = Ctx(scenario, out)
    count = 0
    for doc in scenario["documents"]:
        if only and doc["file"] not in only:
            continue
        TEMPLATES[doc["template"]](doc, c).save(out / doc["file"])
        count += 1
    return count
