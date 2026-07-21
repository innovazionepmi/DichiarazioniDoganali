-- Log invii email (richiesto dall'utente dopo un invio "registro letture
-- vuoto" che non risultava arrivato, senza nessuna traccia diagnosticabile
-- da nessuna parte): ogni chiamata a inviaEmail (F24, ricevuta
-- dichiarazione, registro letture vuoto, ecc.) viene registrata qui — esito
-- SMTP (accettata dal server o rifiutata, col messaggio di errore esatto)
-- e non lo stato di recapito finale (bounce/spam, quello va verificato sul
-- pannello del provider SMTP, es. Brevo → Statistiche).
create table email_log (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  destinatario text not null,
  oggetto text not null,
  allegati text,
  esito text not null check (esito in ('inviata', 'errore')),
  messaggio_errore text,
  cliente_id uuid references clienti (id) on delete set null,
  impianto_id uuid references impianti (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_email_log_created_at on email_log (created_at desc);
create index idx_email_log_cliente_id on email_log (cliente_id);
create index idx_email_log_impianto_id on email_log (impianto_id);

grant select, insert on email_log to authenticated;

alter table email_log enable row level security;

create policy "authenticated_full_access" on email_log
  for all to authenticated using (true) with check (true);
