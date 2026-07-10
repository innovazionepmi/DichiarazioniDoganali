import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

// Client "utente": cookie-based, rispetta le RLS policy dell'utente loggato.
// Usare questo in Server Component e Server Action per tutte le operazioni
// CRUD normali. Non usare mai per leggere/scrivere credenziali cifrate in
// Vault: quello richiede il service-role client (lib/supabase/service-role.ts).
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Chiamato da un Server Component: ignorabile perché il
            // middleware si occupa di rinfrescare la sessione ad ogni request.
          }
        },
      },
    }
  )
}
