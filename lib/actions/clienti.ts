"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { clienteSchema, type ClienteInput } from "@/lib/validation/cliente.schema"

export type ActionResult = { error?: string } | void

function toPayload(data: ClienteInput) {
  return {
    ragione_sociale: data.ragione_sociale,
    codice_fiscale: data.codice_fiscale || null,
    partita_iva: data.partita_iva || null,
    codice_licenza: data.codice_licenza || null,
    referente_nome: data.referente_nome || null,
    referente_cognome: data.referente_cognome || null,
    referente_telefono: data.referente_telefono || null,
    referente_email: data.referente_email || null,
    referente_data_nascita: data.referente_data_nascita || null,
    referente_codice_fiscale: data.referente_codice_fiscale || null,
    referente_sesso: data.referente_sesso || null,
    referente_comune_nascita: data.referente_comune_nascita || null,
    referente_provincia_nascita: data.referente_provincia_nascita || null,
    referente_domicilio_via: data.referente_domicilio_via || null,
    referente_domicilio_cap: data.referente_domicilio_cap || null,
    referente_domicilio_citta: data.referente_domicilio_citta || null,
    referente_domicilio_provincia: data.referente_domicilio_provincia || null,
    indirizzo_via: data.indirizzo_via || null,
    indirizzo_cap: data.indirizzo_cap || null,
    indirizzo_citta: data.indirizzo_citta || null,
    indirizzo_provincia: data.indirizzo_provincia || null,
    partner_id: data.partner_id || null,
    note: data.note || null,
  }
}

function parseFormData(formData: FormData) {
  return clienteSchema.safeParse({
    ragione_sociale: formData.get("ragione_sociale"),
    codice_fiscale: formData.get("codice_fiscale") ?? "",
    partita_iva: formData.get("partita_iva") ?? "",
    codice_licenza: formData.get("codice_licenza") ?? "",
    referente_nome: formData.get("referente_nome") ?? "",
    referente_cognome: formData.get("referente_cognome") ?? "",
    referente_telefono: formData.get("referente_telefono") ?? "",
    referente_email: formData.get("referente_email") ?? "",
    referente_data_nascita: formData.get("referente_data_nascita") ?? "",
    referente_codice_fiscale: formData.get("referente_codice_fiscale") ?? "",
    referente_sesso: formData.get("referente_sesso") ?? "",
    referente_comune_nascita: formData.get("referente_comune_nascita") ?? "",
    referente_provincia_nascita: formData.get("referente_provincia_nascita") ?? "",
    referente_domicilio_via: formData.get("referente_domicilio_via") ?? "",
    referente_domicilio_cap: formData.get("referente_domicilio_cap") ?? "",
    referente_domicilio_citta: formData.get("referente_domicilio_citta") ?? "",
    referente_domicilio_provincia: formData.get("referente_domicilio_provincia") ?? "",
    indirizzo_via: formData.get("indirizzo_via") ?? "",
    indirizzo_cap: formData.get("indirizzo_cap") ?? "",
    indirizzo_citta: formData.get("indirizzo_citta") ?? "",
    indirizzo_provincia: formData.get("indirizzo_provincia") ?? "",
    partner_id: formData.get("partner_id") ?? "",
    note: formData.get("note") ?? "",
  })
}

export async function createCliente(formData: FormData): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clienti")
    .insert(toPayload(parsed.data))
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/clienti")
  redirect(`/anagrafiche/clienti/${data.id}`)
}

export async function updateCliente(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("clienti")
    .update(toPayload(parsed.data))
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/clienti")
  revalidatePath(`/anagrafiche/clienti/${id}`)
}

export async function archiviaCliente(
  id: string,
  attivo: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("clienti")
    .update({ attivo })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/clienti")
  revalidatePath(`/anagrafiche/clienti/${id}`)
}
