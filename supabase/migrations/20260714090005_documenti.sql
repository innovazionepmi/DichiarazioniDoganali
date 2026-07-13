-- Archivio file (brief §3.8): licenze, F24, PDF letture E-distribuzione,
-- screenshot, verbali di sostituzione, dichiarazioni, protocolli. File veri
-- su Supabase Storage, questa tabella tiene solo i metadati.
create type tipo_documento_enum as enum (
  'licenza',
  'f24',
  'pdf_letture',
  'screenshot_letture',
  'dichiarazione',
  'protocollo',
  'ricevuta',
  'verbale_sostituzione',
  'registro_letture',
  'altro'
);

create table documenti (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_documento_enum not null,
  storage_path text not null,
  nome_file text not null,
  mime_type text,
  dimensione_bytes bigint,
  cliente_id uuid references clienti (id) on delete restrict,
  impianto_id uuid references impianti (id) on delete restrict,
  contatore_id uuid references contatori (id) on delete restrict,
  data_documento date,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_documenti_cliente_id on documenti (cliente_id);
create index idx_documenti_impianto_id on documenti (impianto_id);
create index idx_documenti_contatore_id on documenti (contatore_id);

-- Bucket privato: mai accessibile in modo anonimo, solo utenti autenticati
-- tramite le policy sotto (nessun link pubblico diretto).
insert into storage.buckets (id, name, public)
values ('documenti', 'documenti', false)
on conflict (id) do nothing;

create policy "authenticated_read_documenti_bucket"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documenti');

create policy "authenticated_insert_documenti_bucket"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documenti');

create policy "authenticated_update_documenti_bucket"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documenti');

create policy "authenticated_delete_documenti_bucket"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documenti');
