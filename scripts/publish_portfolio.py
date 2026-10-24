#!/usr/bin/env python3
"""Publish the software-app catalog (scripts/apps.json) to the portfolio site
and the Obsidian vault. Standard library only.

What it does:
  * Regenerates the portfolio Projects cards between the
    PROJECTS:MANAGED:START / END markers in <portfolio>/index.html.
  * Writes one Obsidian project note per app (Portfolio/Projects/<Name>.md).
  * Writes one timestamped Update Log entry (Update Log/<date> <HHmm> portfolio.md).
  * Idempotent: re-running with an unchanged catalog changes nothing.

Usage:
  python scripts/publish_portfolio.py [--portfolio-dir DIR] [--vault DIR]
                                      [--dry-run] [--push]
"""

import argparse
import json
import os
import re
import shutil
import subprocess
from datetime import date, datetime
from html import unescape
from pathlib import Path

SITE_BASE = "https://juwpegatron.github.io/projects/"
REPO_URL = "https://github.com/juwpegatron/projects"
PUSH_MESSAGE = "chore(projects): sync project cards from apps.json"

START_MARKER = (
    "          <!-- PROJECTS:MANAGED:START "
    "(auto-generated from apps.json by scripts/publish_portfolio.py \u2014 do not edit by hand) -->"
)
END_MARKER = "          <!-- PROJECTS:MANAGED:END -->"

# The START marker body is matched leniently so the notice text can change
# without breaking the sync; the END marker is matched literally.
START_RE = re.compile(r"^[ \t]*<!-- PROJECTS:MANAGED:START[^>]*-->", re.MULTILINE)
END_RE = re.compile(r"^[ \t]*<!-- PROJECTS:MANAGED:END -->", re.MULTILINE)

CARD_INDENT = " " * 10
CARD_SEP = "\n" + CARD_INDENT + "\n"


def repo_root():
    return Path(__file__).resolve().parent.parent


def load_apps(root=None):
    path = (root or repo_root()) / "scripts" / "apps.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    apps = data["apps"] if isinstance(data, dict) else data
    return sorted(apps, key=lambda a: a.get("order", 0))


def render_card(app):
    ind = CARD_INDENT
    pid = f' data-project-id="{app["project_id"]}"' if app.get("project_id") else ""
    lines = [
        f'{ind}<article class="project-card" data-category="{app["category"]}"{pid}>',
        f'{ind}  <img src="./assets/projects/{app["image"]}" alt="{app["image_alt"]}" '
        f'class="project-card-image" loading="lazy" decoding="async">',
    ]
    thumbs = app.get("thumbnails") or []
    if thumbs:
        lines.append(f'{ind}  <div class="project-thumbnails">')
        for t in thumbs:
            lines.append(
                f'{ind}    <button type="button" class="thumbnail-btn" '
                f'data-primary="./assets/projects/{t["src"]}" data-alt="{t["alt"]}" '
                f'aria-label="{t["label"]}">'
            )
            lines.append(
                f'{ind}      <img src="./assets/projects/{t["src"]}" alt="{t["alt"]}" '
                f'class="thumbnail-img" loading="lazy" decoding="async">'
            )
            lines.append(f"{ind}    </button>")
        lines.append(f"{ind}  </div>")
    lines.append(f'{ind}  <div class="project-content">')
    lines.append(f'{ind}    <span class="project-category">{app["category"]}</span>')
    lines.append(f'{ind}    <h3 class="project-title">{app["name"]}</h3>')
    lines.append(f'{ind}    <p class="project-description">{app["description"]}</p>')
    lines.append(f'{ind}    <div class="project-tags">')
    for tag in app["tags"]:
        lines.append(f'{ind}      <span class="tag">{tag}</span>')
    lines.append(f"{ind}    </div>")
    lines.append(f'{ind}    <div class="project-links">')
    for label, key in (("App", "app"), ("Web", "web"), ("Mobile", "mobile")):
        lines.append(
            f'{ind}      <a class="project-link" href="{SITE_BASE}{app["links"][key]}" '
            f'target="_blank" rel="noopener noreferrer">{label}</a>'
        )
    lines.append(f"{ind}    </div>")
    lines.append(f"{ind}  </div>")
    lines.append(f"{ind}</article>")
    return "\n".join(lines)


def render_block(apps):
    cards = CARD_SEP.join(render_card(a) for a in apps)
    return START_MARKER + "\n" + cards + "\n" + END_MARKER


def update_index(portfolio_dir, apps, dry_run):
    index = portfolio_dir / "index.html"
    text = index.read_text(encoding="utf-8")
    start = START_RE.search(text)
    end = END_RE.search(text)
    if not start or not end or end.start() < start.end():
        raise SystemExit(
            f"ERROR: software markers not found in {index}. Expected "
            "'<!-- PROJECTS:MANAGED:START ... -->' before the first software card "
            "and '<!-- PROJECTS:MANAGED:END -->' after the last."
        )
    new_text = text[: start.start()] + render_block(apps) + text[end.end():]
    changed = new_text != text
    if changed and not dry_run:
        index.write_text(new_text, encoding="utf-8")
    return changed


def app_url(app, key):
    return SITE_BASE + app["links"][key]


def render_note(app, today):
    links_yaml = (
        ", ".join(f'"{app_url(app, k)}"' for k in ("app", "web", "mobile"))
        + f', "apps/{app["id"]}/"'
    )
    tags_yaml = "[" + ", ".join(unescape(t) for t in app["tags"]) + "]"
    return (
        "---\n"
        f"id: {app['id']}\n"
        f"app: {app['id']}\n"
        "type: project\n"
        "status: shipped\n"
        f"date: {today}\n"
        f"tags: {tags_yaml}\n"
        f"links: [{links_yaml}]\n"
        "---\n\n"
        f"{unescape(app['description'])}\n\n"
        "## App / Web / Mobile\n\n"
        f"- **App** \u2014 {app_url(app, 'app')}\n"
        f"- **Web** \u2014 {app_url(app, 'web')}\n"
        f"- **Mobile** \u2014 {app_url(app, 'mobile')}\n\n"
        f"Monorepo: {REPO_URL} (`apps/{app['id']}/`)\n"
    )


def write_notes(vault, apps, today, dry_run):
    out_dir = vault / "Portfolio" / "Projects"
    written = []
    for app in apps:
        note = out_dir / f"{app['name']}.md"
        content = render_note(app, today)
        written.append(note)
        if not dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
            note.write_text(content, encoding="utf-8")
    return written


def resolve_git():
    found = shutil.which("git")
    if found:
        return found
    local = os.environ.get("LOCALAPPDATA")
    candidates = [
        Path(local) / "Programs" / "Git" / "cmd" / "git.exe" if local else None,
        Path(os.environ.get("ProgramFiles", "")) / "Git" / "cmd" / "git.exe",
    ]
    for c in candidates:
        if c and c.is_file():
            return str(c)
    return None


def git_env():
    return dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="Never")


def git_changed_files(portfolio_dir):
    git = resolve_git()
    if not git:
        return ["index.html"]
    try:
        out = subprocess.run(
            [git, "-C", str(portfolio_dir), "status", "--short"],
            capture_output=True, text=True, env=git_env(), timeout=30,
        )
        return [line[3:].strip() for line in out.stdout.splitlines() if line.strip()]
    except OSError:
        return ["index.html"]


def git_commit_push(portfolio_dir):
    git = resolve_git()
    if not git:
        raise SystemExit("ERROR: --push requested but git was not found")
    env = git_env()
    status = subprocess.run(
        [git, "-C", str(portfolio_dir), "status", "--porcelain"],
        capture_output=True, text=True, env=env,
    )
    if status.stdout.strip():
        subprocess.run([git, "-C", str(portfolio_dir), "add", "-A"], env=env, check=True)
        subprocess.run(
            [git, "-C", str(portfolio_dir), "commit", "-m", PUSH_MESSAGE],
            env=env, check=True,
        )
    subprocess.run([git, "-C", str(portfolio_dir), "push"], env=env, check=True)


def write_update_log(vault, apps, portfolio_dir, today, stamp, changed_files, pushed, dry_run):
    log_dir = vault / "Update Log"
    note = log_dir / f"{today} {stamp} portfolio.md"
    lines = [
        "# Update - portfolio",
        "",
        f"- When: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "- Apps published ({n}): {names}".format(
            n=len(apps), names=", ".join(a["name"] for a in apps)
        ),
        f"- Portfolio repo: {portfolio_dir.as_posix()}",
        f"- Portfolio index: {(portfolio_dir / 'index.html').as_posix()}",
        f"- Pushed: {pushed}",
        "",
        f"## Changed files ({len(changed_files)})",
        "",
    ]
    lines += [f"- `{f}`" for f in changed_files]
    content = "\n".join(lines) + "\n"
    if not dry_run:
        log_dir.mkdir(parents=True, exist_ok=True)
        note.write_text(content, encoding="utf-8")
    return note


def main():
    parser = argparse.ArgumentParser(
        description="Publish scripts/apps.json cards to the portfolio + Obsidian vault"
    )
    parser.add_argument(
        "--portfolio-dir", default=str(repo_root().parent / "portfolio"),
        help="Portfolio repo directory (default: ../portfolio next to the monorepo)",
    )
    parser.add_argument(
        "--vault",
        default=str(Path(os.environ.get("USERPROFILE", str(Path.home())))
                    / "Documents" / "Obsidian Vault"),
        help="Obsidian vault directory (default: %%USERPROFILE%%\\Documents\\Obsidian Vault)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print changes, write nothing")
    parser.add_argument("--push", action="store_true", help="Commit and push the portfolio repo")
    parser.add_argument("--no-notes", action="store_true", help="Skip Obsidian notes + update log (CI)")
    args = parser.parse_args()

    portfolio_dir = Path(args.portfolio_dir).expanduser().resolve()
    vault = Path(args.vault).expanduser().resolve()
    apps = load_apps()
    today = date.today().isoformat()
    stamp = datetime.now().strftime("%H%M")

    print(f"Catalog: {len(apps)} apps -> {', '.join(a['id'] for a in apps)}")
    print(f"Portfolio: {portfolio_dir}")
    print(f"Vault: {vault}")
    if args.dry_run:
        print("DRY RUN - no files will be written")

    changed = update_index(portfolio_dir, apps, args.dry_run)
    print(f"index.html: {'would change' if changed else 'unchanged'}")

    if args.no_notes:
        print("Obsidian notes: skipped (--no-notes)")
    else:
        notes = write_notes(vault, apps, today, args.dry_run)
        print(f"Obsidian notes: {len(notes)} -> {vault / 'Portfolio' / 'Projects'}")

    pushed = False
    if args.push and not args.dry_run:
        git_commit_push(portfolio_dir)
        pushed = True
        print("Pushed portfolio repo")

    if args.no_notes:
        return
    changed_files = git_changed_files(portfolio_dir) if not args.dry_run else ["index.html"]
    log = write_update_log(
        vault, apps, portfolio_dir, today, stamp, changed_files, pushed, args.dry_run
    )
    print(f"Update log: {log}")


if __name__ == "__main__":
    main()
