"""
NexusML Transformer — Pre-Layer Norm BERT-style encoder built from scratch.
No HuggingFace dependencies. Pure PyTorch.
"""

from __future__ import annotations

import math
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


class SinusoidalPositionalEncoding(nn.Module):
    """Fixed sinusoidal positional encodings (Vaswani et al., 2017)."""

    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1) -> None:
        super().__init__()
        self.dropout = nn.Dropout(dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))  # (1, max_len, d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, d_model)
        x = x + self.pe[:, : x.size(1)]
        return self.dropout(x)


class MultiHeadSelfAttention(nn.Module):
    """
    Multi-head self-attention with optional causal mask.
    Implements scaled dot-product attention.
    """

    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1) -> None:
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"
        self.d_k     = d_model // n_heads
        self.n_heads = n_heads

        self.qkv  = nn.Linear(d_model, 3 * d_model, bias=True)
        self.proj = nn.Linear(d_model, d_model, bias=True)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        B, T, C = x.shape
        # Compute Q, K, V
        qkv = self.qkv(x)                          # (B, T, 3*C)
        qkv = qkv.reshape(B, T, 3, self.n_heads, self.d_k)
        q, k, v = qkv.unbind(dim=2)               # each: (B, T, H, d_k)

        # Transpose to (B, H, T, d_k)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)

        # Scaled dot-product attention
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)  # (B, H, T, T)
        if mask is not None:
            # mask shape: (B, 1, 1, T) — True where padding
            scores = scores.masked_fill(mask, float("-inf"))

        attn = self.dropout(F.softmax(scores, dim=-1))
        out  = attn @ v                            # (B, H, T, d_k)

        # Merge heads
        out = out.transpose(1, 2).contiguous().reshape(B, T, C)
        return self.proj(out)


class FeedForward(nn.Module):
    """Position-wise FFN: Linear → GELU → Dropout → Linear."""

    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class EncoderBlock(nn.Module):
    """
    Pre-LN Transformer encoder block:
        x = x + MHSA(LayerNorm(x))
        x = x + FFN(LayerNorm(x))
    """

    def __init__(
        self,
        d_model:  int,
        n_heads:  int,
        d_ff:     int,
        dropout:  float = 0.1,
    ) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.attn  = MultiHeadSelfAttention(d_model, n_heads, dropout)
        self.ff    = FeedForward(d_model, d_ff, dropout)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        x = x + self.attn(self.norm1(x), mask)
        x = x + self.ff(self.norm2(x))
        return x


class NexusTransformer(nn.Module):
    """
    Full encoder-only transformer (BERT-style, Pre-LN).

    Args:
        vocab_size:    Size of the token vocabulary
        d_model:       Hidden dimension (default: 768)
        n_heads:       Number of attention heads (default: 8)
        n_layers:      Number of encoder layers (default: 4)
        d_ff:          FFN intermediate dimension (default: 3072)
        max_seq_len:   Maximum sequence length (default: 512)
        dropout:       Dropout rate (default: 0.1)
        num_classes:   If set, adds a classification head
    """

    def __init__(
        self,
        vocab_size:   int,
        d_model:      int = 768,
        n_heads:      int = 8,
        n_layers:     int = 4,
        d_ff:         int = 3072,
        max_seq_len:  int = 512,
        dropout:      float = 0.1,
        num_classes:  Optional[int] = None,
    ) -> None:
        super().__init__()
        self.d_model = d_model

        # Embeddings
        self.token_emb = nn.Embedding(vocab_size, d_model, padding_idx=0)
        self.pos_enc   = SinusoidalPositionalEncoding(d_model, max_seq_len, dropout)

        # Encoder stack
        self.layers    = nn.ModuleList([
            EncoderBlock(d_model, n_heads, d_ff, dropout)
            for _ in range(n_layers)
        ])
        self.norm_out  = nn.LayerNorm(d_model)

        # MLM head (shared with token_emb weights)
        self.mlm_head  = nn.Linear(d_model, vocab_size, bias=False)
        self.mlm_head.weight = self.token_emb.weight  # weight tying

        # Classification head (optional)
        self.classifier: Optional[nn.Module] = None
        if num_classes is not None:
            self.classifier = nn.Sequential(
                nn.Linear(d_model, d_model),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(d_model, num_classes),
            )

        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.padding_idx is not None:
                    module.weight.data[module.padding_idx].zero_()
            elif isinstance(module, nn.LayerNorm):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)

    def _build_padding_mask(self, input_ids: torch.Tensor) -> torch.Tensor:
        # (B, 1, 1, T) — True where padding (id == 0)
        return (input_ids == 0).unsqueeze(1).unsqueeze(2)

    def encode(
        self,
        input_ids:      torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Encode input_ids to contextualized representations.
        Returns shape (B, T, d_model).
        """
        mask = self._build_padding_mask(input_ids) if attention_mask is None else attention_mask
        x = self.token_emb(input_ids)
        x = self.pos_enc(x)
        for layer in self.layers:
            x = layer(x, mask)
        return self.norm_out(x)

    def forward(
        self,
        input_ids:      torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
        labels:         Optional[torch.Tensor] = None,
    ):
        hidden = self.encode(input_ids, attention_mask)

        # [CLS] token representation for classification
        cls_repr = hidden[:, 0, :]          # (B, d_model)
        # L2-normalize for similarity tasks
        embeddings = F.normalize(cls_repr, p=2, dim=-1)

        # MLM logits over full sequence
        mlm_logits = self.mlm_head(hidden)  # (B, T, vocab_size)

        # Classification logits
        cls_logits = self.classifier(cls_repr) if self.classifier else None

        # Compute losses if labels provided
        loss = None
        if labels is not None:
            # MLM loss (if labels has shape B×T)
            if labels.dim() == 2:
                loss = F.cross_entropy(
                    mlm_logits.reshape(-1, mlm_logits.size(-1)),
                    labels.reshape(-1),
                    ignore_index=-100,
                )
            # Classification loss (if labels is B,)
            elif labels.dim() == 1 and cls_logits is not None:
                loss = F.cross_entropy(cls_logits, labels)

        return {
            "loss":        loss,
            "embeddings":  embeddings,
            "mlm_logits":  mlm_logits,
            "cls_logits":  cls_logits,
            "hidden":      hidden,
        }

    @property
    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())
