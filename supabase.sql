-- Paste this into Supabase > SQL Editor > New query > Run
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('daily','monthly')),
  title       text not null,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  task_date   date,          -- daily tasks
  task_month  text,          -- monthly tasks, e.g. '2026-10'
  due_date    date,          -- optional date for monthly tasks
  due_time    time,          -- optional time for daily tasks
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_type_date_idx  on public.tasks (type, task_date);
create index if not exists tasks_type_month_idx on public.tasks (type, task_month);

-- No login: allow the public (anon) key to read and write this table.
alter table public.tasks enable row level security;
drop policy if exists "personal use: anon full access" on public.tasks;
create policy "personal use: anon full access" on public.tasks
  for all to anon using (true) with check (true);
