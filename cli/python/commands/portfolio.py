"""
nexus portfolio — Portfolio project management commands.

Commands:
  list      List all portfolio projects
  get       Get a project by ID or name
  add       Add (create) a new project to the portfolio
  update    Update an existing project's fields
  remove    Remove a project from the portfolio
  publish   Set a project to published=true
  unpublish Set a project to published=false
  feature   Toggle a project's featured flag
  import    Bulk import projects from a JSON file
  export    Export all projects to a JSON file
"""

import json
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

from ..lib import client

console = Console()

STATUS_COLOR = {"active": "green", "draft": "yellow", "archived": "dim"}


def _status_badge(s):
    color = STATUS_COLOR.get(s, "white")
    return f"[{color}]{s}[/]"


def _print_project(p: dict):
    t = Table(show_header=False, box=box.ROUNDED, border_style="cyan")
    t.add_column("Field", style="cyan",  min_width=18)
    t.add_column("Value", style="white")
    for k, v in p.items():
        if k == "tags" and isinstance(v, list):
            v = ", ".join(v) or "—"
        t.add_row(k, str(v))
    console.print(t)


@click.group()
def portfolio():
    """Manage portfolio projects — add, remove, publish, and organise."""
    pass


# ── list ─────────────────────────────────────────────────────────────────────

@portfolio.command("list")
@click.option("--status",   "-s", type=click.Choice(["active","draft","archived"]), default=None)
@click.option("--featured", is_flag=True, help="Show only featured projects.")
@click.option("--format",   "-f", "fmt", type=click.Choice(["table","json"]), default="table")
@click.help_option("--help", "-h")
def list_projects(status, featured, fmt):
    """
    List all portfolio projects.

    \b
    Examples:
      nexus portfolio list
      nexus portfolio list --status active
      nexus portfolio list --featured
      nexus portfolio list --format json
    """
    try:
        projects = client.get("/api/projects")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}"); return

    if status:
        projects = [p for p in projects if p.get("status") == status]
    if featured:
        projects = [p for p in projects if p.get("featured")]

    if fmt == "json":
        console.print_json(json.dumps(projects, indent=2, default=str))
        return

    t = Table(title=f"Portfolio Projects ({len(projects)})", box=box.ROUNDED, border_style="blue")
    t.add_column("ID",          style="dim",     min_width=8)
    t.add_column("Name",        style="bold cyan", min_width=22)
    t.add_column("Type",        style="white",    min_width=14)
    t.add_column("Status",      min_width=10)
    t.add_column("Published",   justify="center", min_width=10)
    t.add_column("Featured",    justify="center", min_width=10)
    t.add_column("Tags",        style="dim")

    for p in projects:
        pub_icon = "[green]✓[/]" if p.get("published") else "[red]✗[/]"
        feat_icon = "[yellow]★[/]" if p.get("featured") else "—"
        t.add_row(
            p.get("id","")[:8] + "…",
            p.get("name",""),
            p.get("type",""),
            _status_badge(p.get("status","active")),
            pub_icon, feat_icon,
            ", ".join(p.get("tags",[])[:3]),
        )
    console.print(t)


# ── get ──────────────────────────────────────────────────────────────────────

@portfolio.command()
@click.argument("project_id")
@click.help_option("--help", "-h")
def get(project_id):
    """
    Show full details of a project by its ID.

    \b
    Examples:
      nexus portfolio get abc123
    """
    try:
        projects = client.get("/api/projects")
        match    = next((p for p in projects if p["id"] == project_id or project_id in p["id"]), None)
        if not match:
            console.print(f"[red]Project not found:[/] {project_id}"); return
        _print_project(match)
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")


# ── add ──────────────────────────────────────────────────────────────────────

@portfolio.command()
@click.option("--name",        "-n", required=True,  help="Project name.")
@click.option("--description", "-d", required=True,  help="Short description.")
@click.option("--type",        "-t", required=True,  help="Project type (e.g. microservice, ML, infra).")
@click.option("--tags",        multiple=True,         help="Tags (repeatable): --tags docker --tags k8s")
@click.option("--github",                            help="GitHub repository URL.")
@click.option("--status",      default="active",     type=click.Choice(["active","draft","archived"]))
@click.option("--published",   is_flag=True, default=True)
@click.option("--featured",    is_flag=True, default=False)
@click.option("--long-desc",   help="Long description (markdown supported).")
@click.option("--run-cmd",     help="Example run command.")
@click.option("--test-cmd",    help="Example test command.")
@click.option("--from-file",   type=click.Path(exists=True), help="Load project fields from JSON file.")
@click.help_option("--help", "-h")
def add(name, description, type, tags, github, status, published, featured,
        long_desc, run_cmd, test_cmd, from_file):
    """
    Add a new project to the portfolio (requires admin token).

    \b
    Examples:
      nexus portfolio add --name "MyService" --description "A great service" --type microservice --tags docker --tags k8s
      nexus portfolio add --from-file project.json
    """
    if from_file:
        payload = json.loads(Path(from_file).read_text())
    else:
        payload = {
            "name": name, "description": description, "type": type,
            "tags": list(tags), "status": status, "published": published,
            "featured": featured,
        }
        if github:   payload["githubUrl"]      = github
        if long_desc: payload["longDescription"] = long_desc
        if run_cmd:  payload["runCommand"]     = run_cmd
        if test_cmd: payload["testCommand"]    = test_cmd

    try:
        data = client.post("/api/projects", payload)
        console.print(f"[green]✓ Project created:[/] [cyan]{data['name']}[/] (id: {data['id'][:8]}…)")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}"); raise SystemExit(1)


# ── update ────────────────────────────────────────────────────────────────────

@portfolio.command()
@click.argument("project_id")
@click.option("--name",        help="New name.")
@click.option("--description", help="New description.")
@click.option("--status",      type=click.Choice(["active","draft","archived"]))
@click.option("--github",      help="New GitHub URL.")
@click.option("--tags",        multiple=True, help="Replace tags.")
@click.help_option("--help", "-h")
def update(project_id, name, description, status, github, tags):
    """
    Update fields of an existing project (requires admin token).

    \b
    Examples:
      nexus portfolio update abc123 --status archived
      nexus portfolio update abc123 --name "New Name" --tags api --tags rest
    """
    payload: dict = {}
    if name:        payload["name"] = name
    if description: payload["description"] = description
    if status:      payload["status"] = status
    if github:      payload["githubUrl"] = github
    if tags:        payload["tags"] = list(tags)
    if not payload:
        console.print("[yellow]No fields to update.[/]"); return
    try:
        data = client.patch(f"/api/projects/{project_id}", payload)
        console.print(f"[green]✓ Updated:[/] {data.get('name','—')}")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}"); raise SystemExit(1)


# ── remove ────────────────────────────────────────────────────────────────────

@portfolio.command()
@click.argument("project_id")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation.")
@click.help_option("--help", "-h")
def remove(project_id, yes):
    """
    Permanently remove a project from the portfolio (requires admin token).

    \b
    Examples:
      nexus portfolio remove abc123
      nexus portfolio remove abc123 --yes
    """
    if not yes:
        click.confirm(f"Delete project {project_id}?", abort=True)
    try:
        client.delete(f"/api/projects/{project_id}")
        console.print(f"[green]✓ Project {project_id} deleted.[/]")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}"); raise SystemExit(1)


# ── publish / unpublish ───────────────────────────────────────────────────────

@portfolio.command()
@click.argument("project_id")
@click.help_option("--help", "-h")
def publish(project_id):
    """Set project published=true (requires admin).\n\nExample: nexus portfolio publish abc123"""
    try:
        client.patch(f"/api/projects/{project_id}", {"published": True})
        console.print(f"[green]✓ Project {project_id} is now published.[/]")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")


@portfolio.command()
@click.argument("project_id")
@click.help_option("--help", "-h")
def unpublish(project_id):
    """Set project published=false (requires admin).\n\nExample: nexus portfolio unpublish abc123"""
    try:
        client.patch(f"/api/projects/{project_id}", {"published": False})
        console.print(f"[green]✓ Project {project_id} unpublished.[/]")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")


@portfolio.command()
@click.argument("project_id")
@click.option("--off", is_flag=True, help="Unfeature instead of feature.")
@click.help_option("--help", "-h")
def feature(project_id, off):
    """Toggle featured flag on a project.\n\nExample: nexus portfolio feature abc123"""
    try:
        client.patch(f"/api/projects/{project_id}", {"featured": not off})
        console.print(f"[green]✓ Project {project_id} {'un' if off else ''}featured.[/]")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")


# ── import / export ───────────────────────────────────────────────────────────

@portfolio.command("import")
@click.argument("json_file", type=click.Path(exists=True))
@click.option("--dry-run", is_flag=True, help="Validate without creating.")
@click.help_option("--help", "-h")
def import_projects(json_file, dry_run):
    """
    Bulk import projects from a JSON file (list of project objects).

    \b
    Examples:
      nexus portfolio import projects.json
      nexus portfolio import projects.json --dry-run
    """
    projects = json.loads(Path(json_file).read_text())
    if not isinstance(projects, list):
        projects = [projects]
    console.print(f"[cyan]Importing {len(projects)} projects{' (dry run)' if dry_run else ''}…[/]")
    for p in projects:
        if dry_run:
            console.print(f"  [dim]would create:[/] {p.get('name','?')}")
            continue
        try:
            data = client.post("/api/projects", p)
            console.print(f"  [green]✓[/] {data['name']}")
        except client.APIError as e:
            console.print(f"  [red]✗[/] {p.get('name','?')}: {e.detail}")


@portfolio.command("export")
@click.option("--output", "-o", default="portfolio-export.json", show_default=True)
@click.help_option("--help", "-h")
def export_projects(output):
    """
    Export all portfolio projects to a JSON file.

    \b
    Examples:
      nexus portfolio export
      nexus portfolio export --output my-projects.json
    """
    try:
        projects = client.get("/api/projects")
        Path(output).write_text(json.dumps(projects, indent=2, default=str))
        console.print(f"[green]✓ Exported {len(projects)} projects to {output}[/]")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")
