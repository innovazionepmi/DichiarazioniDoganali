-- Certificato di autenticazione ADM (Fase 4, invio S2S): credenziale tecnica
-- dell'app (non per-cliente), usata per autenticare via mutua TLS le
-- chiamate al web service di invio dichiarazioni. Diverso dal certificato di
-- firma Aruba del sottoscrittore (quello firma il contenuto della
-- dichiarazione, questo autentica la connessione — vedi piano Fase 4).
-- Un solo certificato attivo per ambiente: un nuovo caricamento sullo stesso
-- ambiente sostituisce il precedente (gestione rinnovo/scadenza).
create type ambiente_adm_enum as enum ('test', 'produzione');

create table certificati_adm (
  id uuid primary key default gen_random_uuid(),
  ambiente ambiente_adm_enum not null unique,
  nome_file text not null,
  secret_id uuid,
  data_scadenza date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_certificati_adm_updated_at
  before update on certificati_adm
  for each row execute function set_updated_at();

-- Sola lettura metadati (nome file, scadenza): mai il contenuto del
-- certificato, che vive cifrato in Vault e passa solo dalle RPC service-role
-- sotto. Niente insert/update/delete diretti: eviterebbe la RPC e
-- lascerebbe secret_id orfani in Vault — passano tutti da
-- set_certificato_adm/delete_certificato_adm.
grant select on certificati_adm to authenticated;

alter table certificati_adm enable row level security;

create policy "authenticated_full_access" on certificati_adm
  for all to authenticated using (true) with check (true);

-- Stesso schema di sicurezza di set_cliente_credential/get_cliente_credential
-- (20260710140009_vault_helpers.sql): SECURITY DEFINER, solo service_role,
-- mai una query diretta dal browser. `p_contenuto` è una stringa JSON
-- {"certificatoBase64": "...", "password": "..."} — il formato esatto del
-- certificato (p12/pfx con password, o altro) si scopre solo quando Paolo
-- carica quello vero; teniamo il contenuto opaco qui apposta.
create or replace function set_certificato_adm(
  p_ambiente text,
  p_nome_file text,
  p_contenuto text,
  p_data_scadenza date
) returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_certificato_id uuid;
  v_name text;
begin
  if p_ambiente not in ('test', 'produzione') then
    raise exception 'ambiente % non valido (atteso test o produzione)', p_ambiente;
  end if;

  v_name := 'certificato_adm:' || p_ambiente;

  select id, secret_id into v_certificato_id, v_secret_id
    from certificati_adm where ambiente = p_ambiente::ambiente_adm_enum;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_contenuto, v_name, 'certificato di autenticazione ADM - ambiente ' || p_ambiente
    );
  else
    perform vault.update_secret(v_secret_id, p_contenuto);
  end if;

  if v_certificato_id is null then
    insert into certificati_adm (ambiente, nome_file, secret_id, data_scadenza)
    values (p_ambiente::ambiente_adm_enum, p_nome_file, v_secret_id, p_data_scadenza);
  else
    update certificati_adm
      set nome_file = p_nome_file, data_scadenza = p_data_scadenza, updated_at = now()
      where id = v_certificato_id;
  end if;
end;
$$;

revoke all on function set_certificato_adm(text, text, text, date) from public;
grant execute on function set_certificato_adm(text, text, text, date) to service_role;

create or replace function get_certificato_adm(p_ambiente text)
returns table (contenuto text)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  if p_ambiente not in ('test', 'produzione') then
    raise exception 'ambiente % non valido (atteso test o produzione)', p_ambiente;
  end if;

  return query
    select vs.decrypted_secret
      from certificati_adm c
      left join vault.decrypted_secrets vs on vs.id = c.secret_id
     where c.ambiente = p_ambiente::ambiente_adm_enum;
end;
$$;

revoke all on function get_certificato_adm(text) from public;
grant execute on function get_certificato_adm(text) to service_role;

create or replace function delete_certificato_adm(p_ambiente text)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  if p_ambiente not in ('test', 'produzione') then
    raise exception 'ambiente % non valido (atteso test o produzione)', p_ambiente;
  end if;

  select secret_id into v_secret_id
    from certificati_adm where ambiente = p_ambiente::ambiente_adm_enum;

  delete from certificati_adm where ambiente = p_ambiente::ambiente_adm_enum;

  if v_secret_id is not null then
    perform vault.delete_secret(v_secret_id);
  end if;
end;
$$;

revoke all on function delete_certificato_adm(text) from public;
grant execute on function delete_certificato_adm(text) to service_role;
