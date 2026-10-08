"""Rebuild the Sunrock report for Jan–Sep 2026: swap screenshots, reorder, keep untouched slides vector."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pypdf import PdfReader, PdfWriter

W = Path(__file__).parent
SRC_PDF = Path(sys.argv[1])  # original 2025 report
IMG = Path(sys.argv[2])  # folder with new screenshots
OUT = Path(sys.argv[3])

BG = (242, 243, 244)
BLUE = (12, 105, 148)
FONT = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"

# Areas to wipe on each template, leaving the title and the bottom-right logo intact
CLEAR_ADS = [[0, 400, 3840, 1860]]
CLEAR_YT = [[0, 400, 3840, 1950], [0, 1950, 3040, 2120]]
CLEAR_SITE = [[0, 400, 3840, 1960], [0, 1960, 2600, 2120]]
BOX = (150, 470, 3690, 1910)


def page(n):
    return Image.open(W / "orig" / f"p-{n:02d}.png").convert("RGB")


def shot(name, crop=None):
    im = Image.open(IMG / name).convert("RGB")
    return im.crop(crop) if crop else im


def stack(*ims, gap=40, bg=(14, 14, 14)):
    w = max(i.width for i in ims)
    out = Image.new("RGB", (w, sum(i.height for i in ims) + gap * (len(ims) - 1)), bg)
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height + gap
    return out


def place(slide, im, clear, box=BOX):
    """Wipe the old screenshot and fit the new one into box (x0,y0,x1,y1), left-aligned."""
    d = ImageDraw.Draw(slide)
    for rect in clear:
        d.rectangle(rect, fill=BG)
    x0, y0, x1, y1 = box
    k = min((x1 - x0) / im.width, (y1 - y0) / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    r = 36
    # soft shadow so screenshots sit cleanly on the light slide
    sh = Image.new("L", (im.width + 120, im.height + 120), 0)
    ImageDraw.Draw(sh).rounded_rectangle([60, 70, 60 + im.width, 70 + im.height], r, fill=60)
    sh = sh.filter(ImageFilter.GaussianBlur(28))
    slide.paste((200, 202, 206), (x0 - 60, y0 - 60), sh)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *im.size], r, fill=255)
    slide.paste(im, (x0, y0), mask)
    return slide


def cover():
    s = page(1)
    d = ImageDraw.Draw(s)
    d.rectangle([1650, 1900, 2090, 2060], fill=BLUE)  # old "2025"
    f = ImageFont.truetype(FONT, 112)
    text = "January – September 2026"
    w = d.textlength(text, font=f)
    d.text((1868 - w / 2, 1982), text, font=f, fill="white", anchor="lm")
    return s


# Final deck: ints are original pages kept as vector, images are rebuilt slides.
deck = [
    cover(),
    place(page(2), shot("1.webp"), CLEAR_ADS, (150, 560, 3690, 1820)),  # Google Ads
    3,  # Ads demographics & devices
    4,  # Ads last 28 days
    place(page(7), shot("2.webp"), CLEAR_YT),  # YouTube channel
    place(page(6), shot("3.webp"), CLEAR_YT),  # YouTube content
    place(page(8), shot("4.webp", (0, 0, 2000, 760)), CLEAR_YT),  # YouTube geography
    place(page(9), stack(shot("5.png"), shot("6.png", (0, 0, 2000, 290))), CLEAR_YT),  # age + gender
    place(page(11), shot("7.webp", (0, 45, 2000, 1049)), CLEAR_SITE),  # GA4 cities
    place(page(12), shot("8.webp"), CLEAR_SITE),  # GA4 pages
    place(page(14), shot("9.png"), CLEAR_SITE),  # GA4 countries
]

src = PdfReader(SRC_PDF)
out = PdfWriter()
for i, s in enumerate(deck, start=1):
    if isinstance(s, int):
        out.add_page(src.pages[s - 1])
        continue
    s.save(W / f"new-{i:02d}.png")
    s.save(W / f"new-{i:02d}.pdf", "PDF", resolution=144, quality=92)
    out.add_page(PdfReader(W / f"new-{i:02d}.pdf").pages[0])
out.write(OUT)
print("written", OUT, len(deck), "slides")
