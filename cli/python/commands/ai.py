"""
nexus ai — AI inference commands (calls the local AI FastAPI service).

Commands:
  classify    Classify text using the deployed transformer
  embed       Get sentence embeddings
  similarity  Compute cosine similarity between two texts
  fill-mask   Fill [MASK] tokens in a sentence (MLM)
  search      BM25 + embedding-hybrid semantic search over projects
  status      Check AI service health and loaded model info
"""

import json
import click
from rich.console import Console
from rich.table import Table
from rich import box

console = Console()
AI_BASE = "http://localhost:8001"
PY_BASE = "http://localhost:8000"


def _ai_post(path: str, body: dict):
    import httpx
    try:
        r = httpx.post(f"{AI_BASE}{path}", json=body, timeout=30)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        console.print(f"[red]AI service not reachable at {AI_BASE}[/]\n"
                      f"[dim]Start with: nexus infra start --service ai-service[/]")
        raise SystemExit(1)
    except httpx.HTTPStatusError as e:
        console.print(f"[red]HTTP {e.response.status_code}:[/] {e.response.text}")
        raise SystemExit(1)


def _py_get(path: str, params: dict | None = None):
    import httpx
    try:
        r = httpx.get(f"{PY_BASE}{path}", params=params, timeout=30)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        console.print(f"[red]Python service not reachable at {PY_BASE}[/]\n"
                      f"[dim]Start with: nexus infra start --service python-service[/]")
        raise SystemExit(1)
    except httpx.HTTPStatusError as e:
        console.print(f"[red]HTTP {e.response.status_code}:[/] {e.response.text}")
        raise SystemExit(1)


@click.group()
def ai():
    """AI inference — classify, embed, similarity, fill-mask, and semantic search."""
    pass


# ── classify ──────────────────────────────────────────────────────────────────

@ai.command()
@click.argument("text")
@click.option("--top-k", "-k", type=int, default=3, show_default=True, help="Return top-K labels.")
@click.help_option("--help", "-h")
def classify(text, top_k):
    """
    Classify TEXT using the deployed NexusTransformer model.

    \b
    Examples:
      nexus ai classify "This service handles authentication and JWT tokens"
      nexus ai classify "Distributed event streaming pipeline" --top-k 5
    """
    result = _ai_post("/classify", {"text": text, "top_k": top_k})
    t = Table(title="Classification Results", box=box.ROUNDED, border_style="blue")
    t.add_column("Rank",  style="dim",      justify="right")
    t.add_column("Label", style="cyan")
    t.add_column("Score", style="bold white", justify="right")
    for i, item in enumerate(result.get("predictions", []), 1):
        t.add_row(str(i), item.get("label","—"), f"{item.get('score',0):.4f}")
    console.print(t)


# ── embed ─────────────────────────────────────────────────────────────────────

@ai.command()
@click.argument("text")
@click.option("--truncate", type=int, default=8, show_default=True, help="Show first N embedding dims.")
@click.help_option("--help", "-h")
def embed(text, truncate):
    """
    Generate a sentence embedding vector for TEXT.

    \b
    Examples:
      nexus ai embed "Kubernetes horizontal pod autoscaler"
    """
    result = _ai_post("/embed", {"text": text})
    vector = result.get("embedding", [])
    console.print(f"[cyan]Embedding[/] dim={len(vector)}")
    preview = vector[:truncate]
    console.print(f"Preview: [{', '.join(f'{v:.5f}' for v in preview)}{',...' if len(vector) > truncate else ''}]")


# ── similarity ────────────────────────────────────────────────────────────────

@ai.command()
@click.argument("text_a")
@click.argument("text_b")
@click.help_option("--help", "-h")
def similarity(text_a, text_b):
    """
    Compute cosine similarity between TEXT_A and TEXT_B.

    \b
    Examples:
      nexus ai similarity "JWT authentication service" "OAuth2 token validation"
    """
    result = _ai_post("/similarity", {"text_a": text_a, "text_b": text_b})
    score  = result.get("similarity", 0)
    color  = "green" if score > 0.7 else "yellow" if score > 0.4 else "red"
    console.print(f"Cosine similarity: [{color}]{score:.4f}[/]")


# ── fill-mask ─────────────────────────────────────────────────────────────────

@ai.command("fill-mask")
@click.argument("text")
@click.option("--top-k", "-k", type=int, default=5, show_default=True)
@click.help_option("--help", "-h")
def fill_mask(text, top_k):
    """
    Fill [MASK] token(s) in TEXT using masked language modelling.

    \b
    Examples:
      nexus ai fill-mask "The [MASK] service handles distributed [MASK] processing"
    """
    result = _ai_post("/fill-mask", {"text": text, "top_k": top_k})
    t = Table(box=box.ROUNDED, border_style="magenta")
    t.add_column("Rank",  style="dim",   justify="right")
    t.add_column("Text",  style="white")
    t.add_column("Score", style="bold yellow", justify="right")
    for i, item in enumerate(result.get("results", []), 1):
        t.add_row(str(i), item.get("text","—"), f"{item.get('score',0):.4f}")
    console.print(t)


# ── search ────────────────────────────────────────────────────────────────────

@ai.command()
@click.argument("query")
@click.option("--top-k", "-k", type=int, default=5, show_default=True)
@click.option("--tags",  "-t", multiple=True, help="Filter by tags.")
@click.help_option("--help", "-h")
def search(query, top_k, tags):
    """
    BM25 + embedding hybrid semantic search over portfolio projects.

    \b
    Examples:
      nexus ai search "authentication microservice"
      nexus ai search "ML inference" --tags pytorch --tags docker
      nexus ai search "event pipeline" --top-k 3
    """
    params: dict = {"q": query, "limit": top_k}
    if tags:
        params["tags"] = ",".join(tags)
    result = _py_get("/search", params)
    hits   = result if isinstance(result, list) else result.get("results", [])

    t = Table(title=f'Search: "{query}"', box=box.ROUNDED, border_style="cyan")
    t.add_column("Score", style="bold yellow", justify="right", min_width=8)
    t.add_column("Name",  style="cyan",        min_width=22)
    t.add_column("Type",  style="white",        min_width=14)
    t.add_column("Tags",  style="dim")
    for hit in hits[:top_k]:
        t.add_row(
            f"{hit.get('score', hit.get('relevance', 0)):.3f}",
            hit.get("name","—"),
            hit.get("type","—"),
            ", ".join(hit.get("tags",[])[:4]),
        )
    console.print(t)


# ── status ────────────────────────────────────────────────────────────────────

@ai.command()
@click.help_option("--help", "-h")
def status():
    """
    Check health and model info for the AI and Python FastAPI services.

    \b
    Examples:
      nexus ai status
    """
    import httpx
    for name, base in [("AI Service (PyTorch)", AI_BASE), ("Python Service (BM25)", PY_BASE)]:
        try:
            r = httpx.get(f"{base}/health", timeout=5)
            data = r.json()
            icon = "[green]●[/] online"
        except Exception as e:
            data = {}
            icon = f"[red]● offline[/] ({e})"
        console.print(f"  {name}: {icon}")
        if data:
            for k, v in data.items():
                console.print(f"    [dim]{k}:[/] {v}")
