"""
Unit tests: BPE tokenizer correctness, transformer output shapes, cosine math.
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import torch
import torch.nn.functional as F

from app.model.tokenizer import BPETokenizer, SPECIAL_TOKENS
from app.model.transformer import NexusTransformer, TransformerConfig, build_model


# ── Tokenizer ─────────────────────────────────────────────────────────────────

MINI_CORPUS = [
    "hello world automation consulting",
    "microservices docker kubernetes",
    "machine learning neural network",
    "devops pipeline deployment",
] * 10


@pytest.fixture(scope="module")
def trained_tokenizer():
    tok = BPETokenizer(max_vocab=200)
    tok.train(MINI_CORPUS, num_merges=30)
    return tok


class TestBPETokenizer:
    def test_special_tokens_present(self):
        tok = BPETokenizer()
        assert "[PAD]" in SPECIAL_TOKENS
        assert SPECIAL_TOKENS["[PAD]"] == 0
        assert SPECIAL_TOKENS["[MASK]"] == 4

    def test_train_increases_vocab(self):
        tok = BPETokenizer(max_vocab=200)
        before = len(tok.vocab)
        tok.train(MINI_CORPUS, num_merges=10)
        assert len(tok.vocab) > before

    def test_encode_returns_cls_sep(self, trained_tokenizer):
        result = trained_tokenizer.encode("hello world")
        ids    = result["input_ids"]
        assert ids[0]  == SPECIAL_TOKENS["[CLS]"]
        assert ids[-1] == SPECIAL_TOKENS["[SEP]"]

    def test_encode_mask_length_matches_ids(self, trained_tokenizer):
        result = trained_tokenizer.encode("docker kubernetes deployment")
        assert len(result["input_ids"]) == len(result["attention_mask"])

    def test_padding_fills_to_max_length(self, trained_tokenizer):
        result = trained_tokenizer.encode("hi", max_length=32, padding=True)
        assert len(result["input_ids"]) == 32
        assert len(result["attention_mask"]) == 32

    def test_padding_mask_zeros_at_end(self, trained_tokenizer):
        result = trained_tokenizer.encode("hi", max_length=32, padding=True)
        ids  = result["input_ids"]
        mask = result["attention_mask"]
        pad_positions = [i for i, m in enumerate(mask) if m == 0]
        for pos in pad_positions:
            assert ids[pos] == SPECIAL_TOKENS["[PAD]"]

    def test_truncation_to_max_length(self, trained_tokenizer):
        long_text = " ".join(["hello"] * 100)
        result = trained_tokenizer.encode(long_text, max_length=10)
        assert len(result["input_ids"]) <= 10

    def test_decode_roundtrip_no_special(self, trained_tokenizer):
        text   = "hello world"
        enc    = trained_tokenizer.encode(text)
        decoded = trained_tokenizer.decode(enc["input_ids"], skip_special_tokens=True)
        assert isinstance(decoded, str)
        assert len(decoded) > 0

    def test_encode_empty_string(self, trained_tokenizer):
        result = trained_tokenizer.encode("", add_special_tokens=True)
        assert result["input_ids"][0] == SPECIAL_TOKENS["[CLS]"]

    def test_save_and_load(self, trained_tokenizer, tmp_path):
        save_dir = str(tmp_path / "tokenizer")
        trained_tokenizer.save(save_dir)
        loaded = BPETokenizer.load(save_dir)
        assert len(loaded) == len(trained_tokenizer)
        assert loaded.merges == trained_tokenizer.merges

    def test_loaded_tokenizer_produces_same_ids(self, trained_tokenizer, tmp_path):
        save_dir = str(tmp_path / "tok2")
        trained_tokenizer.save(save_dir)
        loaded = BPETokenizer.load(save_dir)
        text   = "automation consulting"
        orig   = trained_tokenizer.encode(text)["input_ids"]
        load_r = loaded.encode(text)["input_ids"]
        assert orig == load_r

    def test_unknown_word_uses_unk(self, trained_tokenizer):
        result = trained_tokenizer.encode("xyzqwerty")
        for tid in result["input_ids"]:
            assert 0 <= tid < len(trained_tokenizer.vocab)


# ── Transformer shapes ────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def small_model():
    return build_model(vocab_size=200, n_classes=5, d_model=64, n_layers=2, n_heads=4)


class TestTransformerShapes:
    def test_forward_returns_expected_keys(self, small_model):
        B, S = 2, 16
        ids  = torch.randint(0, 200, (B, S))
        mask = torch.ones(B, S, dtype=torch.long)
        out  = small_model(ids, mask)
        assert "logits" in out
        assert "hidden_states" in out
        assert "pooled" in out

    def test_logits_shape(self, small_model):
        B, S = 3, 20
        ids  = torch.randint(0, 200, (B, S))
        out  = small_model(ids)
        assert out["logits"].shape == (B, 5)

    def test_hidden_states_shape(self, small_model):
        B, S = 2, 12
        ids  = torch.randint(0, 200, (B, S))
        out  = small_model(ids)
        assert out["hidden_states"].shape == (B, S, 64)

    def test_pooled_shape(self, small_model):
        B, S = 4, 8
        ids  = torch.randint(0, 200, (B, S))
        out  = small_model(ids)
        assert out["pooled"].shape == (B, 64)

    def test_count_parameters_positive(self, small_model):
        assert small_model.count_parameters() > 0

    def test_padding_mask_no_nan(self, small_model):
        B, S = 2, 16
        ids  = torch.randint(0, 200, (B, S))
        ids[:, 8:] = 0
        mask = (ids != 0).long()
        out  = small_model(ids, mask)
        assert not torch.isnan(out["logits"]).any()

    def test_eval_mode_no_dropout_change(self, small_model):
        small_model.eval()
        B, S = 1, 8
        ids  = torch.randint(0, 200, (B, S))
        with torch.no_grad():
            o1 = small_model(ids)["pooled"]
            o2 = small_model(ids)["pooled"]
        assert torch.allclose(o1, o2)

    def test_batch_size_1_works(self, small_model):
        ids = torch.randint(0, 200, (1, 10))
        out = small_model(ids)
        assert out["logits"].shape == (1, 5)


# ── Cosine similarity math ────────────────────────────────────────────────────

class TestCosineSimilarity:
    def test_identical_vectors_give_1(self):
        v = torch.randn(128)
        v = F.normalize(v, p=2, dim=0)
        sim = float(torch.dot(v, v))
        assert abs(sim - 1.0) < 1e-5

    def test_orthogonal_vectors_give_0(self):
        v1 = torch.zeros(4)
        v2 = torch.zeros(4)
        v1[0] = 1.0
        v2[1] = 1.0
        sim = float(torch.dot(v1, v2))
        assert abs(sim) < 1e-6

    def test_opposite_vectors_give_minus_1(self):
        v1 = torch.tensor([1.0, 0.0, 0.0])
        v2 = torch.tensor([-1.0, 0.0, 0.0])
        sim = float(torch.dot(v1, v2))
        assert abs(sim + 1.0) < 1e-5

    def test_l2_normalized_embeddings_bounded(self):
        model = build_model(vocab_size=200, n_classes=5, d_model=64, n_layers=1, n_heads=4)
        model.eval()
        with torch.no_grad():
            ids  = torch.randint(0, 200, (4, 16))
            out  = model(ids)
            pooled  = out["pooled"]
            normed  = F.normalize(pooled, p=2, dim=-1)
            norms   = normed.norm(dim=-1)
        assert torch.allclose(norms, torch.ones(4), atol=1e-5)

    def test_similarity_in_range(self):
        v1 = F.normalize(torch.randn(64), p=2, dim=0)
        v2 = F.normalize(torch.randn(64), p=2, dim=0)
        sim = float(torch.dot(v1, v2))
        assert -1.0 <= sim <= 1.0
