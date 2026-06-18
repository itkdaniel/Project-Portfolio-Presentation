"""
Transformer architecture — built from scratch using PyTorch primitives.

Architecture: Encoder-only transformer (BERT-style)
  - Token + positional embeddings
  - N stacked encoder blocks
    - Multi-Head Self-Attention (MHSA)
    - Feed-Forward Network (FFN) with GELU activation
    - Pre-LayerNorm (more stable than post-LN)
    - Residual connections
  - Pooler for sequence-level classification

Design decisions:
  - Pre-LayerNorm: better gradient flow (no warm-up tricks needed)
  - Scaled dot-product attention: Q·K^T / sqrt(d_k) prevents softmax saturation
  - GELU activation: smoother than ReLU, standard in BERT/GPT
  - Sinusoidal positional encoding: no learned parameters, generalizes to longer seqs

References:
  - Attention Is All You Need (Vaswani et al., 2017)
  - BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)
"""
from __future__ import annotations
import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from dataclasses import dataclass
from typing import Optional


@dataclass
class TransformerConfig:
    vocab_size:    int   = 8000
    max_seq_len:   int   = 512
    d_model:       int   = 256
    n_heads:       int   = 8
    n_layers:      int   = 4
    d_ff:          int   = 1024
    dropout:       float = 0.1
    pad_token_id:  int   = 0
    n_classes:     int   = 5


class SinusoidalPositionalEncoding(nn.Module):
    """
    Injects position information via fixed sin/cos functions.

    PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
    PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
    """
    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        pe = pe.unsqueeze(0)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.pe[:, :x.size(1)]
        return self.dropout(x)


class MultiHeadSelfAttention(nn.Module):
    """
    Scaled dot-product attention with multiple parallel heads.

    Complexity: O(seq_len^2 × d_model) — quadratic in sequence length.
    """
    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"

        self.n_heads = n_heads
        self.d_k     = d_model // n_heads

        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)
        self.dropout  = nn.Dropout(dropout)
        self.scale    = math.sqrt(self.d_k)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        B, S, D = x.shape

        qkv = self.qkv_proj(x)
        qkv = qkv.reshape(B, S, 3, self.n_heads, self.d_k)
        qkv = qkv.permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]

        attn = torch.matmul(q, k.transpose(-2, -1)) / self.scale
        if mask is not None:
            attn = attn.masked_fill(mask, float("-inf"))
        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)

        out = torch.matmul(attn, v)
        out = out.transpose(1, 2).reshape(B, S, D)
        return self.out_proj(out)


class FeedForward(nn.Module):
    """FFN(x) = GELU(xW_1 + b_1)W_2 + b_2"""
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.fc1     = nn.Linear(d_model, d_ff)
        self.fc2     = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc2(self.dropout(F.gelu(self.fc1(x))))


class EncoderBlock(nn.Module):
    """Single transformer encoder block with Pre-LayerNorm."""
    def __init__(self, config: TransformerConfig):
        super().__init__()
        self.attn    = MultiHeadSelfAttention(config.d_model, config.n_heads, config.dropout)
        self.ffn     = FeedForward(config.d_model, config.d_ff, config.dropout)
        self.ln1     = nn.LayerNorm(config.d_model)
        self.ln2     = nn.LayerNorm(config.d_model)
        self.dropout = nn.Dropout(config.dropout)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        x = x + self.dropout(self.ffn(self.ln2(x)))
        return x


class TransformerEncoder(nn.Module):
    """Full encoder stack: token embeddings → positional encoding → N × EncoderBlock."""
    def __init__(self, config: TransformerConfig):
        super().__init__()
        self.config      = config
        self.token_emb   = nn.Embedding(config.vocab_size, config.d_model, padding_idx=config.pad_token_id)
        self.pos_enc     = SinusoidalPositionalEncoding(config.d_model, config.max_seq_len, config.dropout)
        self.blocks      = nn.ModuleList([EncoderBlock(config) for _ in range(config.n_layers)])
        self.final_norm  = nn.LayerNorm(config.d_model)
        self._init_weights()

    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def _make_padding_mask(self, input_ids: torch.Tensor) -> torch.Tensor:
        return (input_ids == self.config.pad_token_id).unsqueeze(1).unsqueeze(2)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        mask = None
        if attention_mask is not None:
            mask = (attention_mask == 0).unsqueeze(1).unsqueeze(2)
        else:
            mask = self._make_padding_mask(input_ids)

        x = self.token_emb(input_ids)
        x = self.pos_enc(x)

        for block in self.blocks:
            x = block(x, mask)

        return self.final_norm(x)


class NexusTransformer(nn.Module):
    """
    Complete model for sequence classification.
    Pooling strategy: [CLS] token (index 0) represents the whole sequence.
    """
    def __init__(self, config: TransformerConfig):
        super().__init__()
        self.config  = config
        self.encoder = TransformerEncoder(config)
        self.pooler  = nn.Sequential(
            nn.Linear(config.d_model, config.d_model),
            nn.Tanh(),
        )
        self.classifier = nn.Sequential(
            nn.Dropout(config.dropout),
            nn.Linear(config.d_model, config.n_classes),
        )

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> dict:
        hidden_states = self.encoder(input_ids, attention_mask)
        cls_token     = hidden_states[:, 0, :]
        pooled        = self.pooler(cls_token)
        logits        = self.classifier(pooled)

        return {
            "logits":        logits,
            "hidden_states": hidden_states,
            "pooled":        pooled,
        }

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def build_model(
    vocab_size: int  = 8000,
    n_classes: int   = 5,
    d_model: int     = 256,
    n_layers: int    = 4,
    n_heads: int     = 8,
) -> NexusTransformer:
    config = TransformerConfig(
        vocab_size=vocab_size,
        n_classes=n_classes,
        d_model=d_model,
        n_layers=n_layers,
        n_heads=n_heads,
    )
    return NexusTransformer(config)
