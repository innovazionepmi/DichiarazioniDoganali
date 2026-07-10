-- Stesso trattamento di 20260714090001 (clienti): spezza l'indirizzo impianto
-- in componenti strutturate. Utile anche in vista del Quadro L (brief §5.7),
-- che richiede la provincia dell'impianto separata da quella del cliente.
alter table impianti drop column if exists indirizzo_impianto;

alter table impianti
  add column indirizzo_via text,
  add column indirizzo_cap text,
  add column indirizzo_citta text,
  add column indirizzo_provincia text;
