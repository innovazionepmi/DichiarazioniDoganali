-- Tipi enumerativi condivisi dal modello dati (brief §3.2, §3.3, §4.2, §4.4).
create type tipo_soggetto_enum as enum ('con_licenza', 'con_autorizzazione');
create type tipologia_impianto_enum as enum ('fotovoltaico', 'eolico');
create type tipo_contatore_enum as enum ('produzione', 'immissione');
