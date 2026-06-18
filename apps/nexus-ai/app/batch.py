"""
Inference batching via asyncio.Queue.

Design:
  - Requests are enqueued as BatchItem(texts, future)
  - Background worker drains the queue every `drain_ms` milliseconds
  - All drained requests are merged into one forward pass (O(1) vs O(n))
  - Each caller awaits its own asyncio.Future, resolved after the batch runs

Usage:
    batcher = InferenceBatcher(model_fn, drain_ms=10.0)
    await batcher.start()
    result = await batcher.submit(["hello world"])
    await batcher.stop()
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional


@dataclass
class BatchItem:
    texts: List[str]
    future: asyncio.Future
    submitted_at: float = field(default_factory=time.monotonic)


class InferenceBatcher:
    """
    Collects inference requests and runs them as a single batched forward pass.

    model_fn: async-safe callable (str, list[str]) -> list[result]
              Receives all texts merged from the batch, returns one result per text.
    drain_ms: how long (ms) to wait collecting requests before running the batch.
    max_batch: maximum texts per batch (splits if exceeded).
    """

    def __init__(
        self,
        model_fn: Callable[[List[str]], Any],
        drain_ms: float = 10.0,
        max_batch: int = 32,
    ):
        self._model_fn   = model_fn
        self._drain_ms   = drain_ms / 1000.0
        self._max_batch  = max_batch
        self._queue: asyncio.Queue[BatchItem] = asyncio.Queue()
        self._task: Optional[asyncio.Task]    = None
        self._running = False

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def submit(self, texts: List[str]) -> Any:
        """Enqueue a request and await its result."""
        loop   = asyncio.get_event_loop()
        future = loop.create_future()
        await self._queue.put(BatchItem(texts=texts, future=future))
        return await future

    async def _worker(self) -> None:
        while self._running:
            await asyncio.sleep(self._drain_ms)
            items: List[BatchItem] = []

            try:
                while True:
                    items.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                pass

            if not items:
                continue

            await self._process_batch(items)

    async def _process_batch(self, items: List[BatchItem]) -> None:
        all_texts: List[str] = []
        offsets:   List[int] = []

        for item in items:
            offsets.append(len(all_texts))
            all_texts.extend(item.texts)

        try:
            all_results = await asyncio.get_event_loop().run_in_executor(
                None, self._model_fn, all_texts
            )
            for item, offset in zip(items, offsets):
                n = len(item.texts)
                slice_result = all_results[offset: offset + n]
                if not item.future.done():
                    item.future.set_result(slice_result)
        except Exception as exc:
            for item in items:
                if not item.future.done():
                    item.future.set_exception(exc)
