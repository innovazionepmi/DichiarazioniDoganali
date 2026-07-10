-- Brief §3.5. Relazione M:N critica: l'autoconsumo si calcola come
-- produzione − immissione seguendo esattamente queste coppie, quindi
-- l'integrità va garantita a livello DB. Un CHECK non basta perché serve una
-- subquery su `contatori` (Postgres non lo consente in un CHECK), quindi si
-- usa un trigger BEFORE INSERT/UPDATE.
create table contatori_relazioni (
  id uuid primary key default gen_random_uuid(),
  contatore_produzione_id uuid not null references contatori (id) on delete cascade,
  contatore_immissione_id uuid not null references contatori (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contatore_produzione_id, contatore_immissione_id)
);

create or replace function check_contatori_relazione()
returns trigger
language plpgsql
as $$
declare
  v_impianto_produzione uuid;
  v_tipo_produzione tipo_contatore_enum;
  v_impianto_immissione uuid;
  v_tipo_immissione tipo_contatore_enum;
begin
  select impianto_id, tipo into v_impianto_produzione, v_tipo_produzione
    from contatori where id = new.contatore_produzione_id;

  select impianto_id, tipo into v_impianto_immissione, v_tipo_immissione
    from contatori where id = new.contatore_immissione_id;

  if v_tipo_produzione is distinct from 'produzione' then
    raise exception 'contatore_produzione_id (%) non è un contatore di tipo produzione', new.contatore_produzione_id;
  end if;

  if v_tipo_immissione is distinct from 'immissione' then
    raise exception 'contatore_immissione_id (%) non è un contatore di tipo immissione', new.contatore_immissione_id;
  end if;

  if v_impianto_produzione is distinct from v_impianto_immissione then
    raise exception 'i due contatori appartengono a impianti diversi (% vs %)', v_impianto_produzione, v_impianto_immissione;
  end if;

  return new;
end;
$$;

create trigger trg_check_contatori_relazione
  before insert or update on contatori_relazioni
  for each row execute function check_contatori_relazione();

create index idx_contatori_relazioni_produzione on contatori_relazioni (contatore_produzione_id);
create index idx_contatori_relazioni_immissione on contatori_relazioni (contatore_immissione_id);
