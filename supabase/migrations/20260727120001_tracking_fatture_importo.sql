-- Fix richiesto da Paolo (riunione 2026-07-27): accanto alla spunta
-- "Fattura emessa", poter registrare anche l'importo fatturato per
-- cliente/anno — già identificato come gap nella gap-analysis del brief
-- (tracking_fatture non aveva un campo importo).
alter table tracking_fatture
  add column importo numeric(10, 2);
