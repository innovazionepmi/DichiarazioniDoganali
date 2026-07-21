-- Fase 4/brief §5.8: "Invia ricevute dichiarazione" — email finale al
-- cliente con dichiarazione (ricevuta PDF) + tabellina letture del periodo.
-- Distinto da `data_invio` (che traccia l'invio S2S ad ADM): qui tracciamo
-- l'invio dell'email al cliente finale, un passaggio successivo e separato.
alter table dichiarazioni_ee_semestrali
  add column email_cliente_inviata_at timestamptz;
