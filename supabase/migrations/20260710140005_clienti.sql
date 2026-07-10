-- Brief §3.1. Le colonne credenziali NON contengono mai la password in chiaro:
-- puntano (secret_id) a un segreto cifrato in Supabase Vault, gestito solo
-- tramite le RPC security-definer di 20260710140009_vault_helpers.sql.
--
-- Nota subappalto (brief §3.1): un cliente è interamente diretto oppure
-- interamente in subappalto, mai misto. L'associazione al partner vive quindi
-- a livello cliente (non impianto).
create table clienti (
  id uuid primary key default gen_random_uuid(),
  codice_fiscale text,
  partita_iva text,
  ragione_sociale text not null,
  codice_licenza text,
  referente_nome text,
  referente_telefono text,
  referente_email text,
  referente_data_nascita date,
  indirizzo text,
  partner_id uuid references partner (id) on delete restrict,
  credenziali_edistribuzione_user text,
  credenziali_edistribuzione_secret_id uuid,
  credenziali_gse_user text,
  credenziali_gse_secret_id uuid,
  note text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clienti_updated_at
  before update on clienti
  for each row execute function set_updated_at();

create index idx_clienti_partner_id on clienti (partner_id);
create index idx_clienti_attivo on clienti (attivo);
