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

create or replace function search_jobs(
    p_q text default null,
    p_location text default null,
    p_min_score double precision default 0,
    p_max_score double precision default null,
    p_remote_policies text[] default null,
    p_date_posted_days integer default null,
    p_action_statuses text[] default null,
    p_sort text default 'top',
    p_limit integer default 200,
    p_max_years_required integer default null,
    p_min_compensation integer default null,
    p_seniority_levels text[] default null,
    p_company_stages text[] default null,
    p_hide_unknown_compensation boolean default false
)
returns setof job_search_rows
language sql
stable
as $$
    with filtered as (
        select
            jsr.*,
            coalesce(
                (
                    select sum(
                        (case when lower(jsr.title) like '%' || term || '%' then 6 else 0 end) +
                        (case when lower(jsr.company) like '%' || term || '%' then 3 else 0 end) +
                        (case when lower(jsr.jd_text) like '%' || term || '%' then 1 else 0 end)
                    )::integer
                    from unnest(regexp_split_to_array(lower(trim(coalesce(p_q, ''))), '\s+')) as term
                    where term <> ''
                ),
                0
            ) as relevance_score
        from job_search_rows jsr
        where jsr.total is not null
          and jsr.total >= coalesce(p_min_score, 0)
          and (p_max_score is null or jsr.total <= p_max_score)
          and (coalesce(array_length(p_remote_policies, 1), 0) = 0 or jsr.remote_policy = any(p_remote_policies))
          and (
              p_date_posted_days is null
              or (jsr.posted_at is not null and jsr.posted_at >= now() - make_interval(days => p_date_posted_days))
          )
          and (
              p_location is null
              or btrim(p_location) = ''
              or not exists (
                  select 1
                  from unnest(regexp_split_to_array(lower(trim(p_location)), '\s+')) as term
                  where term <> ''
                    and lower(jsr.location) not like '%' || term || '%'
              )
          )
          and (
              p_q is null
              or btrim(p_q) = ''
              or not exists (
                  select 1
                  from unnest(regexp_split_to_array(lower(trim(p_q)), '\s+')) as term
                  where term <> ''
                    and not (
                        lower(jsr.title) like '%' || term || '%'
                        or lower(jsr.company) like '%' || term || '%'
                        or lower(jsr.jd_text) like '%' || term || '%'
                    )
              )
          )
          and (coalesce(array_length(p_action_statuses, 1), 0) = 0 or jsr.latest_action_status = any(p_action_statuses))
          and (
              p_max_years_required is null
              or jsr.years_required_min is null
              or jsr.years_required_min <= p_max_years_required
          )
          and (
              (
                  p_min_compensation is null
                  and (not p_hide_unknown_compensation or coalesce(jsr.compensation_known, false))
              )
              or (
                  p_min_compensation is not null
                  and (
                      case
                          when p_hide_unknown_compensation then
                              coalesce(jsr.compensation_known, false)
                              and coalesce(jsr.compensation_max, jsr.compensation_min, 0) >= p_min_compensation
                          else
                              not coalesce(jsr.compensation_known, false)
                              or coalesce(jsr.compensation_max, jsr.compensation_min, 0) >= p_min_compensation
                      end
                  )
              )
          )
          and (
              coalesce(array_length(p_seniority_levels, 1), 0) = 0
              or coalesce(jsr.attr_seniority_level, 'unknown') = any(p_seniority_levels)
          )
          and (
              coalesce(array_length(p_company_stages, 1), 0) = 0
              or coalesce(jsr.company_stage, 'unknown') = any(p_company_stages)
          )
    )
    select
        job_id,
        source,
        external_id,
        company,
        title,
        location,
        remote_policy,
        jd_text,
        jd_url,
        posted_at,
        salary_min,
        salary_max,
        salary_currency,
        salary_period,
        ingested_at,
        score_id,
        rubric_version,
        total,
        dim_job_family_fit,
        dim_level_fit,
        dim_career_value_fit,
        dim_compensation_fit,
        dim_company_stage_fit,
        top_reasons,
        rationale,
        scored_at,
        job_family,
        attr_seniority_level,
        years_required_min,
        years_required_max,
        compensation_known,
        compensation_min,
        compensation_max,
        compensation_currency,
        compensation_period,
        company_stage,
        learning_signal,
        ownership_signal,
        extracted_at,
        latest_action_status,
        latest_action_created_at
    from filtered
    order by
        case when p_sort = 'newest' then coalesce(extract(epoch from posted_at), 0) end desc,
        case when p_sort = 'recent' then extract(epoch from ingested_at) end desc,
        case
            when p_sort = 'relevance' then relevance_score
            when p_sort = 'top' and coalesce(nullif(btrim(coalesce(p_q, '')), ''), '') <> '' then relevance_score
        end desc,
        case
            when p_sort in ('top', 'relevance', 'newest', 'recent') then total
        end desc,
        ingested_at desc
    limit greatest(coalesce(p_limit, 200), 1);
$$;

create or replace function get_job_search_row(p_job_id text)
returns setof job_search_rows
language sql
stable
as $$
    select *
    from job_search_rows
    where job_id = p_job_id
      and total is not null
    limit 1;
$$;
