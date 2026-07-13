-- F24 diritto di licenza (brief §5.2). Un F24 = un cliente + una riga per
-- ciascun impianto soggetto (diritto_licenza_dovuto=true), sezione
-- Accise/Monopoli. Nessun invio automatico: la generazione crea lo stato
-- 'generato' (PDF scaricabile), l'invio email è un passo separato con
-- conferma esplicita di Paolo ("OK invio", brief §5.2/§9).
create type stato_f24_enum as enum ('generato', 'inviato');

create table f24_generazioni (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clienti (id) on delete restrict,
  anno_riferimento int not null,
  data_scadenza date not null,
  stato stato_f24_enum not null default 'generato',
  documento_id uuid references documenti (id) on delete set null,
  data_invio timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_f24_generazioni_cliente_id on f24_generazioni (cliente_id);

-- Snapshot di impianto_id/importo/codice_identificativo al momento della
-- generazione: se i dati anagrafici dell'impianto cambiano dopo, il PDF già
-- generato (e il suo storico) restano coerenti con quanto stampato.
create table f24_righe (
  id uuid primary key default gen_random_uuid(),
  f24_generazione_id uuid not null references f24_generazioni (id) on delete cascade,
  impianto_id uuid not null references impianti (id) on delete restrict,
  importo numeric(10, 2) not null,
  codice_identificativo text,
  created_at timestamptz not null default now()
);

create index idx_f24_righe_generazione_id on f24_righe (f24_generazione_id);

grant select, insert, update, delete on f24_generazioni, f24_righe to authenticated;

alter table f24_generazioni enable row level security;
alter table f24_righe enable row level security;

create policy "authenticated_full_access" on f24_generazioni
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on f24_righe
  for all to authenticated using (true) with check (true);
