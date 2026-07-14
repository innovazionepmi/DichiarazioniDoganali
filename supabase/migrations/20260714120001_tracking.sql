-- Tabellone riepilogativo per l'operatore (brief §9, tracking del lavoro
-- svolto): due concetti separati con granularità diversa, richiesta
-- esplicita dall'utente in sessione.
--
-- Dichiarazione doganale: per impianto, perché la periodicità dipende da un
-- campo già a livello impianto (diritto_licenza_dovuto, vedi
-- 20260710140006_impianti.sql) — chi paga il diritto di licenza dichiara
-- semestralmente (periodo 1 = gennaio-giugno, 2 = luglio-dicembre), chi non
-- lo paga dichiara annualmente (periodo 0). Questa regola non è ancora
-- applicata da nessun codice (la generazione XML della dichiarazione, Fase
-- 4, non è ancora stata costruita): qui serve solo a determinare quante
-- spunte mostrare per anno in UI.
create table tracking_dichiarazioni (
  id uuid primary key default gen_random_uuid(),
  impianto_id uuid not null references impianti (id) on delete restrict,
  anno int not null,
  periodo smallint not null default 0 check (periodo in (0, 1, 2)),
  inviata boolean not null default false,
  data_invio date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (impianto_id, anno, periodo)
);

-- Fattura: per cliente, una volta l'anno (indipendente dal numero di
-- impianti/dichiarazioni del cliente) — scelta esplicita dell'utente, il
-- lavoro su più impianti viene fatturato in un'unica fattura annuale.
create table tracking_fatture (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clienti (id) on delete restrict,
  anno int not null,
  emessa boolean not null default false,
  data_emissione date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, anno)
);

create trigger trg_tracking_dichiarazioni_updated_at
  before update on tracking_dichiarazioni
  for each row execute function set_updated_at();

create trigger trg_tracking_fatture_updated_at
  before update on tracking_fatture
  for each row execute function set_updated_at();

create index idx_tracking_dichiarazioni_impianto_anno on tracking_dichiarazioni (impianto_id, anno);
create index idx_tracking_fatture_cliente_anno on tracking_fatture (cliente_id, anno);

grant select, insert, update, delete on tracking_dichiarazioni, tracking_fatture to authenticated;

alter table tracking_dichiarazioni enable row level security;
alter table tracking_fatture enable row level security;

create policy "authenticated_full_access" on tracking_dichiarazioni
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on tracking_fatture
  for all to authenticated using (true) with check (true);
