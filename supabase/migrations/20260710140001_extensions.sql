-- Estensioni necessarie. pgcrypto per gen_random_uuid(); Vault (pgsodium) è già
-- attivo di default sui progetti Supabase hosted e nello stack locale via `supabase start`.
create extension if not exists pgcrypto with schema extensions;
