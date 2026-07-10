-- Spezza l'indirizzo cliente (finora un unico campo testo) in componenti
-- strutturate: via (comprensiva di numero civico), CAP, città, provincia.
-- Nessun dato reale ancora presente in produzione: drop diretto della vecchia
-- colonna, nessuna migrazione dei valori necessaria.
alter table clienti drop column if exists indirizzo;

alter table clienti
  add column indirizzo_via text,
  add column indirizzo_cap text,
  add column indirizzo_citta text,
  add column indirizzo_provincia text;
