-- Necessario per calcolare la lettura progressiva di registro quando si
-- onboarda un contatore già in uso da tempo (caso comune per gli impianti
-- esistenti di Paolo): senza questo campo assumeremmo erroneamente che ogni
-- contatore parta da zero. Default 0 per i contatori davvero nuovi.
alter table contatori
  add column lettura_iniziale numeric not null default 0;
