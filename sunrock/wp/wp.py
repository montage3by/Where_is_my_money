"""Minimal WordPress REST client for sunrockresidences.com.

Credentials come from the environment, never from code or chat:
  SUNROCK_WP_USER          WordPress username of the API user
  SUNROCK_WP_APP_PASSWORD  Application Password created in wp-admin → Users → Profile

Usage:
  python3 sunrock/wp/wp.py me                    # check auth: who am I, which role
  python3 sunrock/wp/wp.py get wp/v2/pages 'per_page=100&_fields=id,slug,title,modified'
  python3 sunrock/wp/wp.py post wp/v2/pages/123 '{"title":"..."}'   # writes: only on explicit request
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("SUNROCK_WP_URL", "https://sunrockresidences.com").rstrip("/") + "/wp-json/"


def _auth_header():
    user, pw = os.environ.get("SUNROCK_WP_USER"), os.environ.get("SUNROCK_WP_APP_PASSWORD")
    if not user or not pw:
        sys.exit("SUNROCK_WP_USER / SUNROCK_WP_APP_PASSWORD are not set in this environment")
    return "Basic " + base64.b64encode(f"{user}:{pw.replace(' ', '')}".encode()).decode()


def request(method, path, query="", body=None, retries=4):
    url = BASE + path.lstrip("/") + (("?" + query) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", _auth_header())
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")
        except (urllib.error.URLError, ConnectionError) as e:
            # the host occasionally resets connections; back off and retry
            if attempt == retries - 1:
                raise
            time.sleep(2 ** (attempt + 1))


def main(argv):
    if not argv or argv[0] == "me":
        status, d = request("GET", "wp/v2/users/me", "context=edit&_fields=id,username,name,roles,capabilities")
        if status == 200:
            caps = d.get("capabilities", {})
            print(json.dumps({"status": status, "id": d.get("id"), "username": d.get("username"),
                              "roles": d.get("roles"),
                              "can_manage_options": caps.get("manage_options", False),
                              "can_edit_pages": caps.get("edit_pages", False)}, ensure_ascii=False, indent=2))
        else:
            print(status, json.dumps(d, ensure_ascii=False)[:500])
        return
    cmd, path = argv[0], argv[1]
    if cmd == "get":
        status, d = request("GET", path, argv[2] if len(argv) > 2 else "")
    elif cmd == "post":
        status, d = request("POST", path, body=json.loads(argv[2]))
    else:
        sys.exit(__doc__)
    print(status)
    print(json.dumps(d, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
