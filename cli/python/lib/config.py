"""
CLI configuration management.
Reads from (priority order):
  1. Environment variables  (NEXUS_API_URL, NEXUS_TOKEN, NEXUS_ROLE_ID)
  2. Config file            (~/.nexus/config.json)
  3. Defaults               (http://localhost:5000)
"""

import json
import os
from pathlib import Path
from typing import Optional

CONFIG_DIR  = Path.home() / ".nexus"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "api_url":  "http://localhost:5000",
    "token":    None,
    "role_id":  1,
    "username": None,
}


def _load_file() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            return {}
    return {}


def get(key: str) -> Optional[str]:
    env_map = {
        "api_url":  "NEXUS_API_URL",
        "token":    "NEXUS_TOKEN",
        "role_id":  "NEXUS_ROLE_ID",
        "username": "NEXUS_USERNAME",
    }
    if key in env_map and os.environ.get(env_map[key]):
        return os.environ[env_map[key]]
    file_cfg = _load_file()
    return file_cfg.get(key, DEFAULTS.get(key))


def api_url() -> str:
    return get("api_url") or DEFAULTS["api_url"]


def token() -> Optional[str]:
    return get("token")


def role_id() -> int:
    val = get("role_id")
    try:
        return int(val)
    except (TypeError, ValueError):
        return 1


def save(updates: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    cfg = _load_file()
    cfg.update(updates)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    CONFIG_FILE.chmod(0o600)


def clear() -> None:
    if CONFIG_FILE.exists():
        cfg = _load_file()
        cfg.pop("token", None)
        cfg.pop("username", None)
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
