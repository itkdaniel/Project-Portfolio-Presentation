import math, uuid

def get_amount_out(amount_in: float, reserve_in: float, reserve_out: float, fee_bps: int = 30) -> float:
    if reserve_in <= 0 or reserve_out <= 0:
        return 0.0
    fee = amount_in * fee_bps / 10_000
    ain_after_fee = amount_in - fee
    return (ain_after_fee * reserve_out) / (reserve_in + ain_after_fee)

def get_price_impact(amount_in: float, reserve_in: float) -> float:
    if reserve_in <= 0:
        return 0.0
    return (amount_in / (reserve_in + amount_in)) * 100

def get_lp_tokens_to_mint(amount_a: float, amount_b: float, reserve_a: float, reserve_b: float, total_lp: float) -> float:
    if total_lp == 0:
        return math.sqrt(amount_a * amount_b)
    if reserve_a <= 0 or reserve_b <= 0:
        return 0.0
    return min((amount_a / reserve_a) * total_lp, (amount_b / reserve_b) * total_lp)

def make_tx_hash() -> str:
    return "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:24]
