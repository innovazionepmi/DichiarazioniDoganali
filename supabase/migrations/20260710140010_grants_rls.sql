-- Utenti interni pochi (Paolo + eventuali collaboratori): qualunque utente
-- autenticato via Supabase Auth ha accesso pieno a tutte le anagrafiche.
-- Zero grant ad anon: nessun accesso senza login (coerente col login gate
-- applicativo). Punto di estensione futuro: se servirà segmentazione per
-- ruolo, sostituire `using (true)` con una funzione helper basata su
-- auth.jwt() -> 'app_metadata' ->> 'ruolo', senza toccare lo schema tabelle.
grant usage on schema public to authenticated;

grant select, insert, update, delete
  on partner, clienti, impianti, contatori, contatori_relazioni
  to authenticated;

alter table partner enable row level security;
alter table clienti enable row level security;
alter table impianti enable row level security;
alter table contatori enable row level security;
alter table contatori_relazioni enable row level security;

create policy "authenticated_full_access" on partner
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on clienti
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on impianti
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on contatori
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on contatori_relazioni
  for all to authenticated using (true) with check (true);
