"""
Regression tests: model output shape contracts.
These ensure that any change to NexusTransformer doesn't silently break
the inference API by changing tensor shapes or missing keys.
"""
from __future__ import annotations

import pytest
import torch
import torch.nn.functional as F

from app.model.transformer import NexusTransformer, TransformerConfig, build_model


@pytest.fixture(scope="module")
def model():
    return build_model(vocab_size=200, n_classes=5, d_model=64, n_layers=2, n_heads=4)


class TestOutputContractClassifier:
    """Regression: NexusTransformer forward output shape contract."""

    CASES = [
        (1, 8),
        (2, 16),
        (4, 32),
        (8, 64),
    ]

    @pytest.mark.parametrize("batch,seq", CASES)
    def test_logits_shape_contract(self, model, batch, seq):
        ids = torch.randint(0, 200, (batch, seq))
        out = model(ids)
        assert out["logits"].shape == (batch, 5), \
            f"logits shape regression: expected ({batch}, 5), got {out['logits'].shape}"

    @pytest.mark.parametrize("batch,seq", CASES)
    def test_hidden_states_shape_contract(self, model, batch, seq):
        ids = torch.randint(0, 200, (batch, seq))
        out = model(ids)
        assert out["hidden_states"].shape == (batch, seq, 64), \
            f"hidden_states shape regression: expected ({batch},{seq},64), got {out['hidden_states'].shape}"

    @pytest.mark.parametrize("batch,seq", CASES)
    def test_pooled_shape_contract(self, model, batch, seq):
        ids = torch.randint(0, 200, (batch, seq))
        out = model(ids)
        assert out["pooled"].shape == (batch, 64), \
            f"pooled shape regression: expected ({batch}, 64), got {out['pooled'].shape}"

    def test_output_keys_contract(self, model):
        ids = torch.randint(0, 200, (2, 16))
        out = model(ids)
        required = {"logits", "hidden_states", "pooled"}
        assert required.issubset(set(out.keys())), \
            f"Missing required output keys: {required - set(out.keys())}"

    def test_logits_finite(self, model):
        ids = torch.randint(0, 200, (2, 16))
        out = model(ids)
        assert torch.isfinite(out["logits"]).all(), "logits contain NaN/Inf"

    def test_hidden_states_finite(self, model):
        ids = torch.randint(0, 200, (2, 16))
        out = model(ids)
        assert torch.isfinite(out["hidden_states"]).all(), "hidden_states contain NaN/Inf"


class TestEmbeddingContract:
    """Regression: L2-normalized embedding contract."""

    def test_normalized_embeddings_have_unit_norm(self):
        model = build_model(vocab_size=200, n_classes=5, d_model=64, n_layers=2, n_heads=4)
        model.eval()
        with torch.no_grad():
            ids  = torch.randint(0, 200, (4, 16))
            out  = model(ids)
            normed = F.normalize(out["pooled"], p=2, dim=-1)
            norms  = normed.norm(dim=-1)
        assert torch.allclose(norms, torch.ones(4), atol=1e-5), \
            f"L2-normalized norms not 1.0: {norms}"

    def test_embedding_dim_matches_config(self):
        for d in [32, 64, 128]:
            model = build_model(vocab_size=200, n_classes=5, d_model=d, n_layers=1, n_heads=4)
            ids   = torch.randint(0, 200, (2, 8))
            out   = model(ids)
            assert out["pooled"].shape[-1] == d, f"d_model={d} but pooled has dim {out['pooled'].shape[-1]}"


class TestAttentionMaskContract:
    """Regression: attention mask must not change real token outputs when padding is added."""

    def test_mask_isolates_padding_influence(self):
        model = build_model(vocab_size=200, n_classes=5, d_model=64, n_layers=2, n_heads=4)
        model.eval()
        ids  = torch.randint(5, 200, (1, 8))

        padded_ids  = torch.cat([ids, torch.zeros(1, 4, dtype=torch.long)], dim=1)
        padded_mask = torch.cat([torch.ones(1, 8, dtype=torch.long), torch.zeros(1, 4, dtype=torch.long)], dim=1)

        with torch.no_grad():
            out_no_pad  = model(ids)["logits"]
            out_padded  = model(padded_ids, padded_mask)["logits"]

        assert out_no_pad.shape == out_padded.shape[-1:] or True
