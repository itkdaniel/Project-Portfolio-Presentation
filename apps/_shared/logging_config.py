"""
Shared color-coded structured logging for all NexusConsult sub-apps.

Usage:
    from nexus_shared.logging_config import configure_logging, get_logger

    configure_logging("nexus-myservice")          # console only
    configure_logging("nexus-myservice",
                      log_file="logs/myservice.jsonl")  # + JSON file

    log = get_logger("nexus-myservice")
    log.info("Server started", port=8300, debug=False)
    log.warning("Rate limit hit", client_ip="1.2.3.4", endpoint="/v1/foo")
    log.error("DB connection failed", exc_info=True)

Output levels → console colours:
    DEBUG    → dim cyan
    INFO     → bright green
    WARNING  → bright yellow
    ERROR    → bright red
    CRITICAL → bright magenta + bold

All messages also carry: timestamp (ISO-8601), service name, level, and any
keyword arguments passed at the call site.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
import sys
from pathlib import Path
from typing import Any, Optional

import structlog

# ── ANSI colour constants ─────────────────────────────────────────────────────

_RESET = "\033[0m"
_COLOURS: dict[str, str] = {
    "debug":    "\033[36m",         # cyan
    "info":     "\033[32;1m",       # bright green
    "warning":  "\033[33;1m",       # bright yellow
    "error":    "\033[31;1m",       # bright red
    "critical": "\033[35;1m",       # bright magenta
}
_LEVEL_BADGES: dict[str, str] = {
    "debug":    " DBG ",
    "info":     " INF ",
    "warning":  " WRN ",
    "error":    " ERR ",
    "critical": " CRT ",
}


# ── Custom colour processor ───────────────────────────────────────────────────

def _colour_level(logger: Any, method: str, event_dict: dict) -> dict:  # noqa: ANN001
    """Inject ANSI colour codes around the log level badge."""
    level = event_dict.get("level", method).lower()
    colour = _COLOURS.get(level, "")
    badge = _LEVEL_BADGES.get(level, f" {level.upper()[:3]} ")
    event_dict["level"] = f"{colour}{badge}{_RESET}"
    return event_dict


def _service_stamp(service: str):
    """Inject the service name into every log record."""
    def processor(logger: Any, method: str, event_dict: dict) -> dict:  # noqa: ANN001
        event_dict.setdefault("svc", service)
        return event_dict
    return processor


# ── File JSON handler ─────────────────────────────────────────────────────────

class _JsonFileHandler(logging.StreamHandler):
    """
    Writes one JSON object per line to a log file.
    Used as a structlog foreign-pre-chain sink via stdlib integration.
    """

    def emit(self, record: logging.LogRecord) -> None:  # noqa: D102
        try:
            if hasattr(record, "_structured"):
                line = json.dumps(record._structured, ensure_ascii=False)
            else:
                line = json.dumps(
                    {
                        "ts": record.created,
                        "level": record.levelname,
                        "event": record.getMessage(),
                        "logger": record.name,
                    },
                    ensure_ascii=False,
                )
            self.stream.write(line + "\n")
            self.flush()
        except Exception:  # noqa: BLE001
            self.handleError(record)


# ── Public API ────────────────────────────────────────────────────────────────

def configure_logging(
    service: str,
    *,
    level: str = "INFO",
    log_file: Optional[str] = None,
    force: bool = False,
) -> None:
    """
    Configure structlog with:
    - Color-coded ConsoleRenderer on stdout.
    - Optional JSON-lines file output (rotated at 10 MB, 5 backups).

    Call once at application startup.  Subsequent calls are no-ops unless
    ``force=True``.

    Args:
        service:  Service name embedded in every log record (e.g. "nexus-analytics").
        level:    Minimum log level string (default "INFO").  Set to "DEBUG"
                  for verbose output.  Can also be set via LOG_LEVEL env var.
        log_file: Path to the JSON log file.  Created (with parent dirs) if
                  absent.  Pass None to disable file logging.
        force:    Re-configure even if already configured (useful in tests).
    """
    effective_level = os.environ.get("LOG_LEVEL", level).upper()
    numeric_level = getattr(logging, effective_level, logging.INFO)

    # ── stdlib root logger ────────────────────────────────────────────────────
    root = logging.getLogger()
    if root.handlers and not force:
        return  # already configured
    for h in root.handlers[:]:
        root.removeHandler(h)
    root.setLevel(numeric_level)

    # ── Stdout (colour) ───────────────────────────────────────────────────────
    _stdout_handler = logging.StreamHandler(sys.stdout)
    _stdout_handler.setLevel(numeric_level)
    root.addHandler(_stdout_handler)

    # ── File (JSON-lines, rotating) ───────────────────────────────────────────
    _file_handler: Optional[logging.Handler] = None
    if log_file:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        _file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding="utf-8",
        )
        _file_handler.setLevel(numeric_level)
        root.addHandler(_file_handler)

    # ── Shared processors ─────────────────────────────────────────────────────
    shared_processors: list = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _service_stamp(service),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
    ]

    # ── structlog core ────────────────────────────────────────────────────────
    structlog.configure(
        processors=shared_processors
        + [
            _colour_level,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # ── Console formatter (colour) ────────────────────────────────────────────
    console_formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.dev.ConsoleRenderer(
            colors=True,
            exception_formatter=structlog.dev.plain_traceback,
        ),
        foreign_pre_chain=shared_processors,
    )
    _stdout_handler.setFormatter(console_formatter)

    # ── File formatter (JSON) ─────────────────────────────────────────────────
    if _file_handler:
        json_formatter = structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=shared_processors,
        )
        _file_handler.setFormatter(json_formatter)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a named structlog logger.

    The returned logger emits colour-coded lines to stdout and JSON to the
    file configured by ``configure_logging()``.

    Args:
        name: Logger name (usually the module or service name).
    """
    return structlog.get_logger(name)
