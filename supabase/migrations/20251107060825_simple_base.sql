-- 旧テーブルを削除（ローカル環境の簡素化用途）
drop table if exists article_category cascade;
drop table if exists category cascade;
drop table if exists article cascade;
drop table if exists agent cascade;

-- UUID生成に必要
create extension if not exists pgcrypto;

-- =======================================
-- 1. daily_report_runs: 日次集計のヘッダー
-- =======================================
create table if not exists daily_report_runs (
    id uuid primary key default gen_random_uuid(),
    feed_id text not null,
    feed_title text not null,
    feed_url text not null,
    feed_description text,
    generated_at timestamp with time zone not null,
    item_count integer not null default 0,
    composed_title text not null,
    composed_body text not null,
    raw_report jsonb not null,
    created_at timestamp with time zone not null default now()
);

-- =======================================
-- 2. daily_report_items: 個別記事の要約
-- =======================================
create table if not exists daily_report_items (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references daily_report_runs(id) on delete cascade,
    source_url text not null,
    source_headline text not null,
    source_published text,
    summary_headline text not null,
    summary_body text not null,
    key_points jsonb not null default '[]'::jsonb,
    positive_view text,
    critical_view text,
    synthesized_view text,
    created_at timestamp with time zone not null default now()
);

create index if not exists idx_daily_report_items_run_id on daily_report_items(run_id);
