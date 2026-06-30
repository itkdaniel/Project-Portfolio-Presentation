"""
Analytics computation engine for crypto-analytics.

Pure-Python financial math — no external dependencies required.
All functions operate on plain Python lists; no numpy/pandas.
"""
from __future__ import annotations

import math
import statistics


def calc_returns(values: list[float]) -> list[float]:
    """Compute period-over-period returns from a list of portfolio values."""
    if len(values) < 2:
        return []
    return [
        (values[i] - values[i - 1]) / values[i - 1]
        for i in range(1, len(values))
        if values[i - 1] != 0
    ]


def calc_sharpe(
    returns: list[float],
    risk_free_rate: float = 0.05,
    periods_per_year: int = 365,
) -> float:
    """
    Annualised Sharpe ratio.
    risk_free_rate: annual rate (e.g. 0.05 = 5%)
    periods_per_year: 365 for daily data, 52 for weekly, etc.
    """
    if len(returns) < 2:
        return 0.0
    mean = statistics.mean(returns)
    std = statistics.stdev(returns)
    if std == 0:
        return 0.0
    daily_rf = risk_free_rate / periods_per_year
    return ((mean - daily_rf) / std) * math.sqrt(periods_per_year)


def calc_max_drawdown(values: list[float]) -> float:
    """
    Maximum drawdown as a percentage (returns a negative number, e.g. -15.3).
    """
    if len(values) < 2:
        return 0.0
    peak = values[0]
    max_dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (v - peak) / peak
            if dd < max_dd:
                max_dd = dd
    return max_dd * 100.0


def calc_volatility(
    returns: list[float],
    periods_per_year: int = 365,
) -> float:
    """
    Annualised volatility as a percentage.
    """
    if len(returns) < 2:
        return 0.0
    return statistics.stdev(returns) * math.sqrt(periods_per_year) * 100.0


def calc_portfolio_return(cost_basis: float, current_value: float) -> float:
    """
    Simple total return percentage: (value - cost) / cost * 100.
    Returns 0.0 if cost_basis is zero.
    """
    if cost_basis <= 0:
        return 0.0
    return (current_value - cost_basis) / cost_basis * 100.0


def compute_snapshot_metrics(
    values: list[float],
    cost_basis_series: list[float] | None = None,
) -> dict:
    """
    Compute all metrics from a timeseries of portfolio values.
    Returns dict with sharpe, max_drawdown_pct, volatility_30d_pct, total_return_pct.
    """
    returns = calc_returns(values)
    last_30 = returns[-30:] if len(returns) >= 30 else returns
    return {
        "sharpe_ratio": round(calc_sharpe(returns), 4),
        "max_drawdown_pct": round(calc_max_drawdown(values), 4),
        "volatility_30d_pct": round(calc_volatility(last_30), 4),
        "total_return_pct": round(
            calc_portfolio_return(
                cost_basis_series[0] if cost_basis_series else (values[0] if values else 0),
                values[-1] if values else 0,
            ),
            4,
        ),
    }
