-- Dichiarazione doganale semestrale energia elettrica (Fase 4, incremento 1:
-- Quadro A produzione + Quadro G cessione — profilo "officina di produzione da
-- fonti rinnovabili uso proprio esente", l'unico che secondo le istruzioni ADM
-- (Allegato 4, Circolare 9/2026) non richiede i quadri di liquidazione
-- dell'accisa J/L/M/Q/S). Una riga per impianto+anno+semestre: il "codice
-- ditta" (CodDitta, impianti.codice_impianto_f24) è per licenza/impianto, non
-- per cliente — un cliente con più impianti presenta una dichiarazione
-- separata per ciascuno.
create type stato_dichiarazione_enum as enum ('generata', 'inviata');

create table dichiarazioni_ee_semestrali (
  id uuid primary key default gen_random_uuid(),
  impianto_id uuid not null references impianti (id) on delete restrict,
  anno int not null,
  periodo_riferimento smallint not null check (periodo_riferimento in (1, 2)),
  stato stato_dichiarazione_enum not null default 'generata',
  documento_xml_id uuid references documenti (id) on delete set null,
  documento_pdf_id uuid references documenti (id) on delete set null,
  documento_protocollo_id uuid references documenti (id) on delete set null,
  data_generazione timestamptz not null default now(),
  data_invio date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (impianto_id, anno, periodo_riferimento)
);

create index idx_dichiarazioni_ee_semestrali_impianto on dichiarazioni_ee_semestrali (impianto_id);

grant select, insert, update, delete on dichiarazioni_ee_semestrali to authenticated;

alter table dichiarazioni_ee_semestrali enable row level security;

create policy "authenticated_full_access" on dichiarazioni_ee_semestrali
  for all to authenticated using (true) with check (true);

-- Distingue l'XML che generiamo noi dal PDF/protocollo che ADM restituisce
-- dopo il caricamento manuale sul portale (già coperti da 'dichiarazione' e
-- 'protocollo', esistenti dalla Fase 1).
alter type tipo_documento_enum add value 'dichiarazione_xml';
