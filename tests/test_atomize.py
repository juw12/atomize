"""Run the Atomize engine in a real browser and check every output channel."""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = """# Why small teams should ship weekly

Shipping every week forces a team to cut scope until the work fits. That constraint is the point.
In our last quarter we moved from monthly to weekly releases and cut bug-fix time from 9 days to 2 days.
Weekly releases make feedback cheap, and the team learns which features nobody uses.
The hard part is agreeing that an unfinished feature stays behind a flag.
Start with one rule: every Friday something reaches users, even if it is small.
Teams that ship weekly also write smaller pull requests, which makes review faster."""


def main():
    failures = 0
    engine = (ROOT / "atomize.js").read_text(encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content("<html><body></body></html>")
        page.add_script_tag(content=engine)
        result = page.evaluate("(t) => window.Atomize.atomize(t, {linkedin: 3, tweets: 5})", ARTICLE)
        short = page.evaluate("() => window.Atomize.atomize('Too short.')")
        long_text = "word " * 400
        fitted = page.evaluate("(t) => window.Atomize.fit(t, 280)", long_text)

        checks = [
            ("article is accepted", result["ok"]),
            ("3 LinkedIn posts", len(result["linkedin"]) == 3),
            ("LinkedIn posts fit 1300 chars", all(len(p) <= 1300 for p in result["linkedin"])),
            ("5-tweet thread numbered n/5", len(result["thread"]) == 5 and result["thread"][-1].endswith("5/5")),
            ("every tweet fits 280 chars", all(len(t) <= 280 for t in result["thread"])),
            ("newsletter has a subject from the title", result["newsletter"].startswith("Subject: Why small teams should ship weekly")),
            ("script has a hook and a close", result["script"].startswith("HOOK") and "CLOSE:" in result["script"]),
            ("numbers in the source are kept", any("9 days" in p for p in result["linkedin"] + result["thread"])),
            ("keywords found", "weekly" in result["stats"]["keywords"]),
            ("too-short input is refused with a message", short["ok"] is False and "three" in short["error"]),
            ("fit() trims to the limit", len(fitted) <= 280 and fitted.endswith("…")),
        ]

        page.goto((ROOT / "index.html").as_uri())
        page.click("#sample")
        page.wait_for_selector("#out:not([hidden])")
        cards = page.locator(".draft").count()
        checks.append(("UI renders all drafts from the sample", cards >= 5 + 8 + 2))
        browser.close()

    for name, ok in checks:
        print(("[PASS] " if ok else "[FAIL] ") + name)
        failures += 0 if ok else 1
    print("PASSED" if not failures else f"FAILED ({failures})")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
