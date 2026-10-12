"""Inventory Elementor Pro forms on sunrockresidences.com and (on request) add a webhook action.

  python3 sunrock/wp/forms.py scan                 # read-only: list every form and its submit actions
  python3 sunrock/wp/forms.py add-webhook <URL>    # dry run: show what would change
  python3 sunrock/wp/forms.py add-webhook <URL> --apply   # write changes (backs up _elementor_data first)
  options: --only=pages/2021,elementor_library/446   --include-newsletter (also Mailchimp-only forms)
"""
import json
import sys
import time
from pathlib import Path

import wp

TYPES = ["pages", "posts", "elementor_library", "e-floating-buttons"]
LANGS = ["", "all", "en", "ru", "el", "de", "he", "uk", "fr", "pl", "zh-hans", "ar"]
BACKUP = Path(__file__).parent / "backups"


def all_items():
    seen = {}
    for t in TYPES:
        for lang in LANGS:
            page = 1
            while True:
                q = f"per_page=100&page={page}&context=edit&status=publish,draft,private,pending,future&_fields=id,slug,status,link,meta"
                if lang:
                    q += f"&lang={lang}"
                s, d = wp.request("GET", f"wp/v2/{t}", q)
                if s != 200 or not isinstance(d, list) or not d:
                    break
                for it in d:
                    seen[(t, it["id"])] = it
                if len(d) < 100:
                    break
                page += 1
    return seen


def walk(elements, path=()):
    for el in elements or []:
        if el.get("elType") == "widget" and el.get("widgetType") == "form":
            yield el
        yield from walk(el.get("elements"), path + (el.get("id"),))


def forms_in(item):
    raw = (item.get("meta") or {}).get("_elementor_data")
    if not raw:
        return [], None
    data = json.loads(raw) if isinstance(raw, str) else raw
    return list(walk(data)), data


def scan():
    rows = []
    for (t, pid), it in sorted(all_items().items()):
        forms, _ = forms_in(it)
        for f in forms:
            st = f.get("settings", {})
            rows.append({
                "type": t, "id": pid, "slug": it.get("slug"), "status": it.get("status"),
                "form_id": f.get("id"), "form_name": st.get("form_name"),
                "submit_actions": st.get("submit_actions"), "webhooks": st.get("webhooks"),
                "fields": [x.get("custom_id") or x.get("field_label") for x in st.get("form_fields", [])],
            })
    return rows


def add_webhook(url, apply=False, only=None, include_newsletter=False):
    BACKUP.mkdir(exist_ok=True)
    changed = []
    for (t, pid), it in sorted(all_items().items()):
        if only and f"{t}/{pid}" not in only:
            continue
        forms, data = forms_in(it)
        touched = False
        for f in forms:
            st = f.setdefault("settings", {})
            actions = st.get("submit_actions")
            if actions is None:
                actions = ["email"]  # Elementor default when the control was never changed
            if not include_newsletter and set(actions) == {"mailchimp"}:
                continue  # newsletter sign-up, not a lead form
            if "webhook" in actions and st.get("webhooks") == url:
                continue
            new_actions = actions + ([] if "webhook" in actions else ["webhook"])
            changed.append({"type": t, "id": pid, "slug": it.get("slug"), "form_id": f.get("id"),
                            "form_name": st.get("form_name"), "before": actions, "after": new_actions,
                            "old_webhook": st.get("webhooks")})
            st["submit_actions"] = new_actions
            st["webhooks"] = url
            st["webhooks_advanced_data"] = "yes"
            touched = True
        if touched and apply:
            stamp = time.strftime("%Y%m%d-%H%M%S")
            (BACKUP / f"{t}-{pid}-{stamp}.json").write_text(it["meta"]["_elementor_data"])
            s, d = wp.request("POST", f"wp/v2/{t}/{pid}", body={"meta": {"_elementor_data": json.dumps(data, ensure_ascii=False)}})
            print(f"{t}/{pid}: {s}")
            if s != 200:
                print(json.dumps(d, ensure_ascii=False)[:500])
    return changed


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scan"
    if cmd == "scan":
        print(json.dumps(scan(), ensure_ascii=False, indent=1))
    elif cmd == "add-webhook":
        only = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")]
        only = set(only[0].split(",")) if only else None
        print(json.dumps(add_webhook(sys.argv[2], "--apply" in sys.argv, only, "--include-newsletter" in sys.argv),
                         ensure_ascii=False, indent=1))
    else:
        sys.exit(__doc__)
