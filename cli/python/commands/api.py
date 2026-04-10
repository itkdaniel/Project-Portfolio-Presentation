"""
nexus api — Direct API endpoint consumption commands.

Commands:
  get       GET any API endpoint
  post      POST to any API endpoint with JSON body
  patch     PATCH any API endpoint
  delete    DELETE any API endpoint
  batch     Parallel GET multiple endpoints simultaneously
  endpoints List all available API endpoints
"""

import json
import click
from rich.console import Console
from rich.syntax import Syntax
from rich.table import Table
from rich import box

from ..lib import client

console = Console()


def _pretty(data, output_format="json"):
    if output_format == "table" and isinstance(data, list) and data and isinstance(data[0], dict):
        keys = list(data[0].keys())
        t = Table(box=box.ROUNDED, border_style="blue")
        for k in keys:
            t.add_column(k, style="cyan")
        for row in data:
            t.add_row(*[str(row.get(k, "")) for k in keys])
        console.print(t)
    else:
        raw = json.dumps(data, indent=2, default=str)
        console.print(Syntax(raw, "json", theme="monokai", word_wrap=True))


@click.group()
def api():
    """Raw API endpoint access — GET, POST, PATCH, DELETE, batch."""
    pass


# ── get ───────────────────────────────────────────────────────────────────────

@api.command()
@click.argument("path")
@click.option("--param", "-p", multiple=True, metavar="KEY=VAL", help="Query parameters (repeatable).")
@click.option("--format", "-f", "fmt", type=click.Choice(["json", "table"]), default="json",
              help="Output format: json (default) or table.")
@click.help_option("--help", "-h")
def get(path, param, fmt):
    """
    GET any API endpoint and display the response.

    PATH should start with /api/...

    \b
    Examples:
      nexus api get /api/projects
      nexus api get /api/projects --format table
      nexus api get /api/auth/me
      nexus api get /api/admin/stats -p sort=name -p limit=10
    """
    params = {}
    for p in param:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k] = v
    try:
        data = client.get(path, params or None)
        _pretty(data, fmt)
    except client.APIError as e:
        console.print(f"[red]HTTP {e.status}:[/] {e.detail}")
        raise SystemExit(1)


# ── post ──────────────────────────────────────────────────────────────────────

@api.command()
@click.argument("path")
@click.argument("body", default="{}")
@click.help_option("--help", "-h")
def post(path, body):
    """
    POST JSON BODY to any API endpoint.

    \b
    Examples:
      nexus api post /api/bookings '{"name":"Alice","email":"a@b.com","details":"test","date":"2026-04-15","time":"10:00"}'
      nexus api post /api/auth/login '{"email":"admin@nexusconsult.dev","password":"Admin@Nexus2024!"}'
    """
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as e:
        console.print(f"[red]Invalid JSON body:[/] {e}")
        raise SystemExit(1)
    try:
        data = client.post(path, payload)
        _pretty(data)
    except client.APIError as e:
        console.print(f"[red]HTTP {e.status}:[/] {e.detail}")
        raise SystemExit(1)


# ── patch ─────────────────────────────────────────────────────────────────────

@api.command()
@click.argument("path")
@click.argument("body", default="{}")
@click.help_option("--help", "-h")
def patch(path, body):
    """
    PATCH an existing resource with partial JSON BODY.

    \b
    Examples:
      nexus api patch /api/projects/abc123 '{"status":"archived"}'
    """
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as e:
        console.print(f"[red]Invalid JSON body:[/] {e}")
        raise SystemExit(1)
    try:
        data = client.patch(path, payload)
        _pretty(data)
    except client.APIError as e:
        console.print(f"[red]HTTP {e.status}:[/] {e.detail}")
        raise SystemExit(1)


# ── delete ────────────────────────────────────────────────────────────────────

@api.command()
@click.argument("path")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation prompt.")
@click.help_option("--help", "-h")
def delete(path, yes):
    """
    DELETE a resource at PATH.

    \b
    Examples:
      nexus api delete /api/projects/abc123
      nexus api delete /api/projects/abc123 --yes
    """
    if not yes:
        click.confirm(f"DELETE {path}?", abort=True)
    try:
        data = client.delete(path)
        _pretty(data)
    except client.APIError as e:
        console.print(f"[red]HTTP {e.status}:[/] {e.detail}")
        raise SystemExit(1)


# ── batch ─────────────────────────────────────────────────────────────────────

@api.command()
@click.argument("paths", nargs=-1, required=True)
@click.help_option("--help", "-h")
def batch(paths):
    """
    Parallel GET multiple API endpoints simultaneously (async multi-threaded).

    \b
    Examples:
      nexus api batch /api/projects /api/auth/me /api/admin/stats
    """
    console.print(f"[cyan]Fetching {len(paths)} endpoints in parallel…[/]")
    results = client.parallel_get(list(paths))
    for path, result in zip(paths, results):
        console.print(f"\n[bold cyan]── {path} ──[/]")
        _pretty(result)


# ── endpoints ─────────────────────────────────────────────────────────────────

@api.command()
@click.help_option("--help", "-h")
def endpoints():
    """
    List all available NexusConsult API endpoints with auth requirements.

    \b
    Examples:
      nexus api endpoints
    """
    data = [
        ("GET",    "/api/projects",            "public",  "List all published projects"),
        ("POST",   "/api/projects",            "admin",   "Create a new project"),
        ("PATCH",  "/api/projects/:id",        "admin",   "Update a project"),
        ("DELETE", "/api/projects/:id",        "admin",   "Delete a project"),
        ("POST",   "/api/auth/login",          "public",  "Login and receive JWT"),
        ("POST",   "/api/auth/register",       "public",  "Register a new user account"),
        ("GET",    "/api/auth/me",             "auth",    "Get current user profile"),
        ("POST",   "/api/bookings",            "public",  "Submit a booking request"),
        ("GET",    "/api/bookings",            "admin",   "List all bookings"),
        ("POST",   "/api/inquiries",           "public",  "Submit an inquiry"),
        ("GET",    "/api/admin/stats",         "admin",   "Admin dashboard statistics"),
        ("GET",    "/api/tests/results",       "public",  "Latest test run results"),
        ("POST",   "/api/tests/run",           "public",  "Trigger a test run"),
        ("PATCH",  "/api/users/role",          "admin",   "Update a user's corp role"),
    ]
    t = Table(title="NexusConsult API Endpoints", box=box.ROUNDED, border_style="blue")
    t.add_column("Method",  style="bold yellow", min_width=8)
    t.add_column("Path",    style="cyan",         min_width=35)
    t.add_column("Auth",    style="magenta",      min_width=8)
    t.add_column("Description", style="white")
    for method, path, auth, desc in data:
        color = {"GET":"green","POST":"blue","PATCH":"yellow","DELETE":"red"}.get(method,"white")
        t.add_row(f"[{color}]{method}[/]", path, auth, desc)
    console.print(t)
