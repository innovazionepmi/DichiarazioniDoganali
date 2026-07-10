-- Trigger di utilità: mantiene aggiornato updated_at su ogni update.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
