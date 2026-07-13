-- Il facsimile F24 (sezione DATI ANAGRAFICI) richiede cognome, nome, codice
-- fiscale personale, sesso, comune/provincia di nascita e domicilio fiscale
-- del rappresentante legale (persona fisica) — dati distinti da quelli della
-- ditta (clienti.codice_fiscale/partita_iva) e non presenti nello schema
-- originale. `referente_nome` resta il solo nome; il cognome è nuovo.
alter table clienti
  add column referente_cognome text,
  add column referente_codice_fiscale text,
  add column referente_sesso text check (referente_sesso in ('M', 'F')),
  add column referente_comune_nascita text,
  add column referente_provincia_nascita text,
  add column referente_domicilio_via text,
  add column referente_domicilio_cap text,
  add column referente_domicilio_citta text,
  add column referente_domicilio_provincia text;
