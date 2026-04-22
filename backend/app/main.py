from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import initialize_database


configure_logging()
settings = get_settings()

app = FastAPI(title="Job Search Assistant API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        str(settings.frontend_origin).rstrip("/"),
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_origin_regex=r"https://([a-z0-9-]+\.)?job-search-vz\.pages\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    initialize_database()
