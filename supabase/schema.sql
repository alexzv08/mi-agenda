-- Mi Agenda · esquema de base de datos para Supabase
-- Ejecuta este archivo entero en Supabase → SQL Editor → New query → Run.
-- Cada usuario solo puede ver y modificar sus propias filas (Row Level Security).

-- Hábitos: cosas que se repiten ciertos días de la semana
create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  when_slot   text check (when_slot in ('m', 'd', 't', 'n')),      -- mañana, durante el día, tarde, noche
  days        smallint[],                                             -- 0 = lunes … 6 = domingo; null = todos los días
  start_day   date not null default current_date,                     -- desde cuándo cuenta para las métricas
  created_at  timestamptz not null default now()
);

-- Registro de hábitos hechos: una fila por hábito y día cumplido
create table if not exists public.habit_logs (
  habit_id    uuid not null references public.habits (id) on delete cascade,
  day         date not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists habit_logs_user_day on public.habit_logs (user_id, day);

-- Tareas: con fecha (de un día concreto) o sin fecha (lista de pendientes)
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 500),
  day         date,
  done        boolean not null default false,
  done_day    date,
  created_at  timestamptz not null default now()
);
create index if not exists todos_user_day on public.todos (user_id, day);

-- Nota libre de cada día
create table if not exists public.notes (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  text        text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- Preferencias del usuario
create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan_loaded boolean not null default false
);

-- Seguridad: cada persona solo accede a lo suyo
alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;
alter table public.todos      enable row level security;
alter table public.notes      enable row level security;
alter table public.settings   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_logs', 'todos', 'notes', 'settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Un registro solo puede apuntar a un hábito del mismo usuario
create or replace function public.check_log_owner() returns trigger
language plpgsql security invoker as $$
begin
  if not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
    raise exception 'habit does not belong to user';
  end if;
  return new;
end $$;
drop trigger if exists habit_logs_owner on public.habit_logs;
create trigger habit_logs_owner before insert or update on public.habit_logs
  for each row execute function public.check_log_owner();
