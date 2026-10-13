-- =========================================================================
-- Baby Yana's Task Tracker - Supabase Database Setup & Migration
-- =========================================================================
-- 1. Go to your Supabase project dashboard (https://supabase.com/dashboard)
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query", paste everything below, and click "Run" (▶)
-- =========================================================================

-- Create tasks table if it does not exist
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'daily',
  title       text not null,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  task_date   date,          -- scheduled date (e.g. '2026-10-13')
  task_month  text,          -- optional month tag
  due_date    date,          -- optional due date
  due_time    time,          -- optional scheduled time
  notes       text,          -- description / notes / checklist
  deadline    timestamptz,   -- deadline date & time
  priority    text not null default 'medium' check (priority in ('low','medium','high')),
  parent_id   uuid references public.tasks(id) on delete cascade, -- for projects and subtasks
  created_at  timestamptz not null default now()
);

-- Migration steps for existing tables (safe & idempotent):
-- Add priority column if not yet present
alter table public.tasks add column if not exists priority text not null default 'medium';

-- Add parent_id column if not yet present
alter table public.tasks add column if not exists parent_id uuid references public.tasks(id) on delete cascade;

-- Update constraint to support all task types: daily, project, subtask, reading, monthly
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check check (type in ('daily', 'monthly', 'reading', 'project', 'subtask'));

-- Indexes for lightning fast queries
create index if not exists tasks_type_date_idx   on public.tasks (type, task_date);
create index if not exists tasks_parent_id_idx   on public.tasks (parent_id);
create index if not exists tasks_priority_idx    on public.tasks (priority);

-- Row Level Security (RLS) for personal use
alter table public.tasks enable row level security;
drop policy if exists "personal use: anon full access" on public.tasks;
create policy "personal use: anon full access" on public.tasks
  for all to anon using (true) with check (true);

-- Enable real-time updates across multiple devices (phone, laptop, desktop)
alter publication supabase_realtime add table public.tasks;
