"""Drawing kit for the demo document packs: an A4 sheet (150 dpi) with ruled
form cells, tables, seals, signatures and QR marks, so a demo page is laid out
like the printed form it stands in for.

Every sheet carries DEMO banners top and bottom. Values are drawn in a
different face from printed labels, the way a filled-in form looks.
"""

from __future__ import annotations

import hashlib
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1754  # A4 at 150 dpi
GAP = 28  # grey gutter between stacked pages
L, R = 60, 1180  # content edges
TOP, BOTTOM = 62, H - 58  # below / above the banners
FONTS = "C:/Windows/Fonts/"
FACES = {
    ("sans", False): "arial.ttf",
    ("sans", True): "arialbd.ttf",
    ("narrow", False): "ARIALN.TTF",
    ("narrow", True): "ARIALNB.TTF",
    ("serif", False): "times.ttf",
    ("serif", True): "timesbd.ttf",
    ("italic", False): "timesi.ttf",
    ("italic", True): "timesbi.ttf",
    ("mono", False): "cour.ttf",
    ("mono", True): "courbd.ttf",
}
INK = (18, 18, 18)
FILL = (10, 24, 70)  # filled-in values: dark blue-black
LABEL = (60, 60, 60)
RULE = (40, 40, 40)
FAINT = (150, 150, 150)
SHADE = (236, 236, 236)
DEMO_RED = (185, 28, 28)
SEAL = (35, 70, 170)
SEAL_VIOLET = (92, 52, 160)
PEN = (20, 40, 120)

_fonts: dict[tuple[str, int, bool], ImageFont.FreeTypeFont] = {}


def font(size: int, bold: bool = False, face: str = "sans") -> ImageFont.FreeTypeFont:
    key = (face, size, bold)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(FONTS + FACES[(face, bold)], size)
    return _fonts[key]


def seeded(*parts: object) -> random.Random:
    digest = hashlib.sha1("|".join(map(str, parts)).encode("utf-8")).hexdigest()
    return random.Random(int(digest[:12], 16))


class Sheet:
    """One or more A4 pages stacked into a single image."""

    def __init__(self, pages: int = 1, seed: object = "demo"):
        self.pages = pages
        self.rng = seeded(seed)
        self.image = Image.new("RGB", (W, H * pages + GAP * (pages - 1)), "white")
        self.draw = ImageDraw.Draw(self.image)
        for i in range(pages):
            top = self.top(i)
            if i:
                self.draw.rectangle([0, top - GAP, W, top], fill=(200, 200, 200))
            self._banner(top)
            self._banner(top + H - 40)
            if pages > 1:
                self.text(R, top + H - 70, f"стр. / page {i + 1} из / of {pages}", 15, color=LABEL, align="right")

    @staticmethod
    def top(page: int) -> int:
        return page * (H + GAP)

    def _banner(self, y: int) -> None:
        self.draw.rectangle([0, y, W, y + 40], fill=DEMO_RED)
        self.draw.text((L, y + 10), "DEMO — NOT A REAL DOCUMENT · UzTrade demo pack · all names and numbers are invented", fill="white", font=font(18, True))

    # ------------------------------------------------------------- text ---

    def width(self, text: str, size: int, bold: bool = False, face: str = "sans") -> float:
        return self.draw.textlength(str(text), font=font(size, bold, face))

    def text(self, x: float, y: float, text: str, size: int = 20, bold: bool = False, face: str = "sans", color=INK, align: str = "left") -> float:
        text = str(text)
        if align != "left":
            w = self.width(text, size, bold, face)
            x = x - w if align == "right" else x - w / 2
        self.draw.text((x, y), text, fill=color, font=font(size, bold, face))
        return y + int(size * 1.3)

    def wrap(self, text: str, size: int, width: float, bold: bool = False, face: str = "sans") -> list[str]:
        out: list[str] = []
        for para in str(text).split("\n"):
            current = ""
            for word in para.split():
                trial = f"{current} {word}".strip()
                if self.width(trial, size, bold, face) <= width or not current:
                    current = trial
                else:
                    out.append(current)
                    current = word
            out.append(current)
        return out or [""]

    def para(self, x: float, y: float, width: float, text: str, size: int = 20, bold: bool = False, face: str = "sans", color=INK, leading: float = 1.32, align: str = "left", indent: int = 0) -> float:
        lines = self.wrap(text, size, width - indent, bold, face)
        for i, line in enumerate(lines):
            lx = x + (indent if i == 0 else 0)
            if align == "center":
                self.text(x + width / 2, y, line, size, bold, face, color, "center")
            elif align == "justify" and i < len(lines) - 1 and " " in line:
                words = line.split()
                total = sum(self.width(w, size, bold, face) for w in words)
                space = (width - (indent if i == 0 else 0) - total) / (len(words) - 1)
                cx = lx
                for word in words:
                    self.draw.text((cx, y), word, fill=color, font=font(size, bold, face))
                    cx += self.width(word, size, bold, face) + space
            else:
                self.text(lx, y, line, size, bold, face, color)
            y += int(size * leading)
        return y

    def spaced(self, x: float, y: float, text: str, size: int, bold: bool = True, face: str = "sans", spacing: int = 6, color=INK) -> None:
        """Letter-spaced heading, centred on x."""
        total = sum(self.width(ch, size, bold, face) + spacing for ch in text) - spacing
        cx = x - total / 2
        for ch in text:
            self.draw.text((cx, y), ch, fill=color, font=font(size, bold, face))
            cx += self.width(ch, size, bold, face) + spacing

    # ------------------------------------------------------------ rules ---

    def rect(self, x0: float, y0: float, x1: float, y1: float, width: int = 2, fill=None, color=RULE) -> None:
        self.draw.rectangle([x0, y0, x1, y1], outline=color, width=width, fill=fill)

    def hline(self, x0: float, x1: float, y: float, width: int = 1, color=RULE) -> None:
        self.draw.line([(x0, y), (x1, y)], fill=color, width=width)

    def vline(self, x: float, y0: float, y1: float, width: int = 1, color=RULE) -> None:
        self.draw.line([(x, y0), (x, y1)], fill=color, width=width)

    def dotted(self, x0: float, x1: float, y: float, color=FAINT) -> None:
        for x in range(int(x0), int(x1), 7):
            self.draw.line([(x, y), (min(x + 3, x1), y)], fill=color, width=1)

    def field_line(self, x: float, y: float, width: float, label: str, value: str, size: int = 20, vsize: int | None = None, face: str = "sans", vface: str = "sans") -> float:
        """Printed label followed by a filled value on a dotted rule."""
        vsize = vsize or size + 1
        self.text(x, y, label, size, face=face, color=INK)
        vx = x + self.width(label, size, face=face) + 12
        lines = self.wrap(value or "", vsize, x + width - vx)
        self.text(vx, y - 1, lines[0], vsize, face=vface, color=FILL)
        self.dotted(vx - 4, x + width, y + size + 4)
        y += int(max(size, vsize) * 1.5)
        for line in lines[1:]:
            self.text(x, y - 1, line, vsize, face=vface, color=FILL)
            self.dotted(x, x + width, y + size + 4)
            y += int(max(size, vsize) * 1.5)
        return y

    # ------------------------------------------------------------ cells ---

    def cell(self, x: float, y: float, w: float, h: float, label: str = "", value: str = "", ls: int = 15, vs: int = 21, bold_label: bool = False, shade: bool = False, vface: str = "sans", pad: int = 7, border: int = 2) -> float:
        """A ruled form box: printed label top-left, filled value under it.
        Returns the y where the value text ended."""
        self.rect(x, y, x + w, y + h, border, fill=SHADE if shade else None)
        cy = y + 4
        if label:
            for line in self.wrap(label, ls, w - 2 * pad, bold_label):
                self.text(x + pad, cy, line, ls, bold_label, color=LABEL if not bold_label else INK)
                cy += int(ls * 1.25)
            cy += 3
        if value:
            for line in self.wrap(value, vs, w - 2 * pad - 4, face=vface):
                if cy + vs > y + h:
                    break
                self.text(x + pad + 4, cy, line, vs, face=vface, color=FILL)
                cy += int(vs * 1.28)
        return cy

    def table(self, x: float, y: float, cols: list[tuple[float, str]], rows: list[list[str]], hs: int = 14, rs: int = 18, min_h: int = 30, header_shade: bool = True, align: list[str] | None = None, numbered_header: bool = False, bold_last: bool = False) -> float:
        """Ruled table; returns the bottom y."""
        pad = 5
        align = align or ["left"] * len(cols)
        total = sum(w for w, _ in cols)
        # header
        heads = [self.wrap(h, hs, w - 2 * pad, True) for w, h in cols]
        hh = max(len(lines) for lines in heads) * int(hs * 1.25) + 12
        self.rect(x, y, x + total, y + hh, 2, fill=SHADE if header_shade else None)
        cx = x
        for (w, _), lines in zip(cols, heads):
            ly = y + (hh - len(lines) * int(hs * 1.25)) / 2
            for line in lines:
                self.text(cx + w / 2, ly, line, hs, True, align="center")
                ly += int(hs * 1.25)
            cx += w
            self.vline(cx, y, y + hh, 1)
        y += hh
        if numbered_header:
            cx = x
            self.rect(x, y, x + total, y + 22, 1)
            for i, (w, _) in enumerate(cols):
                self.text(cx + w / 2, y + 3, str(i + 1), 13, align="center", color=LABEL)
                cx += w
                self.vline(cx, y, y + 22)
            y += 22
        for r, row in enumerate(rows):
            bold = bold_last and r == len(rows) - 1
            cells = [self.wrap(v, rs, w - 2 * pad, bold) for (w, _), v in zip(cols, row)]
            rh = max(min_h, max(len(c) for c in cells) * int(rs * 1.25) + 10)
            self.rect(x, y, x + total, y + rh, 1)
            cx = x
            for (w, _), lines, a in zip(cols, cells, align):
                ly = y + 5
                for line in lines:
                    if a == "right":
                        self.text(cx + w - pad, ly, line, rs, bold, color=FILL, align="right")
                    elif a == "center":
                        self.text(cx + w / 2, ly, line, rs, bold, color=FILL, align="center")
                    else:
                        self.text(cx + pad, ly, line, rs, bold, color=FILL)
                    ly += int(rs * 1.25)
                cx += w
                self.vline(cx, y, y + rh)
            y += rh
        return y

    def kv_table(self, x: float, y: float, widths: tuple[float, float], rows: list[tuple[str, str]], ls: int = 17, vs: int = 19, min_h: int = 30, shade_labels: bool = True) -> float:
        """Two-column table: printed label | filled value."""
        lw, vw = widths
        for label, value in rows:
            llines = self.wrap(label, ls, lw - 12)
            vlines = self.wrap(value, vs, vw - 14)
            rh = max(min_h, max(len(llines) * int(ls * 1.25), len(vlines) * int(vs * 1.25)) + 10)
            self.rect(x, y, x + lw, y + rh, 1, fill=SHADE if shade_labels else None)
            self.rect(x + lw, y, x + lw + vw, y + rh, 1)
            ly = y + 5
            for line in llines:
                self.text(x + 6, ly, line, ls, color=INK)
                ly += int(ls * 1.25)
            vy = y + 5
            for line in vlines:
                self.text(x + lw + 8, vy, line, vs, color=FILL)
                vy += int(vs * 1.25)
            y += rh
        return y

    def digit_boxes(self, x: float, y: float, digits: str, size: int = 26, box: int = 30) -> float:
        for i, ch in enumerate(digits):
            self.rect(x + i * box, y, x + (i + 1) * box, y + box + 6, 1)
            self.text(x + i * box + box / 2, y + 5, ch, size - 6, color=FILL, align="center")
        return x + len(digits) * box

    # ------------------------------------------------------------ marks ---

    def signature(self, x: float, y: float, w: float = 170, color=PEN) -> None:
        rng = self.rng
        points = []
        steps = 46
        for i in range(steps + 1):
            t = i / steps
            px = x + t * w
            py = y + math.sin(t * math.pi * rng.uniform(3.5, 6.0) + rng.uniform(0, 3)) * rng.uniform(6, 16) * (1 - 0.5 * t)
            points.append((px, py))
        self.draw.line(points, fill=color, width=3, joint="curve")
        lx = x + rng.uniform(0.1, 0.3) * w
        self.draw.line([(lx, y + 14), (lx + 18, y - 22), (lx + 26, y + 10)], fill=color, width=2, joint="curve")
        self.draw.line([(x + w * 0.55, y + 16), (x + w * 1.05, y + 10)], fill=color, width=2)

    def seal(self, cx: float, cy: float, ring: str, center: list[str], radius: int = 105, color=SEAL, angle: float | None = None, star: bool = True) -> None:
        """Round seal: text around the ring, lines in the middle, slightly
        rotated and translucent, like an ink stamp."""
        size = radius * 2 + 20
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        ink = color + (200,)
        c = size / 2
        d.ellipse([c - radius, c - radius, c + radius, c + radius], outline=ink, width=5)
        d.ellipse([c - radius + 30, c - radius + 30, c + radius - 30, c + radius - 30], outline=ink, width=2)
        ring = f" {ring} •" if star else f" {ring} "
        ring_font = font(max(12, radius // 6), True)
        n = len(ring)
        for i, ch in enumerate(ring):
            theta = 2 * math.pi * i / n - math.pi / 2
            glyph = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
            ImageDraw.Draw(glyph).text((20, 20), ch, fill=ink, font=ring_font, anchor="mm")
            glyph = glyph.rotate(-math.degrees(theta) - 90, resample=Image.BICUBIC)
            gx = c + (radius - 16) * math.cos(theta) - 20
            gy = c + (radius - 16) * math.sin(theta) - 20
            layer.alpha_composite(glyph, (int(gx), int(gy)))
        mid_font = font(max(12, radius // 6), True)
        y = c - len(center) * (radius // 6 + 4) / 2
        for line in center:
            d.text((c, y), line, fill=ink, font=mid_font, anchor="ma")
            y += radius // 6 + 4
        rotation = angle if angle is not None else self.rng.uniform(-18, 18)
        layer = layer.rotate(rotation, resample=Image.BICUBIC)
        base = self.image.convert("RGBA")
        base.alpha_composite(layer, (int(cx - size / 2), int(cy - size / 2)))
        self.image = base.convert("RGB")
        self.draw = ImageDraw.Draw(self.image)

    def box_stamp(self, x: float, y: float, lines: list[str], color=SEAL_VIOLET, size: int = 20, angle: float | None = None) -> None:
        """Rectangular rubber stamp (datestamp, "PAID", "RELEASED")."""
        f = font(size, True)
        w = max(self.width(t, size, True) for t in lines) + 36
        h = len(lines) * int(size * 1.35) + 24
        layer = Image.new("RGBA", (int(w) + 40, int(h) + 40), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        ink = color + (205,)
        d.rectangle([20, 20, 20 + w, 20 + h], outline=ink, width=4)
        d.rectangle([26, 26, 14 + w, 14 + h], outline=ink, width=1)
        ty = 32
        for t in lines:
            d.text((20 + w / 2, ty), t, fill=ink, font=f, anchor="ma")
            ty += int(size * 1.35)
        layer = layer.rotate(angle if angle is not None else self.rng.uniform(-8, 8), resample=Image.BICUBIC, expand=True)
        base = self.image.convert("RGBA")
        base.alpha_composite(layer, (int(x), int(y)))
        self.image = base.convert("RGB")
        self.draw = ImageDraw.Draw(self.image)

    def qr(self, x: float, y: float, size: int = 130, seed: object = "qr") -> None:
        rng = seeded(seed)
        n = 25
        m = size / n
        self.rect(x - 4, y - 4, x + size + 4, y + size + 4, 1, color=FAINT)
        for i in range(n):
            for j in range(n):
                finder = (i < 7 and j < 7) or (i < 7 and j >= n - 7) or (i >= n - 7 and j < 7)
                if finder:
                    a, b = (i if i < 7 else i - (n - 7)), (j if j < 7 else j - (n - 7))
                    on = a in (0, 6) or b in (0, 6) or (2 <= a <= 4 and 2 <= b <= 4)
                else:
                    on = rng.random() < 0.48
                if on:
                    self.draw.rectangle([x + j * m, y + i * m, x + (j + 1) * m - 0.5, y + (i + 1) * m - 0.5], fill=INK)

    def barcode(self, x: float, y: float, w: float, h: float, seed: object = "bar") -> None:
        rng = seeded(seed)
        cx = x
        while cx < x + w:
            bw = rng.choice([1, 2, 2, 3, 4])
            if rng.random() < 0.55:
                self.draw.rectangle([cx, y, cx + bw - 1, y + h], fill=INK)
            cx += bw

    def emblem(self, cx: float, cy: float, r: int = 42, color=(30, 90, 160)) -> None:
        """A neutral round emblem (not any real state emblem)."""
        self.draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=3)
        self.draw.ellipse([cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8], outline=color, width=1)
        for k in range(12):
            a = k * math.pi / 6
            self.draw.line([(cx + math.cos(a) * (r - 14), cy + math.sin(a) * (r - 14)), (cx + math.cos(a) * 8, cy + math.sin(a) * 8)], fill=color, width=2)
        self.text(cx, cy + r + 4, "DEMO", 12, True, color=color, align="center")

    def watermark(self, text: str, page: int = 0, color=(235, 235, 240)) -> None:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.text((W / 2, H / 2), text, fill=color + (255,), font=font(150, True), anchor="mm")
        layer = layer.rotate(35, resample=Image.BICUBIC)
        base = self.image.convert("RGBA")
        # watermark goes under the ink: blend only onto white pixels
        region = base.crop((0, self.top(page), W, self.top(page) + H))
        mask = region.convert("L").point(lambda v: 255 if v > 245 else 0)
        region.paste(layer, (0, 0), Image.composite(layer.getchannel("A"), Image.new("L", (W, H), 0), mask))
        base.paste(region, (0, self.top(page)))
        self.image = base.convert("RGB")
        self.draw = ImageDraw.Draw(self.image)

    def guilloche(self, x0: float, y0: float, x1: float, y1: float, color=(200, 215, 235)) -> None:
        """Fine wave border, as on printed certificates."""
        for k in range(3):
            pts = []
            for t in range(0, int(x1 - x0), 4):
                pts.append((x0 + t, y0 + 8 + k * 5 + 4 * math.sin(t / (9 + k))))
            self.draw.line(pts, fill=color, width=1)
            pts = [(x0 + t, y1 - 8 - k * 5 + 4 * math.sin(t / (9 + k))) for t in range(0, int(x1 - x0), 4)]
            self.draw.line(pts, fill=color, width=1)
            pts = [(x0 + 8 + k * 5 + 4 * math.sin(t / (9 + k)), y0 + t) for t in range(0, int(y1 - y0), 4)]
            self.draw.line(pts, fill=color, width=1)
            pts = [(x1 - 8 - k * 5 + 4 * math.sin(t / (9 + k)), y0 + t) for t in range(0, int(y1 - y0), 4)]
            self.draw.line(pts, fill=color, width=1)
        self.rect(x0, y0, x1, y1, 3, color=color)
        self.rect(x0 + 26, y0 + 26, x1 - 26, y1 - 26, 1, color=color)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, optimize=True)


# ------------------------------------------------------------- numbers ---

_ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
_ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
_TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
_TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
_HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]


def _plural(n: int, forms: tuple[str, str, str]) -> str:
    n = abs(n) % 100
    if 11 <= n <= 19:
        return forms[2]
    n %= 10
    return forms[0] if n == 1 else forms[1] if 2 <= n <= 4 else forms[2]


def _triad(n: int, feminine: bool) -> list[str]:
    words = [_HUNDREDS[n // 100]]
    rest = n % 100
    if 10 <= rest <= 19:
        words.append(_TEENS[rest - 10])
    else:
        words.append(_TENS[rest // 10])
        words.append((_ONES_F if feminine else _ONES)[rest % 10])
    return [w for w in words if w]


def ru_words(n: int) -> str:
    """Integer in Russian words, as written on Uzbek payment documents."""
    if n == 0:
        return "ноль"
    scales = [(None, False), (("тысяча", "тысячи", "тысяч"), True), (("миллион", "миллиона", "миллионов"), False), (("миллиард", "миллиарда", "миллиардов"), False)]
    parts: list[str] = []
    i = 0
    while n:
        n, triad = divmod(n, 1000)
        if triad:
            forms, fem = scales[i]
            words = _triad(triad, fem)
            if forms:
                words.append(_plural(triad, forms))
            parts = words + parts
        i += 1
    return " ".join(parts)


def amount_value(text: str) -> float:
    digits = "".join(ch for ch in str(text) if ch.isdigit() or ch == ".")
    try:
        return float(digits) if digits else 0.0
    except ValueError:
        return 0.0


def money(value: float, decimals: int = 2) -> str:
    whole = f"{value:,.{decimals}f}".replace(",", " ")
    return whole


def sum_in_words(value: float, currency: str = "UZS") -> str:
    whole = int(round(value))
    if currency == "UZS":
        text = f"{ru_words(whole)} {_plural(whole, ('сум', 'сума', 'сумов'))} 00 тийин"
    else:
        cents = int(round((value - int(value)) * 100))
        text = f"{ru_words(int(value))} долларов США {cents:02d} центов"
    return text[0].upper() + text[1:]
