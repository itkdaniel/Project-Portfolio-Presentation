"""
Training & fine-tuning pipeline for NexusTransformer.
Kept for local use only — not part of the inference service.

Supports two modes:
  1. Pre-training (masked language modelling — MLM)
  2. Fine-tuning (sequence classification)

Key algorithmic choices:
  - AdamW optimizer (decoupled weight decay)
  - Cosine annealing LR schedule with linear warm-up
  - Gradient clipping (max_norm=1.0)
  - Mixed precision (torch.autocast) for faster training
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


@dataclass
class TrainingConfig:
    learning_rate:       float = 3e-4
    weight_decay:        float = 0.01
    beta1:               float = 0.9
    beta2:               float = 0.999
    eps:                 float = 1e-8
    max_grad_norm:       float = 1.0

    num_epochs:          int   = 10
    warmup_ratio:        float = 0.1

    batch_size:          int   = 32
    val_split:           float = 0.1

    output_dir:          str   = "./checkpoints"
    save_every:          int   = 1
    early_stop_patience: int   = 3

    mlm_probability:     float = 0.15

    seed:                int   = 42
    device:              str   = field(default_factory=lambda: "cuda" if torch.cuda.is_available() else "cpu")
    mixed_precision:     bool  = True


class CosineScheduleWithWarmup:
    """Linear warm-up followed by cosine annealing."""
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


class MLMCollator:
    """BERT-style masking: 80% [MASK], 10% random, 10% unchanged."""
    MASK_ID = 4

    def __init__(self, vocab_size: int, mlm_probability: float = 0.15):
        self.vocab_size      = vocab_size
        self.mlm_probability = mlm_probability

    def __call__(self, input_ids: torch.Tensor):
        labels  = input_ids.clone()
        mask    = torch.bernoulli(torch.full(input_ids.shape, self.mlm_probability)).bool()
        mask    = mask & (input_ids >= 5)
        labels[~mask] = -100

        replace_mask = torch.bernoulli(torch.full(input_ids.shape, 0.8)).bool() & mask
        input_ids[replace_mask] = self.MASK_ID

        random_mask = torch.bernoulli(torch.full(input_ids.shape, 0.5)).bool() & mask & ~replace_mask
        random_ids  = torch.randint(5, self.vocab_size, input_ids.shape)
        input_ids[random_mask] = random_ids[random_mask]

        return input_ids, labels


def accuracy(logits: torch.Tensor, labels: torch.Tensor) -> float:
    preds = logits.argmax(dim=-1)
    return (preds == labels).float().mean().item()


class Trainer:
    """Generic training loop for NexusTransformer."""

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

        decay, no_decay = [], []
        for name, param in model.named_parameters():
            if param.requires_grad:
                (no_decay if "bias" in name or "norm" in name.lower() else decay).append(param)

        self.optimizer = torch.optim.AdamW([
            {"params": decay,    "weight_decay": config.weight_decay},
            {"params": no_decay, "weight_decay": 0.0},
        ], lr=config.learning_rate, betas=(config.beta1, config.beta2), eps=config.eps)

        total_steps  = len(train_loader) * config.num_epochs
        warmup_steps = int(total_steps * config.warmup_ratio)
        self.scheduler = CosineScheduleWithWarmup(self.optimizer, warmup_steps, total_steps)

        self._best_val_loss = float("inf")
        self._patience_ctr  = 0

    def _train_step(self, batch) -> float:
        self.model.train()
        input_ids      = batch["input_ids"].to(self.config.device)
        attention_mask = batch.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.config.device)
        labels = batch["labels"].to(self.config.device)

        if self.mlm_collator:
            input_ids, labels = self.mlm_collator(input_ids)

        outputs = self.model(input_ids, attention_mask)
        logits  = outputs["logits"]
        loss    = nn.CrossEntropyLoss(ignore_index=-100)(logits, labels)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.config.max_grad_norm)
        self.optimizer.step()
        self.scheduler.step()
        return loss.item()

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
            labels  = batch["labels"].to(self.config.device)
            outputs = self.model(input_ids, attention_mask)
            loss    = nn.CrossEntropyLoss()(outputs["logits"], labels)
            total_loss += loss.item() * len(labels)
            total_acc  += accuracy(outputs["logits"], labels) * len(labels)
            n          += len(labels)
        return {"val_loss": total_loss / n, "val_acc": total_acc / n}

    def train(self) -> Dict[str, List[float]]:
        os.makedirs(self.config.output_dir, exist_ok=True)
        print(f"Training on {self.config.device} | {self.model.count_parameters():,} params")

        for epoch in range(1, self.config.num_epochs + 1):
            t0 = time.time()
            epoch_loss = sum(self._train_step(b) for b in self.train_loader) / len(self.train_loader)
            self.history["train_loss"].append(epoch_loss)

            metrics  = self.evaluate()
            val_loss = metrics.get("val_loss", 0.0)
            val_acc  = metrics.get("val_acc", 0.0)
            self.history["val_loss"].append(val_loss)
            self.history["val_acc"].append(val_acc)

            print(f"Epoch {epoch:3d}/{self.config.num_epochs} | "
                  f"train_loss={epoch_loss:.4f} | val_loss={val_loss:.4f} | "
                  f"val_acc={val_acc:.4f} | {time.time()-t0:.1f}s")

            for cb in self.callbacks:
                cb(epoch=epoch, metrics={**metrics, "train_loss": epoch_loss})

            if epoch % self.config.save_every == 0:
                self.save_checkpoint(f"checkpoint_epoch_{epoch}.pt")

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
