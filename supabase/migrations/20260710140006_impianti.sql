-- Brief §3.3. `attributi_extra` è il "cassetto di sfogo" per attributi impianto
-- non ancora previsti a schema: consente di aggiungere dati futuri senza
-- migrazioni distruttive. Se un attributo diventa ricorrente/da reportistica
-- va promosso a colonna tipizzata con una migration vera.
--
-- `diritto_licenza_importo` resta un numeric a inserimento libero: il brief
-- (§3.3, §5.2) lo definisce come impostazione manuale di Paolo, non derivabile
-- automaticamente da tipo_soggetto.
create table impianti (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clienti (id) on delete restrict,
  nome_impianto text not null,
  tipo_soggetto tipo_soggetto_enum not null,
  diritto_licenza_dovuto boolean not null default false,
  diritto_licenza_importo numeric(10, 2),
  ha_registro_letture boolean not null default false,
  indirizzo_impianto text,
  potenza_kw numeric(10, 3),
  tipologia tipologia_impianto_enum not null default 'fotovoltaico',
  codice_distributore_zona text,
  codice_catastale_comune text,
  ufficio_amministrativo text,
  codice_impianto_f24 text,
  note text,
  attributi_extra jsonb not null default '{}'::jsonb,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_impianti_updated_at
  before update on impianti
  for each row execute function set_updated_at();

create index idx_impianti_cliente_id on impianti (cliente_id);
create index idx_impianti_attivo on impianti (attivo);
create index idx_impianti_attributi_extra on impianti using gin (attributi_extra jsonb_path_ops);
