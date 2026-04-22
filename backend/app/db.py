import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.core.config import get_settings


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    remote_policy TEXT NOT NULL,
    jd_text TEXT NOT NULL,
    jd_url TEXT NOT NULL,
    posted_at TEXT,
    ingested_at TEXT NOT NULL,
    UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    rubric_version TEXT NOT NULL,
    total REAL NOT NULL,
    dim_role_fit REAL NOT NULL,
    dim_domain_leverage REAL NOT NULL,
    dim_comp_level REAL NOT NULL,
    dim_company_stage REAL NOT NULL,
    dim_logistics REAL NOT NULL,
    top_reasons TEXT NOT NULL,
    rationale TEXT NOT NULL,
    scored_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connector_health (
    connector TEXT PRIMARY KEY,
    last_success_at TEXT,
    last_error TEXT
);
"""


def initialize_database() -> None:
    settings = get_settings()
    settings.database_file.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(settings.database_file) as connection:
        connection.executescript(SCHEMA)


@contextmanager
def get_connection():
    settings = get_settings()
    initialize_database()
    connection = sqlite3.connect(settings.database_file)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

