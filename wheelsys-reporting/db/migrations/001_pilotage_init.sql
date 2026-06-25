-- 001_pilotage_init.sql
-- Wheels Report — Dashboard de pilotage : schéma initial (Bloc 1)
-- Accès EXCLUSIF via la clé service_role (backend Vercel). RLS activé partout,
-- AUCUNE policy publique => anon/authenticated n'ont aucun accès.
-- Montants en numeric (jamais float). Ratios en numeric(5,4) : 0.0000 → 1.0000.

create extension if not exists pgcrypto;

-- ─── 1. Référentiel agences ──────────────────────────────────────────────────
create table if not exists public.agencies (
  code        text primary key,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── 2. Snapshots de conformité (agence × semaine ISO) ───────────────────────
create table if not exists public.compliance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  agency_code     text not null references public.agencies(code),
  iso_year        smallint not null,
  iso_week        smallint not null check (iso_week between 1 and 53),
  week_start      date not null,                 -- lundi de la semaine ISO
  contracts_total integer not null default 0,
  cautions_ok     integer not null default 0,    -- contrats avec pré-auth présente
  depart_ok       integer not null default 0,    -- contrats soldés (custbalance <= 0.01)
  score_cautions  numeric(5,4),                  -- cautions_ok / contracts_total
  score_depart    numeric(5,4),                  -- depart_ok   / contracts_total
  score_global    numeric(5,4),                  -- (w_c*sc + w_d*sd) / (w_c + w_d)
  created_at      timestamptz not null default now(),
  unique (agency_code, iso_year, iso_week)
);
create index if not exists idx_compliance_agency_week
  on public.compliance_snapshots (agency_code, iso_year, iso_week);

-- ─── 3. CA mensuel (agence × mois) ───────────────────────────────────────────
create table if not exists public.revenue_monthly (
  id              uuid primary key default gen_random_uuid(),
  agency_code     text not null references public.agencies(code),
  year            smallint not null,
  month           smallint not null check (month between 1 and 12),
  ca_ht           numeric(14,2),                 -- rempli après confirmation base HT
  ca_ttc          numeric(14,2),
  contracts_count integer not null default 0,
  source          text not null default 'backfill'
                  check (source in ('backfill','cron','manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (agency_code, year, month)
);
create index if not exists idx_revenue_agency_period
  on public.revenue_monthly (agency_code, year, month);

-- ─── 4. Objectifs CA (agence × mois) ─────────────────────────────────────────
create table if not exists public.revenue_targets (
  id          uuid primary key default gen_random_uuid(),
  agency_code text not null references public.agencies(code),
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  target_ht   numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_code, year, month)
);

-- ─── 5. Alertes conformité < seuil ───────────────────────────────────────────
create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  agency_code     text not null references public.agencies(code),
  iso_year        smallint not null,
  iso_week        smallint not null,
  score_global    numeric(5,4) not null,
  threshold       numeric(5,4) not null,
  status          text not null default 'open' check (status in ('open','ack')),
  channels_sent   jsonb not null default '[]'::jsonb,   -- ex: ["dashboard","email","slack"]
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  unique (agency_code, iso_year, iso_week)
);
create index if not exists idx_alerts_status
  on public.alerts (status, created_at desc);

-- ─── 6. Paramètres (seuil + pondérations) — ligne unique ─────────────────────
create table if not exists public.settings (
  id             smallint primary key default 1 check (id = 1),
  threshold      numeric(5,4) not null default 0.80,
  weight_caution numeric(5,4) not null default 0.50,
  weight_depart  numeric(5,4) not null default 0.50,
  updated_at     timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ─── updated_at automatique ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_revenue_monthly_touch before update on public.revenue_monthly
  for each row execute function public.touch_updated_at();
create trigger trg_revenue_targets_touch before update on public.revenue_targets
  for each row execute function public.touch_updated_at();

-- ─── RLS : activé partout, aucune policy publique ────────────────────────────
alter table public.agencies             enable row level security;
alter table public.compliance_snapshots enable row level security;
alter table public.revenue_monthly      enable row level security;
alter table public.revenue_targets      enable row level security;
alter table public.alerts               enable row level security;
alter table public.settings             enable row level security;
