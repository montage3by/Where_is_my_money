"""Normalize heading levels inside blog post content: no H1 in body (the template's title is the H1),
body headings start at H2 and never skip a level (order preserved).
  python3 headings.py            # dry run
  python3 headings.py --apply    # write (backs up content first)"""
import json, re, sys, time
from pathlib import Path
import wp

BACKUP = Path(__file__).parent / "backups"
H = re.compile(r"<(/?)h([1-6])\b", re.I)

def remap(levels):
    # an H1 in the body is a section heading (peer of H2s); then close gaps, starting at H2
    used = sorted(set(max(2, l) for l in levels))
    m = {l: min(6, 2 + i) for i, l in enumerate(used)}
    if 1 in levels: m[1] = m[2] if 2 in m else 2
    return m

def lead_in(html):
    # headings that come before the first H2 sit right under the title H1: make them H2
    out, seen2, changed, last = [], False, False, None
    for x in H.finditer(html):
        lvl = int(x.group(2))
        if not x.group(1):
            last = lvl if (seen2 or lvl <= 2) else 2
            seen2 = seen2 or lvl == 2
        out.append((x, last if not x.group(1) else last))
    if not any(l != int(x.group(2)) for x, l in out): return html, False
    res, pos = [], 0
    stack = []
    for x, l in out:
        res.append(html[pos:x.start()]); pos = x.end()
        if not x.group(1): stack.append(l); res.append(f"<h{l}")
        else: res.append(f"</h{stack.pop() if stack else x.group(2)}")
    res.append(html[pos:])
    return "".join(res), True

def fix(html):
    levels = [int(m.group(2)) for m in H.finditer(html) if not m.group(1)]
    if not levels: return html, {}
    m = remap(levels)
    new = H.sub(lambda x: f"<{x.group(1)}h{m[int(x.group(2))]}", html)
    new, lead = lead_in(new)
    m = {k: v for k, v in m.items() if k != v}
    if lead: m["lead-in"] = 2
    return (new, m) if m else (html, {})

def posts():
    for lang in ("en", "ru"):
        page = 1
        while True:
            s, d = wp.request("GET", "wp/v2/posts", f"lang={lang}&per_page=100&page={page}&context=edit&status=publish&_fields=id,link,content")
            if s != 200 or not d: break
            yield from d
            if len(d) < 100: break
            page += 1

if __name__ == "__main__":
    apply = "--apply" in sys.argv
    BACKUP.mkdir(exist_ok=True)
    n = 0
    for p in posts():
        raw = p["content"]["raw"]
        new, m = fix(raw)
        if not m: continue
        n += 1
        print(p["id"], m, p["link"][:90])
        if apply:
            (BACKUP / f"post-{p['id']}-content-{time.strftime('%Y%m%d-%H%M%S')}.html").write_text(raw)
            s, d = wp.request("POST", f"wp/v2/posts/{p['id']}", body={"content": new})
            if s != 200: print("  FAIL", s, json.dumps(d)[:200])
    print("posts to change:", n)
