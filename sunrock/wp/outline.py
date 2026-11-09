"""Plan/apply a clean heading outline on Elementor pages without changing the look
(tag swaps only; verified pixel-identical: heading widgets carry their own typography).
Rules: one H1 (hero); section headings H2; cards inside a section H3; split headings (2+ heading
widgets side by side in one container) = one logical heading: first widget gets the level,
the rest become div; stats, badges, labels, phones -> div.
  python3 outline.py [ids...]          # dry run, prints the new outline
  python3 outline.py --apply [ids...]"""
import json, re, sys, time
from pathlib import Path
import wp

BACKUP = Path(__file__).parent / "backups"
PAGES = {"en": [625, 1402, 1487, 1522, 1737, 1042, 898, 978, 1174, 1239, 3],
         "ru": [2896, 2844, 2846, 2842, 2839, 2876, 2890, 2885, 2866, 2861, 2820, 2903]}
NOTHEAD = ("span", "div", "p")
DECOR = re.compile(r"m<sup>2|\d\s*m\s*2\s*$|^функции$|^\s*\+?\d[\d\s-]*$|@|^delivering soon!?$|^features$|^особенности$|^скоро сдача!?$", re.I)

def text(st): return re.sub(r"<[^>]+>", " ", st.get("title") or "").strip()
def size(st): return (st.get("typography_font_size") or {}).get("size") or 0

def groups(els):
    for e in els or []:
        kids = e.get("elements") or []
        heads = [k for k in kids if k.get("widgetType") == "heading" and k["settings"].get("header_size", "h2") not in NOTHEAD]
        if heads: yield heads
        yield from groups(kids)

def plan(data):
    changes, seen_h1, seen_h2, outline, card_lvl = [], False, False, [], None
    gs = list(groups(data))
    has_h1 = any(g[0]["settings"].get("header_size") == "h1" or any(w["settings"].get("header_size") == "h1" for w in g) for g in gs)
    for g in gs:
        st = g[0]["settings"]; t = text(st); cur = st.get("header_size", "h2")
        h1w = next((w for w in g if w["settings"].get("header_size") == "h1"), None)
        if h1w and not seen_h1:
            lead, lvl = h1w, "h1"; seen_h1 = True
        elif not has_h1 and not seen_h1:
            # hero split heading becomes the H1; skip a filler first word ("THE", "SUNROCK")
            lead = g[1] if len(g) > 1 and text(st).upper() in ("THE", "SUNROCK") else g[0]
            lvl = "h1"; seen_h1 = True
        elif all(DECOR.search(w["settings"].get("title") or "") or DECOR.search(text(w["settings"])) for w in g):
            lead, lvl = g[0], "div"
        elif len(g) == 1:
            lead, lvl = g[0], ("h2" if size(st) >= 45 or not seen_h2 else "h3")
        elif t[:1].isdigit() and len(g) > 2:          # apartment cards "2 / BEDROOM / APARTMENTS / m2"
            lead = g[0] if re.search(r"[^\d\s]", t) else g[2]
            card_lvl = card_lvl or ("h3" if seen_h2 else "h2")   # sibling cards share one level
            lvl = card_lvl
        else:
            lead, lvl = g[0], ("h2" if size(st) >= 30 else "h3")
        seen_h2 = seen_h2 or lvl == "h2"
        for w in g:
            new = lvl if w is lead else "div"
            old = w["settings"].get("header_size", "h2")
            if new != old:
                w["settings"]["header_size"] = new; changes.append((w["id"], old, new, text(w["settings"])[:40]))
        if lvl != "div":
            outline.append(f"{lvl}: " + " / ".join(text(w["settings"])[:35] for w in g))
    return changes, outline

if __name__ == "__main__":
    apply = "--apply" in sys.argv
    only = {int(a) for a in sys.argv[1:] if a.isdigit()}
    BACKUP.mkdir(exist_ok=True)
    for lang, ids in PAGES.items():
        for pid in ids:
            if only and pid not in only: continue
            s, d = wp.request("GET", f"wp/v2/pages/{pid}", f"context=edit&lang={lang}&_fields=id,slug,meta")
            raw = d["meta"]["_elementor_data"]; data = json.loads(raw)
            ch, ol = plan(data)
            print(f"== {lang} {pid} changes={len(ch)}"); [print("   ", x) for x in ol]
            if apply and ch:
                (BACKUP / f"pages-{pid}-{time.strftime('%Y%m%d-%H%M%S')}.json").write_text(raw)
                s, r = wp.request("POST", f"wp/v2/pages/{pid}", body={"meta": {"_elementor_data": json.dumps(data, ensure_ascii=False)}})
                print("   saved", s)
    if apply: print("cache", wp.request("DELETE", "elementor/v1/cache")[0])
