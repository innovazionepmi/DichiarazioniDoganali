-- Brief §3.2: aziende che subappaltano il lavoro a Paolo.
create table partner (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  note text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_partner_updated_at
  before update on partner
  for each row execute function set_updated_at();

create index idx_partner_attivo on partner (attivo);
