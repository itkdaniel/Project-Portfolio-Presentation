"""
Push apps/nexus-ai/ to github.com/itkdaniel/nexus-ai.

Usage:
    python push_to_github.py

Reads GITHUB_TOKEN from environment.
Creates the repo if it doesn't exist, then force-pushes the current tree.
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "itkdaniel"
REPO  = "nexus-ai"
API   = "https://api.github.com"


def _token() -> str:
    t = os.environ.get("GITHUB_TOKEN", "")
    if not t:
        sys.exit("GITHUB_TOKEN not set")
    return t


def _req(method: str, path: str, body=None) -> dict:
    token = _token()
    url   = f"{API}{path}"
    data  = json.dumps(body).encode() if body else None
    req   = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"token {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        if e.code == 404:
            return {"_not_found": True}
        if e.code in (409, 422):
            return {"_conflict": True, "_body": body_text}
        print(f"HTTP {e.code}: {body_text}", file=sys.stderr)
        raise


def ensure_repo():
    info = _req("GET", f"/repos/{OWNER}/{REPO}")
    if info.get("_not_found"):
        print(f"Creating repo {OWNER}/{REPO} ...")
        _req("POST", f"/user/repos", {
            "name": REPO,
            "description": "Standalone PyTorch transformer inference service for NexusConsult",
            "private": False,
            "auto_init": False,
        })
        print("Repo created.")
    else:
        print(f"Repo {OWNER}/{REPO} already exists.")


def git(*args, cwd=None):
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"git {' '.join(args)} failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def push():
    root   = Path(__file__).parent
    remote = f"https://{_token()}@github.com/{OWNER}/{REPO}.git"

    git_dir = root / ".git"

    if git_dir.exists():
        print("Git repo already initialized.")
    else:
        print("Initializing git repo ...")
        git("init", cwd=root)
        git("config", "user.email", "ci@nexusconsult.dev", cwd=root)
        git("config", "user.name", "NexusConsult CI", cwd=root)

    git("add", "-A", cwd=root)

    status = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=root,
        capture_output=True,
    )
    if status.returncode == 0:
        print("Nothing to commit — tree is clean.")
    else:
        git("commit", "-m", "feat: initial nexus-ai standalone service", cwd=root)

    remotes = subprocess.run(
        ["git", "remote"],
        cwd=root,
        capture_output=True,
        text=True,
    ).stdout.strip()

    if "origin" in remotes.split():
        git("remote", "set-url", "origin", remote, cwd=root)
    else:
        git("remote", "add", "origin", remote, cwd=root)

    print("Pushing to GitHub ...")
    git("push", "-u", "origin", "HEAD:main", "--force", cwd=root)
    print(f"Done → https://github.com/{OWNER}/{REPO}")


if __name__ == "__main__":
    ensure_repo()
    push()
