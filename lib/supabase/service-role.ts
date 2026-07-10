import "server-only"
import { createClient } from "@supabase/supabase-js"

// Client con privilegi elevati (service_role): bypassa RLS. Usare SOLO da
// Server Action per operazioni esplicitamente privilegiate (es. RPC Vault
// per le credenziali portali in lib/actions/clienti-credenziali.ts). `server-only`
// impedisce l'import accidentale da un componente client.
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
