-- Brief §3.4. Nessun UNIQUE su matricola/pod: il POD identifica il punto di
-- connessione e resta stabile tra vecchio e nuovo contatore in caso di
-- sostituzione; solo la matricola cambia (nasce un nuovo record, brief §5.5).
create table contatori (
  id uuid primary key default gen_random_uuid(),
  impianto_id uuid not null references impianti (id) on delete restrict,
  matricola text not null,
  pod text not null,
  tipo tipo_contatore_enum not null,
  costante_k numeric,
  data_attivazione date not null,
  data_cessazione date,
  modello text,
  note text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_contatori_date_cessazione
    check (data_cessazione is null or data_cessazione >= data_attivazione)
);

create trigger trg_contatori_updated_at
  before update on contatori
  for each row execute function set_updated_at();

create index idx_contatori_impianto_id on contatori (impianto_id);
create index idx_contatori_attivo on contatori (attivo);
create index idx_contatori_pod on contatori (pod);
