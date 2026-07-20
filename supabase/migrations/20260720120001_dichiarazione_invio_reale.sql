-- Fase 4, invio S2S reale: collega dichiarazioni_ee_semestrali al client SOAP
-- già validato in ambiente di addestramento (vedi PROJECT_STATUS.md). IUT ed
-- esito sono testuali (non enum): i codici ADM possono aggiungersi/cambiare
-- nel tempo, non vogliamo una migration per ogni nuovo codice — la
-- categorizzazione "friendly" resta lato applicativo (lib/adm/soap-envelope.ts).
alter table dichiarazioni_ee_semestrali
  add column iut text,
  add column esito_codice text,
  add column esito_descrizione text,
  add column esito_aggiornato_at timestamptz,
  -- Data/ora ufficiale di registrazione riportata da ADM stessa nella
  -- risposta di invio (campo dataRegistrazione dell'Output) — testuale,
  -- non timestamptz: formato non garantito/documentato, meglio riportarlo
  -- così com'è che rischiare un parsing sbagliato su un dato ufficiale.
  add column data_registrazione_adm text;
