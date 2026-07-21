"use server"

import { createClient } from "@/lib/supabase/server"

export type LogEmail = {
  id: string
  tipo: string
  destinatario: string
  oggetto: string
  allegati: string | null
  esito: "inviata" | "errore"
  messaggioErrore: string | null
  createdAt: string
}

// Elenco degli invii email registrati da lib/email/client.ts (F24, ricevuta
// dichiarazione, registro letture, ecc.) — per il troubleshooting di invii
// che risultano non arrivati, senza dover indovinare cosa sia successo.
export async function listaLogEmail(): Promise<LogEmail[] | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data, error } = await supabase
    .from("email_log")
    .select("id, tipo, destinatario, oggetto, allegati, esito, messaggio_errore, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return { error: error.message }

  return (data ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    destinatario: r.destinatario,
    oggetto: r.oggetto,
    allegati: r.allegati,
    esito: r.esito as "inviata" | "errore",
    messaggioErrore: r.messaggio_errore,
    createdAt: r.created_at,
  }))
}
