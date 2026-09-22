-- Nuovo canale di import letture: foglio Excel "registro letture" che Paolo
-- già tiene per ciascun cliente (letture cumulative per contatore), in
-- aggiunta a pdf_stampa/screenshot/manuale. Valore enum dedicato invece di
-- riusare 'csv' (già esistente ma mai realmente usato): tracciabilità più
-- chiara nei log di import.
alter type origine_lettura_enum add value 'excel';

-- Il file Excel caricato va comunque archiviato su Storage (stessa logica di
-- pdf_letture/screenshot_letture, vedi caricaDocumento in lib/actions/documenti.ts).
alter type tipo_documento_enum add value 'excel_letture';
