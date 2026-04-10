#!/usr/bin/env python3
"""
nexus — NexusConsult CLI

Comprehensive command-line interface for the NexusConsult automation consulting
platform. Manages API endpoints, infrastructure, portfolio projects, AI/ML
pipelines, and role-based data access — all from a single binary.

\b
QUICKSTART
  nexus auth login                        # authenticate
  nexus portfolio list                    # view portfolio
  nexus api get /api/projects             # raw API access
  nexus infra start                       # start Docker services
  nexus data scrape wikipedia --rating G  # collect data (role-gated)
  nexus model train data/corpus           # train a model
  nexus ai classify "some text"           # AI inference

\b
ROLE SYSTEM
  Corporate roles 1–8 gate access to data sources and model operations.
  Run `nexus auth roles` to see the full hierarchy.

\b
CONFIG
  Token and API URL are stored in ~/.nexus/config.json
  Override with: NEXUS_TOKEN, NEXUS_API_URL, NEXUS_ROLE_ID env vars
"""

import click
from rich.console import Console
from rich.panel import Panel
from rich import box

from commands.auth      import auth
from commands.api       import api
from commands.infra     import infra
from commands.portfolio import portfolio
from commands.data      import data
from commands.model     import model
from commands.ai        import ai

console = Console()

BANNER = """
[bold blue] _   _                      [/][bold cyan]  ____                      _ _   [/]
[bold blue]| \\ | | _____  ___   _ ___ [/][bold cyan] / ___|___  _ __  ___ _   _| | |_ [/]
[bold blue]|  \\| |/ _ \\ \\/ / | | / __|[/][bold cyan]| |   / _ \\| '_ \\/ __| | | | | __|[/]
[bold blue]| |\\  |  __/>  <| |_| \\__ \\[/][bold cyan]| |__| (_) | | | \\__ \\ |_| | | |_ [/]
[bold blue]|_| \\_|\\___/_/\\_\\\\__,_|___/[/][bold cyan] \\____\\___/|_| |_|___/\\__,_|_|\\__|[/]
"""


@click.group(invoke_without_command=True)
@click.option("--version", "-V", is_flag=True, help="Print version and exit.")
@click.pass_context
def cli(ctx, version):
    """
    nexus — NexusConsult automation consulting platform CLI.

    Manage API endpoints, Docker/K8s infrastructure, portfolio projects,
    AI/ML pipelines, and corporate role-based data access.

    \b
    Run any command with --help / -h for detailed usage and examples.
    """
    if version:
        console.print("[bold cyan]nexus[/] v1.0.0 — NexusConsult CLI")
        return
    if ctx.invoked_subcommand is None:
        console.print(BANNER)
        console.print(Panel(
            "[bold]nexus[/] is the unified CLI for the NexusConsult platform.\n\n"
            "  [cyan]nexus auth login[/]              Authenticate\n"
            "  [cyan]nexus api endpoints[/]           List all API routes\n"
            "  [cyan]nexus portfolio list[/]          View portfolio projects\n"
            "  [cyan]nexus infra start[/]             Start Docker services\n"
            "  [cyan]nexus data ratings[/]            View data access tiers\n"
            "  [cyan]nexus model train data/corpus[/] Train an AI model\n"
            "  [cyan]nexus ai search \"query\"[/]       Semantic project search\n\n"
            "Run [cyan]nexus <command> --help[/] for detailed usage.",
            title="NexusConsult CLI", border_style="blue"
        ))


# Register subcommand groups
cli.add_command(auth)
cli.add_command(api)
cli.add_command(infra)
cli.add_command(portfolio)
cli.add_command(data)
cli.add_command(model)
cli.add_command(ai)


if __name__ == "__main__":
    cli()
