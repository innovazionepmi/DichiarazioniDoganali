-- Feedback Paolo: alcuni clienti mandano le letture come valori progressivi
-- del contatore (letture "crescenti", quello che il vecchio software di
-- Paolo chiamava "Lettura attuale/precedente" con differenza calcolata in
-- automatico), non come kWh mensili già calcolati che la tabella
-- /letture[impiantoId] si aspetta di default. Confuso con l'altro, i valori
-- progressivi finivano dritti nelle celle F1/F2/F3 producendo autoconsumi
-- assurdi (caso reale: Scuola Provera, vedi PROJECT_STATUS.md).
--
-- `modalita_letture` è per-contatore (non per lettura/mese): è una
-- caratteristica di come QUEL contatore/cliente riporta i dati, stabile nel
-- tempo. Default 'mensile' per non cambiare comportamento ai contatori
-- esistenti.
create type modalita_letture_enum as enum ('mensile', 'cumulativa');

alter table contatori
  add column modalita_letture modalita_letture_enum not null default 'mensile';
