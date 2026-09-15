from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.app.core.config import settings
from backend.app.core.db import init_db
from alert_engine.telegram_bot import init_telegram_bot
from backend.app.api.v1.triage import router as triage_router
from backend.app.api.v1.telemetry import router as telemetry_router
from backend.app.api.v1.paramedic import router as paramedic_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    init_telegram_bot()
    yield
    # Shutdown

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Open-Source Industrial-Grade Emergency Triage & Continuous Physiological Telemetry Platform",
    lifespan=lifespan
)

# CORS Configuration for local Next.js / Mobile access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import FileResponse
from pathlib import Path

# Mount local storage directory for static file access
app.mount("/storage", StaticFiles(directory=str(settings.STORAGE_LOCAL_DIR)), name="storage")

# Include API Routers
app.include_router(triage_router, prefix="/api/v1")
app.include_router(telemetry_router, prefix="/api/v1")
app.include_router(paramedic_router, prefix="/api/v1")

STATIC_INDEX = Path(__file__).resolve().parent / "static" / "index.html"

@app.get("/")
async def root():
    if STATIC_INDEX.exists():
        return FileResponse(STATIC_INDEX)
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs_url": "/docs"
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
