"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { certificatoAdmSchema } from "@/lib/validation/certificato-adm.schema"

export type ActionResult = { error?: string } | void

const DIMENSIONE_MASSIMA_BYTES = 1 * 1024 * 1024 // 1MB, un keystore è piccolo

// Carica (o sostituisce, stesso ambiente) il certificato di autenticazione
// ADM usato per le chiamate S2S — vedi 20260714140001_certificati_adm.sql.
// Diverso dalla firma digitale Aruba del sottoscrittore: questo autentica la
// connessione al servizio web, non firma il contenuto della dichiarazione.
// Il contenuto (certificato + password opzionale) non transita mai per una
// query diretta dal browser: passa dalla RPC Vault con client service-role,
// stesso schema di lib/actions/clienti-credenziali.ts.
export async function caricaCertificatoAdm(formData: FormData): Promise<ActionResult> {
  const parsed = certificatoAdmSchema.safeParse({
    ambiente: formData.get("ambiente"),
    password: formData.get("password") || undefined,
    dataScadenza: formData.get("dataScadenza") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nessun file selezionato" }
  }
  if (file.size > DIMENSIONE_MASSIMA_BYTES) {
    return { error: "File troppo grande (max 1MB): non sembra un certificato valido." }
  }

  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const certificatoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64")
  const contenuto = JSON.stringify({
    certificatoBase64,
    password: parsed.data.password ?? "",
  })

  const admin = createServiceRoleClient()
  const { error } = await admin.rpc("set_certificato_adm", {
    p_ambiente: parsed.data.ambiente,
    p_nome_file: file.name,
    p_contenuto: contenuto,
    p_data_scadenza: parsed.data.dataScadenza || null,
  })
  if (error) return { error: error.message }

  revalidatePath("/impostazioni")
}

export type CertificatoAdmInfo = {
  ambiente: "test" | "produzione"
  nome_file: string
  data_scadenza: string | null
  updated_at: string
}

// Solo metadati (mai il contenuto cifrato): query normale sulla tabella,
// nessuna RPC service-role necessaria qui.
export async function listaCertificatiAdm(): Promise<CertificatoAdmInfo[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("certificati_adm")
    .select("ambiente, nome_file, data_scadenza, updated_at")
    .order("ambiente")

  return data ?? []
}

export async function eliminaCertificatoAdm(
  ambiente: "test" | "produzione"
): Promise<ActionResult> {
  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const admin = createServiceRoleClient()
  const { error } = await admin.rpc("delete_certificato_adm", { p_ambiente: ambiente })
  if (error) return { error: error.message }

  revalidatePath("/impostazioni")
}
