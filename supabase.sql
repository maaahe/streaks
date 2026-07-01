create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{"habits":[],"habitDays":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state disable row level security;
