"""
nexus infra — Infrastructure lifecycle management.

Commands:
  start      Start all services (docker compose up)
  stop       Stop all services
  restart    Restart one or all services
  scale      Scale a service to N replicas
  status     Show running container status
  logs       Stream/tail logs for a service
  cleanup    Stop and remove containers + volumes
  k8s        Kubernetes subgroup (apply, delete, status, scale)
  build      Build Docker images
"""

import subprocess
import sys
import click
from rich.console import Console
from rich.table import Table
from rich import box

console = Console()

COMPOSE_FILE     = "docker-compose.yml"
COMPOSE_DEV_FILE = "docker-compose.dev.yml"
SERVICES = ["web", "python-service", "ai-service", "postgres", "redis", "mongo", "nginx"]


def _run(cmd: list[str], check=True, stream=False):
    """Run a subprocess, optionally streaming stdout."""
    console.print(f"[dim]$ {' '.join(cmd)}[/]")
    if stream:
        proc = subprocess.Popen(cmd, stdout=sys.stdout, stderr=sys.stderr)
        proc.wait()
        if check and proc.returncode != 0:
            raise SystemExit(proc.returncode)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.stdout:
            console.print(result.stdout)
        if result.stderr:
            console.print(f"[dim red]{result.stderr}[/]")
        if check and result.returncode != 0:
            raise SystemExit(result.returncode)
        return result


@click.group()
def infra():
    """Docker Compose and Kubernetes infrastructure lifecycle management."""
    pass


# ── start ─────────────────────────────────────────────────────────────────────

@infra.command()
@click.option("--dev",     is_flag=True, help="Use dev compose override (hot-reload).")
@click.option("--detach",  "-d", is_flag=True, default=True, show_default=True, help="Run in background.")
@click.option("--service", "-s", type=click.Choice(SERVICES), default=None, help="Start a specific service only.")
@click.option("--build",   "-b", is_flag=True, help="Rebuild images before starting.")
@click.help_option("--help", "-h")
def start(dev, detach, service, build):
    """
    Start all NexusConsult services via Docker Compose.

    \b
    Examples:
      nexus infra start
      nexus infra start --dev
      nexus infra start --build
      nexus infra start --service web
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE]
    if dev:
        cmd += ["-f", COMPOSE_DEV_FILE]
    cmd += ["up"]
    if detach:
        cmd += ["-d"]
    if build:
        cmd += ["--build"]
    if service:
        cmd.append(service)
    console.print(f"[cyan]Starting services{'(dev)' if dev else ''}…[/]")
    _run(cmd, stream=True)
    console.print("[green]✓ Services started.[/]")


# ── stop ──────────────────────────────────────────────────────────────────────

@infra.command()
@click.option("--service", "-s", type=click.Choice(SERVICES), default=None, help="Stop a specific service only.")
@click.help_option("--help", "-h")
def stop(service):
    """
    Stop all (or a specific) running services.

    \b
    Examples:
      nexus infra stop
      nexus infra stop --service ai-service
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "stop"]
    if service:
        cmd.append(service)
    _run(cmd, stream=True)
    console.print("[green]✓ Services stopped.[/]")


# ── restart ───────────────────────────────────────────────────────────────────

@infra.command()
@click.option("--service", "-s", type=click.Choice(SERVICES), default=None, help="Restart a specific service.")
@click.help_option("--help", "-h")
def restart(service):
    """
    Restart all (or a specific) services.

    \b
    Examples:
      nexus infra restart
      nexus infra restart --service web
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "restart"]
    if service:
        cmd.append(service)
    _run(cmd, stream=True)
    console.print("[green]✓ Services restarted.[/]")


# ── scale ─────────────────────────────────────────────────────────────────────

@infra.command()
@click.argument("service", type=click.Choice(SERVICES))
@click.argument("replicas", type=int)
@click.help_option("--help", "-h")
def scale(service, replicas):
    """
    Scale SERVICE to REPLICAS instances.

    \b
    Examples:
      nexus infra scale web 3
      nexus infra scale python-service 5
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "scale", f"{service}={replicas}"]
    _run(cmd, stream=True)
    console.print(f"[green]✓ {service} scaled to {replicas} replica(s).[/]")


# ── status ────────────────────────────────────────────────────────────────────

@infra.command()
@click.help_option("--help", "-h")
def status():
    """
    Show status of all running containers.

    \b
    Examples:
      nexus infra status
    """
    _run(["docker", "compose", "-f", COMPOSE_FILE, "ps"], stream=True)


# ── logs ──────────────────────────────────────────────────────────────────────

@infra.command()
@click.argument("service", type=click.Choice(SERVICES))
@click.option("--tail", "-n", type=int, default=100, show_default=True, help="Number of lines to show.")
@click.option("--follow", "-f", is_flag=True, help="Follow log output (streaming).")
@click.help_option("--help", "-h")
def logs(service, tail, follow):
    """
    View logs for a specific SERVICE.

    \b
    Examples:
      nexus infra logs web --tail 50
      nexus infra logs ai-service --follow
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "logs", f"--tail={tail}"]
    if follow:
        cmd.append("-f")
    cmd.append(service)
    _run(cmd, stream=True)


# ── cleanup ───────────────────────────────────────────────────────────────────

@infra.command()
@click.option("--volumes", "-v", is_flag=True, help="Also remove named volumes (destroys data).")
@click.option("--yes", "-y", is_flag=True,     help="Skip confirmation prompt.")
@click.help_option("--help", "-h")
def cleanup(volumes, yes):
    """
    Stop and remove all containers, networks, and optionally volumes.

    \b
    Examples:
      nexus infra cleanup
      nexus infra cleanup --volumes --yes
    """
    if not yes:
        msg = "Remove all containers" + (" AND volumes (data loss!)" if volumes else "") + "?"
        click.confirm(msg, abort=True)
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "down"]
    if volumes:
        cmd.append("-v")
    _run(cmd, stream=True)
    console.print("[green]✓ Cleanup complete.[/]")


# ── build ─────────────────────────────────────────────────────────────────────

@infra.command()
@click.option("--service", "-s", type=click.Choice(["web", "python-service", "ai-service"]),
              default=None, help="Build a specific service image.")
@click.option("--no-cache", is_flag=True, help="Disable Docker layer cache.")
@click.help_option("--help", "-h")
def build(service, no_cache):
    """
    Build Docker images for the project.

    \b
    Examples:
      nexus infra build
      nexus infra build --service ai-service --no-cache
    """
    cmd = ["docker", "compose", "-f", COMPOSE_FILE, "build"]
    if no_cache:
        cmd.append("--no-cache")
    if service:
        cmd.append(service)
    _run(cmd, stream=True)
    console.print("[green]✓ Build complete.[/]")


# ── k8s subgroup ─────────────────────────────────────────────────────────────

@infra.group()
def k8s():
    """Kubernetes cluster management (apply, delete, status, scale, logs)."""
    pass


@k8s.command()
@click.option("--dir", "manifest_dir", default="k8s", show_default=True, help="K8s manifests directory.")
@click.help_option("--help", "-h")
def apply(manifest_dir):
    """
    Apply all Kubernetes manifests to the cluster.

    \b
    Examples:
      nexus infra k8s apply
      nexus infra k8s apply --dir k8s/staging
    """
    _run(["kubectl", "apply", "-f", manifest_dir], stream=True)


@k8s.command()
@click.option("--dir", "manifest_dir", default="k8s", show_default=True, help="K8s manifests directory.")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation.")
@click.help_option("--help", "-h")
def delete(manifest_dir, yes):
    """
    Delete Kubernetes resources defined in manifests.

    \b
    Examples:
      nexus infra k8s delete
    """
    if not yes:
        click.confirm("Delete all K8s resources?", abort=True)
    _run(["kubectl", "delete", "-f", manifest_dir], stream=True)


@k8s.command("status")
@click.option("--namespace", "-n", default="nexus", show_default=True)
@click.help_option("--help", "-h")
def k8s_status(namespace):
    """
    Show pod status in the nexus namespace.

    \b
    Examples:
      nexus infra k8s status
    """
    _run(["kubectl", "get", "pods", "-n", namespace, "-o", "wide"], stream=True)


@k8s.command("scale")
@click.argument("deployment")
@click.argument("replicas", type=int)
@click.option("--namespace", "-n", default="nexus", show_default=True)
@click.help_option("--help", "-h")
def k8s_scale(deployment, replicas, namespace):
    """
    Scale a Kubernetes DEPLOYMENT to REPLICAS.

    \b
    Examples:
      nexus infra k8s scale web-deployment 5
      nexus infra k8s scale python-deployment 3 -n nexus
    """
    _run(["kubectl", "scale", "deployment", deployment,
          f"--replicas={replicas}", "-n", namespace], stream=True)
