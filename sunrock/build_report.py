"""Rebuild the Sunrock report: swap screenshots on chosen slides, keep the rest vector."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pypdf import PdfReader, PdfWriter

W = Path(__file__).parent
SRC_PDF = Path(sys.argv[1])
IMG = Path(sys.argv[2])
OUT = Path(sys.argv[3])

BG = (242, 243, 244)
BLUE = (12, 105, 148)
FONT = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"


def page(n):
    return Image.open(W / "orig" / f"p-{n:02d}.png").convert("RGB")


def rounded(im, r):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *im.size], r, fill=255)
    return mask


def place(slide, shot_path, box, clear, crop=None):
    """Clear the old screenshot area and fit the new one into box (x0,y0,x1,y1), left-aligned."""
    for rect in clear:
        ImageDraw.Draw(slide).rectangle(rect, fill=BG)
    shot = Image.open(shot_path).convert("RGB")
    if crop:
        shot = shot.crop(crop)
    x0, y0, x1, y1 = box
    k = min((x1 - x0) / shot.width, (y1 - y0) / shot.height)
    shot = shot.resize((round(shot.width * k), round(shot.height * k)), Image.LANCZOS)
    r = 36
    # soft shadow so dark screenshots sit cleanly on the light slide
    sh = Image.new("L", (shot.width + 120, shot.height + 120), 0)
    ImageDraw.Draw(sh).rounded_rectangle([60, 70, 60 + shot.width, 70 + shot.height], r, fill=60)
    sh = sh.filter(ImageFilter.GaussianBlur(28))
    slide.paste((200, 202, 206), (x0 - 60, y0 - 60), sh)
    slide.paste(shot, (x0, y0), rounded(shot, r))
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


CLEAR = [[0, 400, 3840, 1950], [0, 1950, 3040, 2120]]  # keeps the YouTube logo
BOX = (150, 470, 3690, 1910)
slides = {
    1: cover(),
    2: place(page(2), IMG / "1.webp", (150, 560, 3690, 1820), [[0, 400, 3840, 1860]]),
    6: place(page(6), IMG / "3.webp", BOX, CLEAR),
    7: place(page(7), IMG / "2.webp", BOX, CLEAR),
    8: place(page(8), IMG / "4.webp", BOX, CLEAR, crop=(0, 0, 2000, 760)),
}

src = PdfReader(SRC_PDF)
out = PdfWriter()
for i, p in enumerate(src.pages, start=1):
    if i in slides:
        tmp = W / f"new-{i:02d}.pdf"
        slides[i].save(W / f"new-{i:02d}.png")
        slides[i].save(tmp, "PDF", resolution=144, quality=92)
        out.add_page(PdfReader(tmp).pages[0])
    else:
        out.add_page(p)
out.write(OUT)
print("written", OUT)
