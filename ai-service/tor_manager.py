"""
Tor network manager for NexusAI service.

Manages a Tor daemon launched via stem.process.launch_tor_with_config().
Uses the stem library for circuit event monitoring, bootstrap progress,
and NEWNYM (new-identity) signaling via the Tor control port.

Usage:
    from tor_manager import tor_manager
    await tor_manager.start()
    status = tor_manager.get_status()
    await tor_manager.new_circuit()
"""
from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

_TOR_BINARY       = shutil.which("tor") or "/usr/bin/tor"
_SOCKS_PORT       = int(os.getenv("TOR_SOCKS_PORT", "9050"))
_CONTROL_PORT     = int(os.getenv("TOR_CONTROL_PORT", "9051"))
_CONTROL_PASSWORD = os.getenv("TOR_CONTROL_PASSWORD", "nexusai_tor_default")
_DATA_DIR         = os.getenv("TOR_DATA_DIR", "/tmp/tor_data_nexusai")


class TorManager:
    def __init__(self) -> None:
        self._process    = None   # stem process handle
        self._controller = None   # stem.control.Controller
        self._bootstrap_percent: int  = 0
        self._circuit_established: bool = False
        self._started: bool = False
        self._start_error: Optional[str] = None

    # ── Public API ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start Tor via stem.process.launch_tor_with_config(). No-op if already started."""
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
            self._bootstrap_percent   = 0
        return {
            "running":            running,
            "circuitEstablished": self._circuit_established,
            "bootstrapPercent":   self._bootstrap_percent,
            "socksProxy":         f"socks5://127.0.0.1:{_SOCKS_PORT}" if running else None,
            "error":              self._start_error,
        }

    async def new_circuit(self) -> bool:
        """Send NEWNYM via stem controller. Returns True on success."""
        try:
            return await asyncio.get_event_loop().run_in_executor(None, self._send_newnym)
        except Exception as e:
            logger.warning("NEWNYM failed", error=str(e))
            return False

    def stop(self) -> None:
        if self._controller:
            try:
                self._controller.close()
            except Exception:
                pass
            self._controller = None
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        self._started             = False
        self._circuit_established = False
        self._bootstrap_percent   = 0

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _launch(self) -> None:
        """Launch Tor using stem.process.launch_tor_with_config (blocking)."""
        try:
            import stem.process
            import stem.control
            import stem
        except ImportError as e:
            raise RuntimeError(f"stem not installed: {e}")

        data_dir = Path(_DATA_DIR)
        data_dir.mkdir(parents=True, exist_ok=True)

        # stem.process.launch_tor_with_config streams bootstrap events and
        # calls our init_msg_handler with each Tor log line.
        # It blocks until 100% bootstrap or raises an error.
        def _bootstrap_handler(line: str) -> None:
            if "Bootstrapped" in line:
                try:
                    pct = int(line.split("Bootstrapped")[1].split("%")[0].strip())
                    self._bootstrap_percent = pct
                    if pct >= 100:
                        self._circuit_established = True
                        logger.info("Tor bootstrap complete")
                except (ValueError, IndexError):
                    pass

        self._process = stem.process.launch_tor_with_config(
            tor_cmd=_TOR_BINARY,
            config={
                "SocksPort":            str(_SOCKS_PORT),
                "ControlPort":          str(_CONTROL_PORT),
                "DataDirectory":        str(data_dir),
                "CookieAuthentication": "1",
            },
            init_msg_handler=_bootstrap_handler,
            timeout=60,
            take_ownership=True,
        )

        self._started = True
        logger.info("Tor process started via stem", pid=getattr(self._process, "pid", "?"))

        # Connect a persistent stem Controller for NEWNYM signals and circuit events
        try:
            controller = stem.control.Controller.from_port(port=_CONTROL_PORT)
            controller.authenticate()
            controller.add_event_listener(
                lambda event: self._on_circuit_event(event),
                stem.control.EventType.CIRC,
            )
            self._controller = controller
            logger.info("Stem controller connected")
        except Exception as e:
            logger.warning("Stem controller connect failed (NEWNYM unavailable)", error=str(e))

    def _on_circuit_event(self, event) -> None:
        """Update circuit-established flag from stem CIRC events."""
        try:
            from stem import CircStatus
            if event.status == CircStatus.BUILT:
                self._circuit_established = True
        except Exception:
            pass

    def _send_newnym(self) -> bool:
        """Send NEWNYM via stem controller to get a fresh Tor identity."""
        if self._controller is None:
            logger.warning("No stem controller — attempting reconnect for NEWNYM")
            try:
                import stem.control
                ctrl = stem.control.Controller.from_port(port=_CONTROL_PORT)
                ctrl.authenticate()
                self._controller = ctrl
            except Exception as e:
                logger.warning("Reconnect failed", error=str(e))
                return False

        try:
            from stem import Signal
            self._controller.signal(Signal.NEWNYM)
            logger.info("Tor new circuit requested via stem NEWNYM")
            return True
        except Exception as e:
            logger.warning("stem NEWNYM signal failed", error=str(e))
            # Controller may be stale — clear it so next call reconnects
            try:
                self._controller.close()
            except Exception:
                pass
            self._controller = None
            return False


tor_manager = TorManager()
