"""
Training & fine-tuning pipeline for NexusTransformer.

Supports two modes:
  1. Pre-training (masked language modelling — MLM)
  2. Fine-tuning (sequence classification)

Design patterns:
  - Strategy pattern: swap loss functions / optimisers without changing the loop
  - Observer pattern: callbacks for logging, checkpointing, early stopping
  - Factory function: `create_trainer()` wires everything together

Key algorithmic choices:
  - AdamW optimizer (decoupled weight decay — better than Adam for transformers)
  - Cosine annealing LR schedule with linear warm-up
  - Gradient clipping (max_norm=1.0) prevents exploding gradients
  - Mixed precision (torch.autocast) for faster training on compatible hardware
"""
from __future__ import annotations
import os
import time
import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset, random_split


# ── Hyperparameters ───────────────────────────────────────────────────────────
@dataclass
class TrainingConfig:
    # Optimisation
    learning_rate:   float = 3e-4      # AdamW recommended starting point
    weight_decay:    float = 0.01
    beta1:           float = 0.9
    beta2:           float = 0.999
    eps:             float = 1e-8
    max_grad_norm:   float = 1.0       # gradient clipping threshold

    # Schedule
    num_epochs:      int   = 10
    warmup_ratio:    float = 0.1       # fraction of steps for linear warm-up

    # Data
    batch_size:      int   = 32
    val_split:       float = 0.1

    # Checkpointing
    output_dir:      str   = "./checkpoints"
    save_every:      int   = 1         # save checkpoint every N epochs
    early_stop_patience: int = 3

    # MLM (pre-training)
    mlm_probability: float = 0.15

    # Misc
    seed:            int   = 42
    device:          str   = field(default_factory=lambda: "cuda" if torch.cuda.is_available() else "cpu")
    mixed_precision: bool  = True


# ── Cosine LR Schedule with Warm-Up ──────────────────────────────────────────
class CosineScheduleWithWarmup:
    """
    Linear warm-up followed by cosine annealing.

    LR during warm-up:  lr × step / warmup_steps
    LR during cosine:   lr × 0.5 × (1 + cos(π × progress))

    This is the standard schedule for transformer fine-tuning.
    Warm-up prevents early large updates from destabilising attention weights.
    """
    def __init__(self, optimizer, num_warmup_steps: int, num_training_steps: int):
        self.optimizer          = optimizer
        self.num_warmup_steps   = num_warmup_steps
        self.num_training_steps = num_training_steps
        self._step              = 0
        self._base_lrs          = [pg["lr"] for pg in optimizer.param_groups]

    def step(self):
        self._step += 1
        s = self._step
        for pg, base_lr in zip(self.optimizer.param_groups, self._base_lrs):
            if s <= self.num_warmup_steps:
                pg["lr"] = base_lr * s / max(1, self.num_warmup_steps)
            else:
                progress = (s - self.num_warmup_steps) / max(1, self.num_training_steps - self.num_warmup_steps)
                pg["lr"] = base_lr * 0.5 * (1.0 + math.cos(math.pi * progress))

    def get_last_lr(self) -> List[float]:
        return [pg["lr"] for pg in self.optimizer.param_groups]


# ── MLM Data Collator ─────────────────────────────────────────────────────────
class MLMCollator:
    """
    Randomly mask tokens for masked language modelling (BERT-style).

    Masking strategy (from BERT paper):
      - 80% of masked positions → [MASK]
      - 10% → random token (robustness)
      - 10% → unchanged (discourages identity shortcut)
    """
    MASK_ID = 4   # [MASK] token

    def __init__(self, vocab_size: int, mlm_probability: float = 0.15):
        self.vocab_size      = vocab_size
        self.mlm_probability = mlm_probability

    def __call__(self, input_ids: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        input_ids: (batch, seq_len)
        Returns: (masked_ids, labels) where labels=-100 for unmasked positions.
        """
        labels  = input_ids.clone()
        mask    = torch.bernoulli(torch.full(input_ids.shape, self.mlm_probability)).bool()
        # Don't mask special tokens (ids 0–4)
        mask    = mask & (input_ids >= 5)
        labels[~mask] = -100   # ignored in cross-entropy

        # 80% → [MASK]
        replace_mask = torch.bernoulli(torch.full(input_ids.shape, 0.8)).bool() & mask
        input_ids[replace_mask] = self.MASK_ID

        # 10% → random token
        random_mask = torch.bernoulli(torch.full(input_ids.shape, 0.5)).bool() & mask & ~replace_mask
        random_ids  = torch.randint(5, self.vocab_size, input_ids.shape)
        input_ids[random_mask] = random_ids[random_mask]

        # 10% → unchanged (already in input_ids)
        return input_ids, labels


# ── Metrics ───────────────────────────────────────────────────────────────────
def accuracy(logits: torch.Tensor, labels: torch.Tensor) -> float:
    preds = logits.argmax(dim=-1)
    return (preds == labels).float().mean().item()


def top_k_accuracy(logits: torch.Tensor, labels: torch.Tensor, k: int = 3) -> float:
    _, top_k = logits.topk(k, dim=-1)
    correct  = labels.unsqueeze(1).expand_as(top_k)
    return (top_k == correct).any(dim=-1).float().mean().item()


# ── Trainer ───────────────────────────────────────────────────────────────────
class Trainer:
    """
    Generic training loop for NexusTransformer.

    Supports:
      - Classification fine-tuning
      - MLM pre-training (pass mlm_collator=MLMCollator(...))
      - Gradient clipping
      - Mixed precision (torch.autocast)
      - Early stopping
      - Checkpoint saving / loading
      - Callback hooks
    """

    def __init__(
        self,
        model: nn.Module,
        config: TrainingConfig,
        train_loader: DataLoader,
        val_loader: Optional[DataLoader] = None,
        callbacks: Optional[List[Callable]] = None,
        mlm_collator: Optional[MLMCollator] = None,
    ):
        torch.manual_seed(config.seed)
        self.model        = model.to(config.device)
        self.config       = config
        self.train_loader = train_loader
        self.val_loader   = val_loader
        self.callbacks    = callbacks or []
        self.mlm_collator = mlm_collator
        self.history: Dict[str, List[float]] = {
            "train_loss": [], "val_loss": [], "val_acc": []
        }

        # ── Optimizer: AdamW with weight decay ──────────────────────────────
        # Separate params: no weight decay on bias / LayerNorm weights
        decay, no_decay = [], []
        for name, param in model.named_parameters():
            if param.requires_grad:
                (no_decay if "bias" in name or "norm" in name.lower() else decay).append(param)

        self.optimizer = torch.optim.AdamW([
            {"params": decay,    "weight_decay": config.weight_decay},
            {"params": no_decay, "weight_decay": 0.0},
        ], lr=config.learning_rate, betas=(config.beta1, config.beta2), eps=config.eps)

        # ── LR scheduler ────────────────────────────────────────────────────
        total_steps  = len(train_loader) * config.num_epochs
        warmup_steps = int(total_steps * config.warmup_ratio)
        self.scheduler = CosineScheduleWithWarmup(self.optimizer, warmup_steps, total_steps)

        self._best_val_loss = float("inf")
        self._patience_ctr  = 0

    # ── Single training step ──────────────────────────────────────────────────
    def _train_step(self, batch) -> float:
        self.model.train()
        input_ids      = batch["input_ids"].to(self.config.device)
        attention_mask = batch.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.config.device)
        labels = batch["labels"].to(self.config.device)

        if self.mlm_collator:
            input_ids, labels = self.mlm_collator(input_ids)

        ctx = torch.autocast(self.config.device, dtype=torch.float16) \
              if self.config.mixed_precision and self.config.device == "cuda" \
              else torch.no_grad.__class__()  # no-op context

        with ctx if self.config.mixed_precision else torch.no_grad.__class__():
            outputs = self.model(input_ids, attention_mask)
            logits  = outputs["logits"]
            loss    = nn.CrossEntropyLoss(ignore_index=-100)(logits, labels)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.config.max_grad_norm)
        self.optimizer.step()
        self.scheduler.step()
        return loss.item()

    # ── Validation ────────────────────────────────────────────────────────────
    @torch.no_grad()
    def evaluate(self) -> Dict[str, float]:
        if not self.val_loader:
            return {}
        self.model.eval()
        total_loss, total_acc, n = 0.0, 0.0, 0
        for batch in self.val_loader:
            input_ids      = batch["input_ids"].to(self.config.device)
            attention_mask = batch.get("attention_mask")
            if attention_mask is not None:
                attention_mask = attention_mask.to(self.config.device)
            labels = batch["labels"].to(self.config.device)

            outputs     = self.model(input_ids, attention_mask)
            loss        = nn.CrossEntropyLoss()(outputs["logits"], labels)
            total_loss += loss.item() * len(labels)
            total_acc  += accuracy(outputs["logits"], labels) * len(labels)
            n          += len(labels)

        return {"val_loss": total_loss / n, "val_acc": total_acc / n}

    # ── Full training loop ────────────────────────────────────────────────────
    def train(self) -> Dict[str, List[float]]:
        os.makedirs(self.config.output_dir, exist_ok=True)
        print(f"Training on {self.config.device} | {self.model.count_parameters():,} params")

        for epoch in range(1, self.config.num_epochs + 1):
            t0 = time.time()
            epoch_loss = sum(self._train_step(b) for b in self.train_loader) / len(self.train_loader)
            self.history["train_loss"].append(epoch_loss)

            metrics = self.evaluate()
            val_loss = metrics.get("val_loss", 0.0)
            val_acc  = metrics.get("val_acc", 0.0)
            self.history["val_loss"].append(val_loss)
            self.history["val_acc"].append(val_acc)

            elapsed = time.time() - t0
            print(f"Epoch {epoch:3d}/{self.config.num_epochs} | "
                  f"train_loss={epoch_loss:.4f} | val_loss={val_loss:.4f} | "
                  f"val_acc={val_acc:.4f} | {elapsed:.1f}s")

            # Callbacks (e.g., W&B logging, TensorBoard)
            for cb in self.callbacks:
                cb(epoch=epoch, metrics={**metrics, "train_loss": epoch_loss})

            # Checkpoint
            if epoch % self.config.save_every == 0:
                self.save_checkpoint(f"checkpoint_epoch_{epoch}.pt")

            # Early stopping
            if val_loss < self._best_val_loss:
                self._best_val_loss = val_loss
                self._patience_ctr  = 0
                self.save_checkpoint("best_model.pt")
            else:
                self._patience_ctr += 1
                if self._patience_ctr >= self.config.early_stop_patience:
                    print(f"Early stopping at epoch {epoch}")
                    break

        return self.history

    def save_checkpoint(self, filename: str) -> None:
        path = os.path.join(self.config.output_dir, filename)
        torch.save({
            "model_state":     self.model.state_dict(),
            "optimizer_state": self.optimizer.state_dict(),
            "config":          self.config,
            "history":         self.history,
        }, path)

    def load_checkpoint(self, path: str) -> None:
        ckpt = torch.load(path, map_location=self.config.device)
        self.model.load_state_dict(ckpt["model_state"])
        self.optimizer.load_state_dict(ckpt["optimizer_state"])
        self.history = ckpt.get("history", self.history)