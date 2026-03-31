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
    vocab_size:    int   = 8000    # tokenizer vocabulary
    max_seq_len:   int   = 512     # maximum sequence length
    d_model:       int   = 256     # embedding / hidden dimension
    n_heads:       int   = 8       # number of attention heads
    n_layers:      int   = 4       # number of encoder blocks
    d_ff:          int   = 1024    # feed-forward inner dimension (usually 4 × d_model)
    dropout:       float = 0.1
    pad_token_id:  int   = 0
    n_classes:     int   = 5       # output classes for fine-tuning


# ── Sinusoidal Positional Encoding ────────────────────────────────────────────
class SinusoidalPositionalEncoding(nn.Module):
    """
    Injects position information via fixed sin/cos functions.

    PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
    PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

    Advantages over learned embeddings:
      - No parameters to train
      - Generalises to sequence lengths not seen during training
      - Monotonically encodes relative distance
    """
    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)           # (max_len, 1)
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(pos * div)                                        # even dims
        pe[:, 1::2] = torch.cos(pos * div)                                        # odd dims
        pe = pe.unsqueeze(0)                                                       # (1, max_len, d_model)
        self.register_buffer("pe", pe)                                            # not a parameter

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, seq_len, d_model)"""
        x = x + self.pe[:, :x.size(1)]
        return self.dropout(x)


# ── Multi-Head Self-Attention ─────────────────────────────────────────────────
class MultiHeadSelfAttention(nn.Module):
    """
    Scaled dot-product attention with multiple parallel heads.

    Steps:
      1. Project input into Q, K, V matrices for each head
      2. Compute attention scores: softmax(QK^T / sqrt(d_k))
      3. Weighted sum of V
      4. Concatenate heads → linear projection

    Complexity: O(seq_len^2 × d_model) — quadratic in sequence length.
    For long sequences, consider Flash Attention or linear attention variants.
    """
    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"

        self.n_heads = n_heads
        self.d_k     = d_model // n_heads   # head dimension

        # Single fused projection: W_Q, W_K, W_V stacked for efficiency
        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)
        self.dropout  = nn.Dropout(dropout)
        self.scale    = math.sqrt(self.d_k)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        x:    (batch, seq, d_model)
        mask: (batch, 1, 1, seq) — True positions are masked (padding)
        """
        B, S, D = x.shape

        # Project and split into Q, K, V heads
        qkv = self.qkv_proj(x)                                  # (B, S, 3D)
        qkv = qkv.reshape(B, S, 3, self.n_heads, self.d_k)     # (B, S, 3, H, d_k)
        qkv = qkv.permute(2, 0, 3, 1, 4)                       # (3, B, H, S, d_k)
        q, k, v = qkv[0], qkv[1], qkv[2]                       # each: (B, H, S, d_k)

        # Scaled dot-product attention
        attn = torch.matmul(q, k.transpose(-2, -1)) / self.scale  # (B, H, S, S)
        if mask is not None:
            attn = attn.masked_fill(mask, float("-inf"))
        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)

        # Weighted sum of values
        out = torch.matmul(attn, v)                              # (B, H, S, d_k)
        out = out.transpose(1, 2).reshape(B, S, D)              # (B, S, D)
        return self.out_proj(out)


# ── Position-wise Feed-Forward Network ───────────────────────────────────────
class FeedForward(nn.Module):
    """
    Two-layer MLP with GELU activation applied independently per position.
    FFN(x) = GELU(xW_1 + b_1)W_2 + b_2
    Expansion factor: d_ff / d_model = 4 (standard from "Attention Is All You Need")
    """
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.fc1     = nn.Linear(d_model, d_ff)
        self.fc2     = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc2(self.dropout(F.gelu(self.fc1(x))))


# ── Encoder Block ─────────────────────────────────────────────────────────────
class EncoderBlock(nn.Module):
    """
    Single transformer encoder block with Pre-LayerNorm.

    Pre-LN (vs Post-LN):
      - Normalise before sublayer → gradients don't explode/vanish as deeply
      - No need for warm-up schedule tricks
      - Preferred in GPT-2, GPT-3, PaLM

    Residual connections:
      x = x + sublayer(LN(x))   ← Pre-LN
    """
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
        # Self-attention sublayer
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        # Feed-forward sublayer
        x = x + self.dropout(self.ffn(self.ln2(x)))
        return x


# ── Transformer Encoder ───────────────────────────────────────────────────────
class TransformerEncoder(nn.Module):
    """
    Full encoder stack: token embeddings → positional encoding → N × EncoderBlock.
    Produces contextualised token representations.
    """
    def __init__(self, config: TransformerConfig):
        super().__init__()
        self.config      = config
        self.token_emb   = nn.Embedding(config.vocab_size, config.d_model, padding_idx=config.pad_token_id)
        self.pos_enc     = SinusoidalPositionalEncoding(config.d_model, config.max_seq_len, config.dropout)
        self.blocks      = nn.ModuleList([EncoderBlock(config) for _ in range(config.n_layers)])
        self.final_norm  = nn.LayerNorm(config.d_model)

        # Weight initialisation: normal distribution scaled by 1/sqrt(d_model)
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
        """
        Create boolean mask where True = padded position (to mask in attention).
        Shape: (batch, 1, 1, seq_len) for broadcasting over heads.
        """
        return (input_ids == self.config.pad_token_id).unsqueeze(1).unsqueeze(2)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        input_ids:      (batch, seq_len) — token indices
        attention_mask: (batch, seq_len) — 1=real token, 0=pad (HuggingFace convention)

        Returns: (batch, seq_len, d_model) contextualised representations
        """
        mask = None
        if attention_mask is not None:
            # Convert 0/1 mask to True/False "should-ignore" mask
            mask = (attention_mask == 0).unsqueeze(1).unsqueeze(2)
        else:
            mask = self._make_padding_mask(input_ids)

        x = self.token_emb(input_ids)   # (B, S, d_model)
        x = self.pos_enc(x)

        for block in self.blocks:
            x = block(x, mask)

        return self.final_norm(x)


# ── Classification Head ───────────────────────────────────────────────────────
class NexusTransformer(nn.Module):
    """
    Complete model for sequence classification.

    Pooling strategy: [CLS] token (index 0) represents the whole sequence.
    This is the BERT-style approach and is fine-tuning compatible.

    Architecture: encoder → [CLS] pooling → linear classification head.
    """
    def __init__(self, config: TransformerConfig):
        super().__init__()
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
        """
        Returns:
            logits:            (batch, n_classes)
            hidden_states:     (batch, seq_len, d_model)
            pooled:            (batch, d_model)
        """
        hidden_states = self.encoder(input_ids, attention_mask)   # (B, S, D)
        cls_token     = hidden_states[:, 0, :]                     # [CLS] pooling
        pooled        = self.pooler(cls_token)                     # (B, D)
        logits        = self.classifier(pooled)                    # (B, n_classes)

        return {
            "logits":        logits,
            "hidden_states": hidden_states,
            "pooled":        pooled,
        }

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ── Convenience factory ───────────────────────────────────────────────────────
def build_model(
    vocab_size: int  = 8000,
    n_classes: int   = 5,
    d_model: int     = 256,
    n_layers: int    = 4,
    n_heads: int     = 8,
) -> NexusTransformer:
    """Build a NexusTransformer with given hyperparameters."""
    config = TransformerConfig(
        vocab_size=vocab_size,
        n_classes=n_classes,
        d_model=d_model,
        n_layers=n_layers,
        n_heads=n_heads,
    )
    return NexusTransformer(config)