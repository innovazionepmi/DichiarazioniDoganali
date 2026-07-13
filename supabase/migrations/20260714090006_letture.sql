-- Una riga per contatore/periodo (brief §3.6). `valore_periodo` è sempre
-- F1+F2+F3: colonna generata per evitare che si scolleghi dai tre valori.
create type origine_lettura_enum as enum ('csv', 'pdf_stampa', 'screenshot', 'manuale');

create table letture (
  id uuid primary key default gen_random_uuid(),
  contatore_id uuid not null references contatori (id) on delete restrict,
  periodo_mese int not null check (periodo_mese between 1 and 12),
  periodo_anno int not null,
  valore_f1 numeric,
  valore_f2 numeric,
  valore_f3 numeric,
  valore_periodo numeric generated always as (
    coalesce(valore_f1, 0) + coalesce(valore_f2, 0) + coalesce(valore_f3, 0)
  ) stored,
  origine origine_lettura_enum not null default 'manuale',
  modificata_manualmente boolean not null default false,
  documento_sorgente_id uuid references documenti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contatore_id, periodo_anno, periodo_mese)
);

create trigger trg_letture_updated_at
  before update on letture
  for each row execute function set_updated_at();

create index idx_letture_contatore_periodo on letture (contatore_id, periodo_anno, periodo_mese);

-- RLS/grants coerenti con 20260710140010_grants_rls.sql.
grant select, insert, update, delete on documenti, letture to authenticated;

alter table documenti enable row level security;
alter table letture enable row level security;

create policy "authenticated_full_access" on documenti
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on letture
  for all to authenticated using (true) with check (true);
