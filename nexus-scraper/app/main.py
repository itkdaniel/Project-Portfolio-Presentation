"""
NexusScraper — FastAPI application factory.

Exposes:
  GET  /health
  GET  /info
  GET  /openapi.json   (auto-generated)
  /v1/scrape/*         (scrape jobs + trending)
  /v1/entities/*       (entity database)
  /v1/entity-types     (classification types)
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import close_db, get_session, init_db
from app.routers.entities import router as entities_router
from app.routers.scrape import router as scrape_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_START_TIME = time.time()
_scheduler: AsyncIOScheduler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    settings = get_settings()
    logger.info("Starting NexusScraper v%s on port %d", settings.version, settings.port)

    init_db()

    if settings.scheduler_enabled:
        _scheduler = AsyncIOScheduler()
        _scheduler.add_job(
            _run_trending_job,
            "interval",
            hours=settings.trending_interval_hours,
            id="trending_scrape",
            replace_existing=True,
        )
        _scheduler.start()
        logger.info("APScheduler started — trending every %dh", settings.trending_interval_hours)
    else:
        logger.info("In-process scheduler disabled")

    yield

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
    await close_db()
    logger.info("NexusScraper shut down cleanly")


async def _run_trending_job() -> None:
    from app.trending import run_trending_scrape
    try:
        async for session in get_session():
            result = await run_trending_scrape(session)
            logger.info("Scheduled trending scrape: %s", result)
    except Exception as exc:
        logger.error("Scheduled trending scrape failed: %s", exc)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="NexusScraper",
        version=settings.version,
        description=(
            "Web scraper microservice — crawls URLs, classifies entities via NLP pipeline, "
            "stores structured knowledge with embeddings; seeds trending from HN + Reddit every 6 h."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(scrape_router)
    app.include_router(entities_router)

    @app.get("/health", tags=["meta"])
    async def health():
        return {
            "status": "ok",
            "service": "nexus-scraper",
            "version": settings.version,
            "uptime": round(time.time() - _START_TIME, 2),
        }

    @app.get("/info", tags=["meta"])
    async def info():
        return {
            "name": "NexusScraper",
            "version": settings.version,
            "port": settings.port,
            "endpoints": [
                {"method": "GET",  "path": "/health",              "description": "Health check"},
                {"method": "GET",  "path": "/info",                "description": "Service info"},
                {"method": "POST", "path": "/v1/scrape/url",       "description": "Scrape a single URL"},
                {"method": "POST", "path": "/v1/scrape/onion",     "description": "Scrape a .onion URL via Tor"},
                {"method": "GET",  "path": "/v1/scrape/jobs",      "description": "List recent scrape jobs"},
                {"method": "GET",  "path": "/v1/scrape/jobs/{id}", "description": "Job detail with entities"},
                {"method": "POST", "path": "/v1/scrape/trending",  "description": "Trigger trending scrape"},
                {"method": "GET",  "path": "/v1/entities",         "description": "List entities (paginated)"},
                {"method": "GET",  "path": "/v1/entities/{id}",    "description": "Entity detail with relations"},
                {"method": "GET",  "path": "/v1/entity-types",     "description": "Entity classification types"},
                {"method": "GET",  "path": "/openapi.json",        "description": "OpenAPI schema"},
            ],
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=settings.debug)
