"""Sunrock-branded rebuild of the Jan–Sep 2026 report. Content is unchanged; only the design differs."""
from pathlib import Path
OUT = Path(__file__).parent / "report.html"

def data(title_img, plat, extra="", caption=""):
    imgs = title_img if isinstance(title_img, str) else title_img
    return f'''<section class="slide">
  <div class="runner">Sunrock Residences</div><img class="emb" src="assets/emblem_gold.png" alt="">
  <h1>Statistical <span class="s">Data</span></h1>
  {imgs}
  {caption}
  <div class="plat">{plat}</div>
</section>'''

def shot(src, maxw=1760, maxh=680, top=262, left=80, cls="frame"):
    return f'<div class="shot {cls}" style="left:{left}px;top:{top}px"><img src="assets/{src}" style="max-width:{maxw}px;max-height:{maxh}px;width:auto;height:auto"></div>'

GADS = '<img src="assets/gads.png" style="height:92px">'
YT = '<img src="assets/youtube.png" style="height:64px">'
SR = '<img src="assets/logo_gold.png" style="height:120px">'

slides = []
slides.append('''<section class="slide cover">
  <div class="photo" style="background-image:url(assets/ph_pool.jpg)"></div>
  <div class="panel"><div class="inner">
    <div class="kick">Digital Marketing <span class="s">Report for</span></div>
    <img class="logo" src="assets/logo_gold.png" alt="Sunrock Residences">
    <div class="date">January – September 2026</div>
  </div><img class="agency" src="assets/wizard_gold.png" alt=""></div>
</section>''')
slides.append(data(shot("1.webp", maxh=600, top=300), GADS))
slides.append(data(shot("shot_002.png", maxw=860, maxh=700, top=262) + shot("shot_004.png", maxw=860, maxh=700, top=262, left=980), GADS))
slides.append(data(shot("shot_008.png", maxw=1640, maxh=640, top=262), GADS,
                   caption='<div class="cap" style="position:absolute;left:80px;top:948px;font-size:40px;font-family:PF;text-transform:uppercase">Last 28 days</div>'))
slides.append(data(shot("2.webp"), YT))
slides.append(data(shot("3.webp"), YT))
slides.append(data(shot("s_geo.png"), YT))
slides.append(data(f'''<div class="shot frame" style="left:80px;top:262px;width:1300px;background:#0e0e0e">
  <img src="assets/s_age.png" style="width:1300px"><img src="assets/s_gender.png" style="width:1300px;margin-top:24px"></div>''', YT))
slides.append(data(shot("s_cities.png"), SR))
slides.append(data(shot("8.webp"), SR))
slides.append(data(shot("9.png", maxh=680), SR))
slides.append('''<section class="slide closing" style="background-image:url(assets/ph_facade.jpg)">
  <div class="veil"></div><img class="logo" src="assets/logo_gold.png" alt="Sunrock Residences">
</section>''')

OUT.write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Sunrock — Digital Marketing Report 2026</title><link rel="stylesheet" href="brand.css"></head>
<body>{"".join(slides)}</body></html>''')
print("slides:", len(slides))
