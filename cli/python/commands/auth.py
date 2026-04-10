"""
nexus auth — Authentication and session management commands.

Commands:
  login     Authenticate and store token
  logout    Clear stored credentials
  whoami    Display current session info
  token     Print current auth token
  roles     List all corporate role tiers and data permissions
  set-role  Update a user's corporate role (admin/owner/creator only)
"""

import click
from rich.console import Console
from rich.table import Table
from rich import box

from ..lib import client, config
from ..lib.roles import list_roles, DATA_RATINGS, CORP_ROLES

console = Console()


@click.group()
def auth():
    """Authentication, session management, and role hierarchy."""
    pass


# ── login ─────────────────────────────────────────────────────────────────────

@auth.command()
@click.option("--email",    "-e", prompt=True,                   help="Account email address.")
@click.option("--password", "-p", prompt=True, hide_input=True,  help="Account password.")
@click.option("--api-url",  "-u", default=None,                  help="Override API base URL.")
@click.help_option("--help", "-h")
def login(email, password, api_url):
    """
    Authenticate with the NexusConsult API and store the JWT token.

    \b
    Examples:
      nexus auth login
      nexus auth login -e admin@nexusconsult.dev -p "Admin@Nexus2024!"
      nexus auth login --api-url http://prod.example.com
    """
    if api_url:
        config.save({"api_url": api_url})
    try:
        data = client.post("/api/auth/login", {"email": email, "password": password})
        token    = data["token"]
        user     = data["user"]
        role_id  = user.get("corpRoleId", 1)
        config.save({
            "token":    token,
            "username": user["email"],
            "role_id":  role_id,
        })
        corp_role = CORP_ROLES.get(role_id)
        console.print(f"\n[bold green]✓ Logged in[/] as [cyan]{user['email']}[/]")
        console.print(f"  Platform role : [yellow]{user['role']}[/]")
        console.print(f"  Corp role     : [magenta]{corp_role.display_name if corp_role else 'unknown'}[/] (level {role_id})")
        console.print(f"  Data rating   : [blue]{corp_role.data_rating if corp_role else '—'}[/]\n")
    except client.APIError as e:
        console.print(f"[red]Login failed:[/] {e.detail}")
        raise SystemExit(1)


# ── logout ────────────────────────────────────────────────────────────────────

@auth.command()
@click.help_option("--help", "-h")
def logout():
    """
    Clear stored credentials from the local config file.

    \b
    Examples:
      nexus auth logout
    """
    config.clear()
    console.print("[green]✓ Logged out. Token cleared.[/]")


# ── whoami ────────────────────────────────────────────────────────────────────

@auth.command()
@click.help_option("--help", "-h")
def whoami():
    """
    Display current authenticated user and role permissions.

    \b
    Examples:
      nexus auth whoami
    """
    tok = config.token()
    if not tok:
        console.print("[yellow]Not logged in.[/] Run: [cyan]nexus auth login[/]")
        return
    try:
        data      = client.get("/api/auth/me")
        role_id   = data.get("corpRoleId", 1)
        corp_role = CORP_ROLES.get(role_id)

        t = Table(show_header=False, box=box.ROUNDED, border_style="blue")
        t.add_column("Key",   style="cyan",  min_width=18)
        t.add_column("Value", style="white")
        t.add_row("Email",       data.get("email", "—"))
        t.add_row("Username",    data.get("username", "—"))
        t.add_row("Platform role", data.get("role", "—"))
        if corp_role:
            t.add_row("Corp role",   f"{corp_role.display_name} (level {role_id})")
            t.add_row("Data rating", corp_role.data_rating)
        t.add_row("API URL",     config.api_url())
        console.print(t)
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")


# ── token ─────────────────────────────────────────────────────────────────────

@auth.command()
@click.help_option("--help", "-h")
def token():
    """
    Print the stored JWT token (for scripting/piping).

    \b
    Examples:
      nexus auth token
      TOKEN=$(nexus auth token)
    """
    tok = config.token()
    if tok:
        click.echo(tok)
    else:
        console.print("[yellow]No token stored.[/] Run: [cyan]nexus auth login[/]")
        raise SystemExit(1)


# ── roles ─────────────────────────────────────────────────────────────────────

@auth.command()
@click.option("--id", "role_id", type=int, default=None, help="Show detail for a specific role ID.")
@click.help_option("--help", "-h")
def roles(role_id):
    """
    List corporate role hierarchy and associated data-access ratings.

    Roles are identified by integer IDs (1=lowest, 8=creator/highest).
    Each role tier maps to a data-rating that defines what sources may be
    scraped and used for AI/ML training.

    \b
    Examples:
      nexus auth roles
      nexus auth roles --id 4
    """
    if role_id is not None:
        role = CORP_ROLES.get(role_id)
        if not role:
            console.print(f"[red]No role with ID {role_id}[/]")
            return
        rating = DATA_RATINGS[role.data_rating]
        console.print(f"\n[bold cyan]Role #{role.id} — {role.display_name}[/]")
        console.print(f"  Data rating : [magenta]{role.data_rating}[/] — {rating.name}")
        console.print(f"  Description : {role.description}")
        console.print(f"\n[bold]Allowed data sources:[/]")
        for src in rating.allowed_sources:
            console.print(f"  [green]•[/] {src}")
        console.print(f"\n[dim]Docker AI hint:[/] {rating.docker_ai_hint}")
        return

    t = Table(title="NexusConsult Corporate Role Hierarchy", box=box.ROUNDED, border_style="cyan")
    t.add_column("ID",           style="bold white", justify="right", min_width=4)
    t.add_column("Role",         style="cyan",        min_width=20)
    t.add_column("Data Rating",  style="magenta",     min_width=10)
    t.add_column("Description",  style="white")
    for role in list_roles():
        rating_color = {
            "G": "green", "PG": "blue", "PG-13": "yellow",
            "R": "orange1", "NC-17": "red", "Unrated": "magenta", "None": "bold red",
        }.get(role.data_rating, "white")
        t.add_row(
            str(role.id),
            role.display_name,
            f"[{rating_color}]{role.data_rating}[/]",
            role.description,
        )
    console.print(t)
    console.print("\n[dim]Use [cyan]nexus auth roles --id N[/] to see full allowed-sources for a tier.[/]\n")


# ── set-role ──────────────────────────────────────────────────────────────────

@auth.command("set-role")
@click.argument("user_email")
@click.argument("role_id", type=int)
@click.help_option("--help", "-h")
def set_role(user_email, role_id):
    """
    Update USER_EMAIL's corporate role to ROLE_ID (1–8).

    Requires admin, owner, or creator platform role.

    \b
    Examples:
      nexus auth set-role alice@company.com 3
      nexus auth set-role bob@company.com 8
    """
    if role_id not in CORP_ROLES:
        console.print(f"[red]Invalid role ID {role_id}. Must be 1–8.[/]")
        raise SystemExit(1)
    try:
        data = client.patch(f"/api/users/role", {"email": user_email, "corpRoleId": role_id})
        console.print(f"[green]✓[/] Updated [cyan]{user_email}[/] → role {role_id} ({CORP_ROLES[role_id].display_name})")
    except client.APIError as e:
        console.print(f"[red]Error:[/] {e.detail}")
        raise SystemExit(1)
