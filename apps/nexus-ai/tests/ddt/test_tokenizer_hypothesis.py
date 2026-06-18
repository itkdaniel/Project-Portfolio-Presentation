"""
Data-Driven Tests using Hypothesis for BPE tokenizer edge cases.
Tests unicode handling, length constraints, and encoding invariants.
"""
from __future__ import annotations

import pytest
from hypothesis import given, settings, assume, HealthCheck
from hypothesis import strategies as st

from app.model.tokenizer import BPETokenizer, SPECIAL_TOKENS

MINI_CORPUS = [
    "hello world automation consulting microservices docker",
    "machine learning neural network training inference",
    "api rest authentication authorization deployment",
] * 20


@pytest.fixture(scope="module")
def tok():
    t = BPETokenizer(max_vocab=150)
    t.train(MINI_CORPUS, num_merges=20)
    return t


class TestTokenizerHypothesis:

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=0, max_size=200))
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_encode_never_raises_on_ascii_text(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        try:
            result = t.encode(text, max_length=128, padding=False)
            assert isinstance(result["input_ids"], list)
            assert isinstance(result["attention_mask"], list)
        except Exception as exc:
            pytest.fail(f"Unexpected exception for text={text!r}: {exc}")

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=1, max_size=100))
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_ids_and_mask_same_length(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        result = t.encode(text, max_length=64, padding=False)
        assert len(result["input_ids"]) == len(result["attention_mask"])

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=0, max_size=300))
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_max_length_respected(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        max_len = 32
        result  = t.encode(text, max_length=max_len, padding=False)
        assert len(result["input_ids"]) <= max_len

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=1, max_size=100))
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_padding_always_fills_to_max(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        max_len = 64
        result  = t.encode(text, max_length=max_len, padding=True)
        assert len(result["input_ids"]) == max_len
        assert len(result["attention_mask"]) == max_len

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=0, max_size=200))
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_all_ids_in_vocab_range(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        result = t.encode(text, max_length=128, padding=False)
        vocab_size = len(t.vocab)
        for tid in result["input_ids"]:
            assert 0 <= tid < vocab_size, f"id {tid} out of vocab range [0, {vocab_size})"

    @given(st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=1, max_size=50))
    @settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow])
    def test_special_tokens_in_correct_positions(self, text):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        result = t.encode(text, add_special_tokens=True, max_length=128)
        ids = result["input_ids"]
        if len(ids) >= 2:
            assert ids[0]  == SPECIAL_TOKENS["[CLS]"]
            assert ids[-1] == SPECIAL_TOKENS["[SEP]"]

    @given(st.integers(min_value=10, max_value=128))
    @settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow])
    def test_varying_max_lengths_work(self, max_len):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        result = t.encode("machine learning", max_length=max_len, padding=True)
        assert len(result["input_ids"]) == max_len

    @given(st.lists(
        st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll")), min_size=1, max_size=30),
        min_size=1,
        max_size=10,
    ))
    @settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow])
    def test_batch_encode_all_valid(self, texts):
        t = BPETokenizer(max_vocab=150)
        t.train(MINI_CORPUS, num_merges=10)
        for text in texts:
            result = t.encode(text, max_length=32, padding=True)
            assert len(result["input_ids"]) == 32
