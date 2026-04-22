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
    salary_min REAL,
    salary_max REAL,
    salary_currency TEXT,
    salary_period TEXT,
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

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    primary_job_family TEXT NOT NULL,
    seniority_level TEXT NOT NULL,
    years_experience_bucket TEXT NOT NULL,
    compensation_floor INTEGER,
    company_stage_preference TEXT NOT NULL,
    career_priority TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_attributes (
    job_id TEXT PRIMARY KEY,
    job_family TEXT NOT NULL,
    seniority_level TEXT NOT NULL,
    years_required_min INTEGER,
    years_required_max INTEGER,
    compensation_known INTEGER NOT NULL DEFAULT 0,
    compensation_min REAL,
    compensation_max REAL,
    compensation_currency TEXT,
    compensation_period TEXT,
    company_stage TEXT NOT NULL,
    learning_signal REAL NOT NULL,
    ownership_signal REAL NOT NULL,
    extracted_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fit_scores (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    rubric_version TEXT NOT NULL,
    total REAL NOT NULL,
    dim_job_family_fit REAL NOT NULL,
    dim_level_fit REAL NOT NULL,
    dim_career_value_fit REAL NOT NULL,
    dim_compensation_fit REAL NOT NULL,
    dim_company_stage_fit REAL NOT NULL,
    top_reasons TEXT NOT NULL,
    rationale TEXT NOT NULL,
    scored_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
"""


def initialize_database() -> None:
    settings = get_settings()
    settings.database_file.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(settings.database_file) as connection:
        connection.executescript(SCHEMA)
        _apply_job_column_migrations(connection)


def _apply_job_column_migrations(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(jobs)").fetchall()
    }
    migrations = {
        "salary_min": "ALTER TABLE jobs ADD COLUMN salary_min REAL",
        "salary_max": "ALTER TABLE jobs ADD COLUMN salary_max REAL",
        "salary_currency": "ALTER TABLE jobs ADD COLUMN salary_currency TEXT",
        "salary_period": "ALTER TABLE jobs ADD COLUMN salary_period TEXT",
    }
    for column, statement in migrations.items():
        if column not in existing_columns:
            connection.execute(statement)


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
