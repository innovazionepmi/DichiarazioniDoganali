-- Wrapper attorno a Supabase Vault (pgsodium) per cifrare le credenziali dei
-- portali (E-distribuzione, GSE) dei clienti. SECURITY DEFINER + revoke da
-- public/authenticated + grant al solo service_role: nessuna password
-- transita mai per una query diretta dal browser/RLS-utente, solo tramite le
-- Server Action Next.js che usano il client service-role (server-only).
create or replace function set_cliente_credential(
  p_cliente_id uuid,
  p_campo text,
  p_username text,
  p_password text
) returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_secret_col text;
  v_user_col text;
  v_name text;
begin
  if p_campo not in ('edistribuzione', 'gse') then
    raise exception 'campo % non valido (atteso edistribuzione o gse)', p_campo;
  end if;

  v_secret_col := 'credenziali_' || p_campo || '_secret_id';
  v_user_col := 'credenziali_' || p_campo || '_user';
  v_name := 'cliente:' || p_cliente_id || ':' || p_campo;

  execute format('select %I from clienti where id = $1', v_secret_col)
    into v_secret_id using p_cliente_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_password, v_name, 'credenziale ' || p_campo || ' cliente ' || p_cliente_id);
  else
    perform vault.update_secret(v_secret_id, p_password);
  end if;

  execute format(
    'update clienti set %I = $1, %I = $2, updated_at = now() where id = $3',
    v_user_col, v_secret_col
  ) using p_username, v_secret_id, p_cliente_id;
end;
$$;

revoke all on function set_cliente_credential(uuid, text, text, text) from public;
grant execute on function set_cliente_credential(uuid, text, text, text) to service_role;

create or replace function get_cliente_credential(p_cliente_id uuid, p_campo text)
returns table (username text, password text)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_col text;
  v_user_col text;
begin
  if p_campo not in ('edistribuzione', 'gse') then
    raise exception 'campo % non valido (atteso edistribuzione o gse)', p_campo;
  end if;

  v_secret_col := 'credenziali_' || p_campo || '_secret_id';
  v_user_col := 'credenziali_' || p_campo || '_user';

  return query execute format(
    'select c.%I, vs.decrypted_secret
       from clienti c
       left join vault.decrypted_secrets vs on vs.id = c.%I
      where c.id = $1',
    v_user_col, v_secret_col
  ) using p_cliente_id;
end;
$$;

revoke all on function get_cliente_credential(uuid, text) from public;
grant execute on function get_cliente_credential(uuid, text) to service_role;
