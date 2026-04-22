create table if not exists jobs (
    id text primary key,
    source text not null,
    external_id text not null,
    company text not null,
    title text not null,
    location text not null,
    remote_policy text not null,
    jd_text text not null,
    jd_url text not null,
    posted_at timestamptz null,
    salary_min double precision null,
    salary_max double precision null,
    salary_currency text null,
    salary_period text null,
    ingested_at timestamptz not null default now(),
    unique (source, external_id)
);

create index if not exists idx_jobs_ingested_at on jobs (ingested_at desc);
create index if not exists idx_jobs_company on jobs (company);
create index if not exists idx_jobs_source on jobs (source);

create table if not exists connector_health (
    connector text primary key,
    last_success_at timestamptz null,
    last_error text null
);

create table if not exists profiles (
    id text primary key,
    primary_job_family text not null,
    seniority_level text not null,
    years_experience_bucket text not null,
    compensation_floor integer null,
    company_stage_preference text not null,
    career_priority text not null,
    updated_at timestamptz not null default now()
);

create table if not exists job_attributes (
    job_id text primary key references jobs (id) on delete cascade,
    job_family text not null,
    seniority_level text not null,
    years_required_min integer null,
    years_required_max integer null,
    compensation_known boolean not null default false,
    compensation_min double precision null,
    compensation_max double precision null,
    compensation_currency text null,
    compensation_period text null,
    company_stage text not null,
    learning_signal double precision not null default 0,
    ownership_signal double precision not null default 0,
    extracted_at timestamptz not null default now()
);

create table if not exists fit_scores (
    id text primary key,
    job_id text unique not null references jobs (id) on delete cascade,
    rubric_version text not null,
    total double precision not null,
    dim_job_family_fit double precision not null,
    dim_level_fit double precision not null,
    dim_career_value_fit double precision not null,
    dim_compensation_fit double precision not null,
    dim_company_stage_fit double precision not null,
    top_reasons jsonb not null default '[]'::jsonb,
    rationale text not null,
    scored_at timestamptz not null default now()
);

create index if not exists idx_fit_scores_total on fit_scores (total desc);
create index if not exists idx_fit_scores_scored_at on fit_scores (scored_at desc);

create table if not exists actions (
    id text primary key,
    job_id text not null references jobs (id) on delete cascade,
    type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_actions_job_created_at on actions (job_id, created_at desc);

create table if not exists google_oauth_states (
    state text primary key,
    created_at timestamptz not null default now()
);

create table if not exists google_tokens (
    id text primary key,
    access_token text null,
    refresh_token text null,
    token_type text null,
    scope text null,
    expiry_date timestamptz null,
    email_from text null,
    updated_at timestamptz not null default now()
);

create or replace view job_search_rows as
select
    j.id as job_id,
    j.source,
    j.external_id,
    j.company,
    j.title,
    j.location,
    j.remote_policy,
    j.jd_text,
    j.jd_url,
    j.posted_at,
    j.salary_min,
    j.salary_max,
    j.salary_currency,
    j.salary_period,
    j.ingested_at,
    s.id as score_id,
    s.rubric_version,
    s.total,
    s.dim_job_family_fit,
    s.dim_level_fit,
    s.dim_career_value_fit,
    s.dim_compensation_fit,
    s.dim_company_stage_fit,
    s.top_reasons,
    s.rationale,
    s.scored_at,
    a.job_family,
    a.seniority_level as attr_seniority_level,
    a.years_required_min,
    a.years_required_max,
    a.compensation_known,
    a.compensation_min,
    a.compensation_max,
    a.compensation_currency,
    a.compensation_period,
    a.company_stage,
    a.learning_signal,
    a.ownership_signal,
    a.extracted_at,
    coalesce(latest_action.type, 'unreviewed') as latest_action_status,
    latest_action.created_at as latest_action_created_at
from jobs j
left join fit_scores s on s.job_id = j.id
left join job_attributes a on a.job_id = j.id
left join lateral (
    select ac.type, ac.created_at
    from actions ac
    where ac.job_id = j.id
    order by ac.created_at desc
    limit 1
) latest_action on true;
