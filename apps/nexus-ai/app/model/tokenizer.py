"""
BPE (Byte-Pair Encoding) Tokenizer — built from scratch.

Algorithm (Sennrich et al., 2016):
  1. Start with character-level vocabulary + end-of-word marker
  2. Count all adjacent pair frequencies in the corpus
  3. Merge the most frequent pair into a single new token
  4. Repeat for `num_merges` iterations
  5. Encode text by applying learned merges greedily

Special tokens: [PAD]=0, [UNK]=1, [CLS]=2, [SEP]=3, [MASK]=4
"""
from __future__ import annotations
import re
import json
import os
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional


SPECIAL_TOKENS = {"[PAD]": 0, "[UNK]": 1, "[CLS]": 2, "[SEP]": 3, "[MASK]": 4}
SPECIAL_IDS    = {v: k for k, v in SPECIAL_TOKENS.items()}
END_OF_WORD    = "##"


class Vocabulary:
    """Bidirectional token ↔ id mapping."""

    def __init__(self):
        self._tok2id: Dict[str, int] = dict(SPECIAL_TOKENS)
        self._id2tok: Dict[int, str] = dict(SPECIAL_IDS)
        self._next_id = len(SPECIAL_TOKENS)

    def add(self, token: str) -> int:
        if token not in self._tok2id:
            self._tok2id[token] = self._next_id
            self._id2tok[self._next_id] = token
            self._next_id += 1
        return self._tok2id[token]

    def __len__(self):
        return self._next_id

    def encode_token(self, token: str) -> int:
        return self._tok2id.get(token, SPECIAL_TOKENS["[UNK]"])

    def decode_id(self, idx: int) -> str:
        return self._id2tok.get(idx, "[UNK]")

    def to_dict(self) -> Dict[str, int]:
        return dict(self._tok2id)

    @classmethod
    def from_dict(cls, d: Dict[str, int]) -> "Vocabulary":
        v = cls()
        v._tok2id = d
        v._id2tok = {i: t for t, i in d.items()}
        v._next_id = max(d.values()) + 1
        return v


def _word_to_chars(word: str) -> Tuple[str, ...]:
    chars = list(word)
    chars[-1] = chars[-1] + END_OF_WORD
    return tuple(chars)


def _get_pair_counts(vocab: Dict[Tuple[str, ...], int]) -> Counter:
    counts: Counter = Counter()
    for word_chars, freq in vocab.items():
        for i in range(len(word_chars) - 1):
            counts[(word_chars[i], word_chars[i + 1])] += freq
    return counts


def _merge_pair(
    vocab: Dict[Tuple[str, ...], int],
    pair: Tuple[str, str],
) -> Dict[Tuple[str, ...], int]:
    new_vocab: Dict[Tuple[str, ...], int] = {}
    merged = "".join(pair)
    for word_chars, freq in vocab.items():
        new_chars: List[str] = []
        i = 0
        while i < len(word_chars):
            if i < len(word_chars) - 1 and (word_chars[i], word_chars[i + 1]) == pair:
                new_chars.append(merged)
                i += 2
            else:
                new_chars.append(word_chars[i])
                i += 1
        new_vocab[tuple(new_chars)] = freq
    return new_vocab


class BPETokenizer:
    """
    Byte-Pair Encoding tokenizer.

    Usage:
        tokenizer = BPETokenizer()
        tokenizer.train(corpus_texts, num_merges=1000)
        ids = tokenizer.encode("Hello world")
        text = tokenizer.decode(ids)
    """

    def __init__(self, max_vocab: int = 8000):
        self.max_vocab = max_vocab
        self.vocab     = Vocabulary()
        self.merges:   List[Tuple[str, str]] = []
        self._trained  = False

    def train(self, texts: List[str], num_merges: Optional[int] = None) -> None:
        num_merges = num_merges or (self.max_vocab - len(SPECIAL_TOKENS) - 256)

        word_freq: Counter = Counter()
        for text in texts:
            for word in re.findall(r"[a-zA-Z0-9']+", text.lower()):
                word_freq[word] += 1

        bpe_vocab: Dict[Tuple[str, ...], int] = {
            _word_to_chars(w): f for w, f in word_freq.items() if len(w) > 0
        }

        for word_chars in bpe_vocab:
            for ch in word_chars:
                self.vocab.add(ch.replace(END_OF_WORD, ""))

        for i in range(num_merges):
            pair_counts = _get_pair_counts(bpe_vocab)
            if not pair_counts:
                break
            best_pair = pair_counts.most_common(1)[0][0]
            bpe_vocab = _merge_pair(bpe_vocab, best_pair)
            merged_token = "".join(best_pair).replace(END_OF_WORD, "")
            self.vocab.add(merged_token)
            self.merges.append(best_pair)

        self._trained = True

    def _tokenize_word(self, word: str) -> List[str]:
        if not self._trained:
            return list(word)

        chars = list(_word_to_chars(word))
        for pair in self.merges:
            i = 0
            new_chars: List[str] = []
            while i < len(chars):
                if i < len(chars) - 1 and (chars[i], chars[i + 1]) == pair:
                    new_chars.append("".join(pair))
                    i += 2
                else:
                    new_chars.append(chars[i])
                    i += 1
            chars = new_chars
        return [c.replace(END_OF_WORD, "") for c in chars]

    def encode(
        self,
        text: str,
        add_special_tokens: bool = True,
        max_length: int = 512,
        padding: bool = False,
    ) -> Dict[str, List[int]]:
        words   = re.findall(r"[a-zA-Z0-9']+", text.lower())
        tokens  = []
        for word in words:
            tokens.extend(self._tokenize_word(word))

        ids = [self.vocab.encode_token(t) for t in tokens]

        if add_special_tokens:
            ids = [SPECIAL_TOKENS["[CLS]"]] + ids + [SPECIAL_TOKENS["[SEP]"]]

        ids = ids[:max_length]
        mask = [1] * len(ids)

        if padding and len(ids) < max_length:
            pad_len = max_length - len(ids)
            ids  = ids  + [SPECIAL_TOKENS["[PAD]"]] * pad_len
            mask = mask + [0] * pad_len

        return {"input_ids": ids, "attention_mask": mask}

    def decode(self, ids: List[int], skip_special_tokens: bool = True) -> str:
        tokens = [self.vocab.decode_id(i) for i in ids]
        if skip_special_tokens:
            tokens = [t for t in tokens if t not in SPECIAL_TOKENS]
        return " ".join(tokens)

    def save(self, path: str) -> None:
        os.makedirs(path, exist_ok=True)
        with open(os.path.join(path, "vocab.json"), "w") as f:
            json.dump(self.vocab.to_dict(), f)
        with open(os.path.join(path, "merges.json"), "w") as f:
            json.dump(self.merges, f)

    @classmethod
    def load(cls, path: str) -> "BPETokenizer":
        with open(os.path.join(path, "vocab.json")) as f:
            vocab_dict = json.load(f)
        with open(os.path.join(path, "merges.json")) as f:
            merges = [tuple(m) for m in json.load(f)]
        tok = cls(max_vocab=len(vocab_dict))
        tok.vocab   = Vocabulary.from_dict(vocab_dict)
        tok.merges  = merges
        tok._trained = True
        return tok

    def __len__(self) -> int:
        return len(self.vocab)
