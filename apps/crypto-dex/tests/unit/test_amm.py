import pytest
from app.amm import get_amount_out, get_price_impact, get_lp_tokens_to_mint

def test_get_amount_out():
    # Constant product formula: (x + delta_x)(y - delta_y) = xy
    # delta_y = y - xy / (x + delta_x) = (y(x + delta_x) - xy) / (x + delta_x) = y*delta_x / (x + delta_x)
    # With fee: delta_y = y * (delta_x * (1 - fee)) / (x + delta_x * (1 - fee))
    
    reserve_in = 100.0
    reserve_out = 1000.0
    amount_in = 10.0
    fee_bps = 0 # No fee for simple check
    
    expected_out = (amount_in * reserve_out) / (reserve_in + amount_in)
    actual_out = get_amount_out(amount_in, reserve_in, reserve_out, fee_bps)
    assert actual_out == expected_out
    
    # With fee
    fee_bps = 30 # 0.3%
    fee = 10.0 * 30 / 10000 # 0.03
    ain_after_fee = 10.0 - 0.03 # 9.97
    expected_out_fee = (ain_after_fee * reserve_out) / (reserve_in + ain_after_fee)
    actual_out_fee = get_amount_out(amount_in, reserve_in, reserve_out, fee_bps)
    assert actual_out_fee == expected_out_fee

def test_get_price_impact():
    reserve_in = 100.0
    amount_in = 10.0
    # Price impact = delta_x / (x + delta_x)
    expected_impact = (amount_in / (reserve_in + amount_in)) * 100
    actual_impact = get_price_impact(amount_in, reserve_in)
    assert actual_impact == expected_impact

def test_get_lp_tokens_to_mint():
    # First liquidity
    amount_a = 10.0
    amount_b = 100.0
    reserve_a = 0.0
    reserve_b = 0.0
    total_lp = 0.0
    
    actual_lp = get_lp_tokens_to_mint(amount_a, amount_b, reserve_a, reserve_b, total_lp)
    assert actual_lp == 31.622776601683793 # sqrt(1000)
    
    # Subsequent liquidity
    reserve_a = 10.0
    reserve_b = 100.0
    total_lp = 31.622776601683793
    amount_a = 5.0
    amount_b = 50.0
    
    actual_lp_sub = get_lp_tokens_to_mint(amount_a, amount_b, reserve_a, reserve_b, total_lp)
    assert actual_lp_sub == (amount_a / reserve_a) * total_lp

def test_zero_reserves():
    assert get_amount_out(10, 0, 100) == 0.0
    assert get_amount_out(10, 100, 0) == 0.0
    assert get_price_impact(10, 0) == 0.0
    assert get_lp_tokens_to_mint(10, 10, 0, 10, 100) == 0.0
