# Document specimens R&D — what the procedures ask for, and what each document contains

Source: section "7. Document samples" of the five procedure .docx files
(306, 325, 477, 540, 868). Each procedure publishes one specimen image per
document it asks for. Extracted with `specimens-v2.cjs` (images **precede**
their caption in the docx; the first extraction paired them one-off and was
discarded).

## Inventory

- 92 distinct document/input names across the five procedures (51 in 306/325/868,
  57 in 477, 43 in 540).
- Roughly a third are **portal inputs**, not documents (TIN, email, phone, One ID,
  online banking, "Physical presence"). Their specimens are portal screenshots.
- About 25 are **uploadable documents** — the scope of document parsing.
- Specimens come in three kinds: blank official forms (UZ phytosanitary
  certificate, CT-1, Form A, TD1), filled and redacted real documents
  (KZ phytosanitary certificate, airport prepayment invoice, GU-12, TD1), and
  portal screenshots (online applications).
- Languages: Russian dominant; Uzbek Cyrillic (ў қ ғ ҳ); Kazakh; English labels
  on international forms. **OCR must read Cyrillic and Latin together.**

## Field inventories (from the specimens)

### Commercial invoice — `СЧЕТ/INVOICE` (bilingual template)
Invoice number · page · **Sent by**: company name, name/department, address,
city/postal code, country, tel/fax, VAT reg. no · **Sent to**: same set ·
transport document (waybill/CMR/bill of lading) no · number of pieces · total
gross weight · total net weight · carrier · currency of invoice · number/date of
contract · lines: full description of goods, customs commodity code, country of
origin, quantity, unit value, sub-total · total value FOB · freight · insurance ·
total value CIF · terms of transportation (Incoterms) · signature, name, place
and date.

### Packing list — `УПАКОВОЧНЫЙ ЛИСТ / PACKING LIST` (bilingual)
Number · date · seller, buyer, shipper, consignee (each: name, address, INN,
tel) · lines: name of product, packaging, number of packages, net weight (kg),
gross weight (kg) · HS code · director signature.

### Railway bill — `Накладная СМГС` (SMGS, numbered boxes)
1 sender (+signature) · 2 departure station · 3 sender's statements · 4
consignee · 5 destination station · 6 border crossing stations · 7 wagon · 8
wagon provided by · 9 load capacity · 10 axles · 11 tare · 13 cargo weight ·
15 name of cargo · 16 type of packaging · 17 number of places · 18 weight (kg) ·
19 seals (count, marks) · 20 loaded by · 21 weighing method · 22 carriers ·
23 payment of carriage charges · 24 documents attached by sender · 25 info not
for carrier / contract no · 26 date of contract of carriage · 27 date of arrival
· 28 customs marks · 29 dispatch no.

### Air waybill — IATA
Shipper name/address and account no · consignee name/address and account no ·
issuing carrier's agent, IATA code · airport of departure and routing · airport
of destination · flight/date · currency · declared value for carriage / customs ·
amount of insurance · handling information · no. of pieces · gross weight ·
rate class · chargeable weight · rate · total · nature and quantity of goods
(dimensions/volume) · prepaid/collect charges · shipper signature · executed on
(date, place).

### Phytosanitary certificate — IPPC model (UZ blank; KZ filled)
2 certificate no (e.g. `UZ-EX №`, KZ `0709/20210302 0111319810/2`) · 1 exporter
name and address · 3 declared consignee · 4 plant protection organisation of
(country) · 5 declared point of entry (KZ: station Yangiyul) · 6 place of origin
· 7 declared means of conveyance · 8 name of produce, botanical name (KZ: wheat
class 4, *Triticum aestivum*) · 9 number and description of packages, quantity
declared (KZ: 68.75 t) · 11 additional declaration · treatment: 12 method (KZ:
fumigation), 13 chemical (phosphine), 14 duration and temperature (-10 °C, 170 h),
15 concentration (9 g/m³), 16 date · 17 additional information · place and date
of issue · authorised officer, stamp · form series (KZ: AA №2340489).

### Certificate of origin — form CT-1 (CIS)
4 № · issued in (country) · for presentation in (country) · 1 exporter · 2
consignee · 3 means of transport and route · 5 for official use · 6 item no · 7
number and kind of packages · 8 description of goods · 9 gross/net weight (kg) ·
10 number and date of invoice · 11 certification (signature, date, stamp) · 12
declaration by applicant (country of production, destination).

### Certificate of origin — Form A (GSP)
Reference no · issued in · 1 goods consigned from · 2 consigned to · 3 means of
transport and route · 4 for official use · 5 item number · 6 marks and numbers
of packages · 7 number and kind of packages, description · 8 origin criterion ·
9 gross weight or other quantity · 10 number and date of invoices · 11
certification · 12 exporter declaration (produced in, exported to).

### Certificate of origin — general form
4 № (issued in Republic of Uzbekistan) · 1 consignor/exporter · 2
consignee/importer · 3 means of transport and route · 5 remarks · 6 № · 7 marks
and numbers of packages · 8 number and kind of packages, description · 9 origin
criterion · 10 gross/net weight, quantity · 11 number and date of invoices · 12
certification · 13 declaration by applicant (exported to).

### Cargo customs declaration — `ГТД / TD1` (54 boxes; IM70 is the same form)
1 declaration type (e.g. `ИМ 40`, export `ЭК 10`) · 2 sender/exporter · 5 total
items · 6 number of places · 7 reference number · 8 consignee/importer · 9
person responsible for settlement · 10 country of first destination · 11 trading
country · 12 total customs value · 14 declarant · 15 country of dispatch · 16
country of origin · 17 country of destination · 18/21 transport at departure /
at border · 20 delivery terms (e.g. `DAP`) · 22 currency and total invoiced
amount (e.g. `840`) · 23 exchange rate · 24 nature of transaction · 25/26
transport mode at border / inland · 27 place of loading · 29 customs at border ·
30 place of inspection · 31 packages and description · 32 item no · 33 commodity
code (e.g. `4407119000`) · 34 country of origin code · 35 gross weight · 37
procedure (e.g. `4000`) · 38 net weight · 40 previous document · 41
supplementary units · 42 item invoice value · 44 additional documents · 45
customs value · 46 statistical value · 47 duties (type, base, rate, amount) · 54
place and date · D customs control (inspector).

### Receipt of payment — treasury `КВИТАНЦИЯ` (two copies)
Recipient (Treasury of the Ministry of Finance) · bank name (RKC of the Central
Bank, Tashkent) · recipient account (`23 402 000 300 100 001 010`) · bank code
(`00014`) · payer address · INN (9 boxes) · treasury revenue account (source
code, currency code, control key, territorial code, type of income,
organisation code) · payer full name · type of tax/payment · arrears · current
year payment · penalty · total · amount in words (sum, tiyin) · payer signature
· date.

### Bank payment receipt (540, generic)
Receipt no · company name and address · payer name and address · date ·
description · amount · subtotal · tax · total.

### Power of attorney — `ДОВЕРЕННОСТЬ` (blank)
Number · city · date · issued to (full name) · passport series, issued by, date
· address · powers: receive/send cargo; customs operations; attend customs
operations; sign, receive and submit documents · valid until · non-transferable
· director signature and name.

### Quarantine permit — `КАРАНТИННОЕ РАЗРЕШЕНИЕ` (Uzbek/Russian/English)
№ · issued date · valid until · issued to · exporter country, region and
organisation · product name, HS code, quantity and unit · country and region of
origin · route inside Uzbekistan · border post and route of entry · FEA border
control point · type of transport · additional information · QR code ·
inspection officer name and signature.

### Offer agreement — `Оферта шартномаси` (Uzbek, phytosanitary)
Agreement no (e.g. `21140001089`) · city · date (`16-3-2021`) · parties
(Inspection; applicant) · service table: service name, unit price, quantity,
amount (e.g. `245000`) · applicant requisites.

### Invoice for payment — `СЧЕТ на оплату`
Supplier, legal address, INN, OKED, account, bank, MFO · invoice no and date ·
contract no · customer · lines: goods/services, unit, quantity, price, cost,
VAT rate, VAT amount, cost with VAT · total · total in words · director and chief
accountant signatures.

### Prepayment invoice — airport cargo `СЧЁТ ПРЕДОПЛАТА` (filled)
Invoice no and date · contract no and date · service provider (name, address,
phone, account, MFO, OKED, INN, VAT code) · customer (same set) · lines:
services, unit (kg), weight, price, cost, VAT rate (15 %), VAT amount, total
with VAT · total to pay · amount in words · signatures.

### Foreign trade contract (bilingual EN/RU)
Contract no · city · date · seller and buyer (director, charter) · 1 subject
with Incoterms (e.g. `DAP st. Alashinkoy, Incoterms 2010`) · appendices
(specification, delivery schedule, shipping order, proforma L/C) · 2 quantity ·
3 quality (quality certificate, SGS) · 4 delivery terms · 5 shipment terms (rail,
station) · 6 price and payment terms · signatures.

### Application for cargo transportation — form GU-12 (filled)
Carrier · identifier · shipper name/address/account · month · forwarder and
codes · departure station · cargo group · request no · exact cargo name · cargo
codes (ETSNG, GNG) · destination station and road code · country code ·
consignee · tonnes (e.g. `120`) · wagon type · number of wagons (`2`) · shipper
signature.

### Online application for phytosanitary certificate (portal screenshot)
Application no and date · receiving institution · certificate language ·
applicant: taxpayer type, INN, name, director, address, region, phone, fax,
email, OKPO, passport · exporter: same · importer: name, address · general:
importing country, marking, contract no and date, shipment date, destination
point · internal phytosanitary certificate no and date · payment: bank, account
· product: HS code, name, botanical name, country and region of origin, net
weight, gross weight, number of places, transport method (wagon/container nos).

### Import railway bill — SMGS, **filled** (477; Kazakhstan → Uzbekistan)
29 dispatch no · 1 sender (TOO …, Kazakhstan, Shymkent) · 4 consignee (OOO …,
Uzbekistan, Namangan region, OKPO) · 2 departure station (Shymkent KZH 698606) ·
5 destination station (Raustan Uzb ZhD 741007) · 6 border stations (Sary-Agach
704101, Keles 720602) · 7 wagon, owner (AO KTT), capacity 68, axles 4 · 15
cargo (wheat flour, first grade, in bags; ETSNG 501027) · 16 packaging (bags) ·
17 places 1360 · 18 weight 68000 kg · 19 seals (4 numbers) · 20 loaded by sender ·
21 weighing method (standard, 1 bag 50 kg) · 22 carriers and codes · 24
documents attached (invoice, phytosanitary certificate, quality certificate,
declaration of conformity) · station date stamp (13 Aug 2021). Handwriting and
stamps overlap printed boxes — the hardest OCR case in the set.

### Food test report — `Протокол испытаний` (Russian, Rostest-Moscow)
Laboratory name and accreditation no · protocol no and date · sample name ·
packaging · marking · manufacturer · applicant · normative requirements ·
accompanying document (application no/date, sample delivery, seal nos) · test
period · total pages · results table: indicator, permissible level, result,
test method standard (GOST).

### Shipper's letter of instruction — Uzbekistan Airways (numbered 1–19)
1 shipper · 2 consignee · 3 airport of departure · 4 airport of destination · 5
requested routing · 6 requesting booking · 8 marks and numbers · 9 no. and kind
of packages · 10 description of goods · 11 gross weight · 12 measurement · 13 air
freight charges prepaid/collect · 14 other charges · 15 insurance amount · 16
declared value for carriage · 17 for customs · 18 handling information · 19 date
· signature.

### Order for wagon supply for loading — letter (Russian)
From (Tashkent JSC UTY) · to (regional junction, station) · permission to
allocate wagons for month/year · company · cargo · destination (consignee,
country) · wagon fleet · graph 23 payment codes per forwarder · MPO number ·
signature · executor phone.

### Certificate on passing examination — `Далолатнома` (Uzbek, handwritten)
Citizen full name · year of birth · education · position · loading/unloading
station · company name · examination basis (Railway Regulation §81) · result ·
time · commission chair · members · station head · signature.

### Islamic Republic of Iran approval letter — Railway of Iran (Russian)
Number · date · addressee (JSC Uzbekistan Temir Yo'llari; copies to
Turkmenistan railways) · carrier approval for cargo in big bags, wagon type ·
from station (Uzbekistan) · via (Sarakhs) · to (Bandar Abbas) · valid until ·
shipper · consignee and forwarder in Iran · conditions (SMGS annex 2, axle load,
gauge) · signatory.

## Implications for parsing

1. The expected document type is known from the step, so classification is a
   check ("this looks like a packing list"), not a guess.
2. Most official forms are **numbered boxes with bilingual labels** — label
   anchors plus layout give reliable key→value pairs.
3. Filled specimens exist for evaluation (KZ phytosanitary certificate, TD1,
   airport invoice, GU-12, offer agreement); blank ones test that empty fields
   stay empty.
4. Not yet read: food test report, import railway bill, certificate of state
   registration, customs-warehouse contract, code notification, wagon order,
   certificate on passing examination, availability of funds, Iran approval
   letter, guiding letter, vehicle documents, shipper's letter of instruction.
