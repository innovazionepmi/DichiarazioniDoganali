"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { credenzialeSchema } from "@/lib/validation/cliente.schema"

export type ActionResult = { error?: string } | void

// Unico punto di scrittura per le credenziali portali (E-distribuzione, GSE).
// 1. verifica la sessione utente con il client cookie-based (RLS-aware);
// 2. solo dopo, invoca la RPC Vault con il client service-role (server-only).
// Il form principale del cliente (lib/actions/clienti.ts) non tocca mai
// questi campi: evita che un salvataggio generico sovrascriva i secret_id.
export async function setCredenzialeCliente(
  clienteId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = credenzialeSchema.safeParse({
    campo: formData.get("campo"),
    username: formData.get("username"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return { error: "Non autenticato" }
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.rpc("set_cliente_credential", {
    p_cliente_id: clienteId,
    p_campo: parsed.data.campo,
    p_username: parsed.data.username,
    p_password: parsed.data.password,
  })

  if (error) return { error: error.message }

  revalidatePath(`/anagrafiche/clienti/${clienteId}`)
}

export type GetCredenzialeResult =
  | { error: string }
  | { username: string | null; password: string | null }

// Recupero on-demand delle credenziali in chiaro (mai incluse nella query
// della pagina cliente, solo richieste esplicitamente dall'operatore che
// deve copiarle per accedere al portale E-distribuzione/GSE): stessa
// separazione client-cookie/service-role di setCredenzialeCliente.
export async function getCredenzialeCliente(
  clienteId: string,
  campo: "edistribuzione" | "gse"
): Promise<GetCredenzialeResult> {
  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  // Il progetto non genera tipi Database da Supabase, quindi il ritorno
  // della RPC non è tipato automaticamente: annotato a mano in base allo
  // schema di `get_cliente_credential` (vault_helpers.sql).
  const admin = createServiceRoleClient()
  const { data, error } = (await admin
    .rpc("get_cliente_credential", { p_cliente_id: clienteId, p_campo: campo })
    .maybeSingle()) as {
    data: { username: string | null; password: string | null } | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  if (!data || !data.password) {
    return { error: "Nessuna credenziale salvata per questo portale." }
  }

  return { username: data.username, password: data.password }
}
