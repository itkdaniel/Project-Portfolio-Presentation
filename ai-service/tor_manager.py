"""
Tor network manager for NexusAI service.

Manages a Tor daemon subprocess providing a SOCKS5 proxy at 127.0.0.1:9050.
Uses stem library for circuit monitoring and NEWNYM (new-identity) signaling.

Usage:
    from tor_manager import tor_manager
    await tor_manager.start()
    status = tor_manager.get_status()
    await tor_manager.new_circuit()
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

_TOR_BINARY      = shutil.which("tor") or "/usr/bin/tor"
_SOCKS_PORT      = int(os.getenv("TOR_SOCKS_PORT", "9050"))
_CONTROL_PORT    = int(os.getenv("TOR_CONTROL_PORT", "9051"))
_CONTROL_PASSWORD = os.getenv("TOR_CONTROL_PASSWORD", "nexusai_tor_default")
_DATA_DIR        = os.getenv("TOR_DATA_DIR", "/tmp/tor_data_nexusai")


def _hash_password(plain: str) -> str:
    """Produce a Tor HashedControlPassword value via stem (or fallback)."""
    try:
        from stem.process import get_obfuscated_address  # noqa: F401 — just checking stem is importable
        from stem.control import Controller
        _ = Controller  # silence lint
    except ImportError:
        pass
    try:
        import stem.util.connection
        _ = stem.util.connection
    except Exception:
        pass
    # Use tor --hash-password subprocess to generate the hash
    try:
        result = subprocess.run(
            [_TOR_BINARY, "--hash-password", plain],
            capture_output=True, text=True, timeout=10,
        )
        hashed = result.stdout.strip()
        if hashed.startswith("16:"):
            return hashed
    except Exception:
        pass
    return ""


class TorManager:
    def __init__(self) -> None:
        self._process: Optional[subprocess.Popen] = None
        self._data_dir = Path(_DATA_DIR)
        self._bootstrap_percent: int = 0
        self._circuit_established: bool = False
        self._started: bool = False
        self._start_error: Optional[str] = None
        self._hashed_password: str = ""

    # ── Public API ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the Tor daemon in the background. No-op if already running."""
        if self._started:
            return
        if not _TOR_BINARY or not Path(_TOR_BINARY).exists():
            self._start_error = f"Tor binary not found at {_TOR_BINARY}"
            logger.warning("Tor not available", error=self._start_error)
            return
        try:
            await asyncio.get_event_loop().run_in_executor(None, self._launch)
        except Exception as e:
            self._start_error = str(e)
            logger.error("Tor launch failed", error=str(e))

    def get_status(self) -> dict:
        """Return current Tor status dict."""
        running = self._process is not None and self._process.poll() is None
        if not running and self._started:
            self._circuit_established = False
            self._bootstrap_percent = 0
        return {
            "running": running,
            "circuitEstablished": self._circuit_established,
            "bootstrapPercent": self._bootstrap_percent,
            "socksProxy": f"socks5://127.0.0.1:{_SOCKS_PORT}" if running else None,
            "error": self._start_error,
        }

    async def new_circuit(self) -> bool:
        """Signal Tor to build a fresh circuit (NEWNYM). Returns True on success."""
        try:
            return await asyncio.get_event_loop().run_in_executor(None, self._send_newnym)
        except Exception as e:
            logger.warning("NEWNYM failed", error=str(e))
            return False

    def stop(self) -> None:
        if self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
            self._started = False
            self._circuit_established = False
            self._bootstrap_percent = 0

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _launch(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)

        self._hashed_password = _hash_password(_CONTROL_PASSWORD)

        torrc_lines = [
            f"SocksPort {_SOCKS_PORT}",
            f"ControlPort {_CONTROL_PORT}",
            f"DataDirectory {self._data_dir}",
            "Log notice stdout",
        ]
        if self._hashed_password:
            torrc_lines.append(f"HashedControlPassword {self._hashed_password}")
        else:
            torrc_lines.append("CookieAuthentication 1")

        torrc_path = self._data_dir / "torrc"
        torrc_path.write_text("\n".join(torrc_lines) + "\n")

        self._process = subprocess.Popen(
            [_TOR_BINARY, "-f", str(torrc_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._started = True
        logger.info("Tor process started", pid=self._process.pid)

        # Read bootstrap progress from stdout (up to 30s)
        deadline = time.time() + 30
        while time.time() < deadline and self._process.poll() is None:
            line = self._process.stdout.readline()  # type: ignore[union-attr]
            if not line:
                break
            if "Bootstrapped" in line:
                try:
                    pct = int(line.split("Bootstrapped")[1].split("%")[0].strip())
                    self._bootstrap_percent = pct
                    if pct >= 100:
                        self._circuit_established = True
                        logger.info("Tor bootstrap complete")
                        break
                except (ValueError, IndexError):
                    pass
            elif "100%" in line or "Done" in line:
                self._bootstrap_percent = 100
                self._circuit_established = True
                logger.info("Tor bootstrap complete")
                break

    def _send_newnym(self) -> bool:
        """Authenticate to the Tor control port and send NEWNYM."""
        import socket
        with socket.create_connection(("127.0.0.1", _CONTROL_PORT), timeout=5) as s:
            def send(cmd: str) -> str:
                s.sendall((cmd + "\r\n").encode())
                return s.recv(4096).decode()
            # Authenticate
            resp = send(f'AUTHENTICATE "{_CONTROL_PASSWORD}"')
            if not resp.startswith("250"):
                logger.warning("Tor auth failed", resp=resp)
                return False
            resp = send("SIGNAL NEWNYM")
            ok = resp.startswith("250")
            if ok:
                logger.info("Tor new circuit requested")
            return ok


tor_manager = TorManager()
