"""
Unit tests for portfolio analytics engine and snapshot API.
"""
from __future__ import annotations

import math
import pytest

from app.engine import (
    calc_max_drawdown,
    calc_portfolio_return,
    calc_returns,
    calc_sharpe,
    calc_volatility,
    compute_snapshot_metrics,
)


# ── calc_returns ──────────────────────────────────────────────────────────────

def test_calc_returns_basic():
    values = [100, 110, 121]
    rets = calc_returns(values)
    assert len(rets) == 2
    assert abs(rets[0] - 0.10) < 1e-9
    assert abs(rets[1] - 0.10) < 1e-9


def test_calc_returns_empty():
    assert calc_returns([]) == []
    assert calc_returns([100]) == []


def test_calc_returns_decline():
    rets = calc_returns([100, 90, 81])
    assert all(r < 0 for r in rets)
    assert abs(rets[0] - (-0.10)) < 1e-9


# ── calc_sharpe ───────────────────────────────────────────────────────────────

def test_calc_sharpe_positive():
    values = [100 * (1.001 ** i) for i in range(60)]
    rets = calc_returns(values)
    sharpe = calc_sharpe(rets)
    assert sharpe > 0


def test_calc_sharpe_too_few():
    assert calc_sharpe([0.01]) == 0.0
    assert calc_sharpe([]) == 0.0


def test_calc_sharpe_zero_std():
    rets = [0.0001] * 10
    result = calc_sharpe(rets)
    assert result == 0.0


# ── calc_max_drawdown ─────────────────────────────────────────────────────────

def test_calc_max_drawdown_basic():
    values = [100, 120, 80, 90, 110]
    dd = calc_max_drawdown(values)
    # Peak is 120, min after is 80 → drawdown = (80-120)/120 = -33.33%
    assert abs(dd - (-33.333)) < 0.01


def test_calc_max_drawdown_monotone_up():
    values = [100, 110, 120, 130]
    assert calc_max_drawdown(values) == 0.0


def test_calc_max_drawdown_too_short():
    assert calc_max_drawdown([100]) == 0.0
    assert calc_max_drawdown([]) == 0.0


# ── calc_volatility ───────────────────────────────────────────────────────────

def test_calc_volatility_basic():
    rets = [0.01, -0.01, 0.02, -0.005, 0.015] * 6
    vol = calc_volatility(rets)
    assert vol > 0
    assert vol < 200  # realistic annualised % range


def test_calc_volatility_too_few():
    assert calc_volatility([0.01]) == 0.0
    assert calc_volatility([]) == 0.0


# ── calc_portfolio_return ──────────────────────────────────────────────────────

def test_calc_portfolio_return_positive():
    assert abs(calc_portfolio_return(100, 120) - 20.0) < 1e-9


def test_calc_portfolio_return_negative():
    assert abs(calc_portfolio_return(100, 80) - (-20.0)) < 1e-9


def test_calc_portfolio_return_zero_cost():
    assert calc_portfolio_return(0, 100) == 0.0


# ── compute_snapshot_metrics ─────────────────────────────────────────────────

def test_compute_snapshot_metrics_returns_dict():
    values = [100 * (1 + 0.001 * (i % 10 - 5)) for i in range(60)]
    result = compute_snapshot_metrics(values)
    assert "sharpe_ratio" in result
    assert "max_drawdown_pct" in result
    assert "volatility_30d_pct" in result
    assert "total_return_pct" in result


def test_compute_snapshot_metrics_single_value():
    result = compute_snapshot_metrics([100])
    assert result["sharpe_ratio"] == 0.0
    assert result["max_drawdown_pct"] == 0.0
