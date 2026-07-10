"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { impiantoSchema, type ImpiantoInput } from "@/lib/validation/impianto.schema"

export type ActionResult = { error?: string } | void

function toPayload(data: ImpiantoInput) {
  return {
    cliente_id: data.cliente_id,
    nome_impianto: data.nome_impianto,
    tipo_soggetto: data.tipo_soggetto,
    tipologia: data.tipologia,
    diritto_licenza_dovuto: data.diritto_licenza_dovuto,
    diritto_licenza_importo: data.diritto_licenza_importo
      ? Number(data.diritto_licenza_importo)
      : null,
    ha_registro_letture: data.ha_registro_letture,
    indirizzo_impianto: data.indirizzo_impianto || null,
    potenza_kw: data.potenza_kw ? Number(data.potenza_kw) : null,
    codice_distributore_zona: data.codice_distributore_zona || null,
    codice_catastale_comune: data.codice_catastale_comune || null,
    ufficio_amministrativo: data.ufficio_amministrativo || null,
    codice_impianto_f24: data.codice_impianto_f24 || null,
    note: data.note || null,
  }
}

function parseFormData(formData: FormData) {
  return impiantoSchema.safeParse({
    cliente_id: formData.get("cliente_id"),
    nome_impianto: formData.get("nome_impianto"),
    tipo_soggetto: formData.get("tipo_soggetto"),
    tipologia: formData.get("tipologia"),
    diritto_licenza_dovuto: formData.get("diritto_licenza_dovuto") === "true",
    diritto_licenza_importo: formData.get("diritto_licenza_importo") ?? "",
    ha_registro_letture: formData.get("ha_registro_letture") === "true",
    indirizzo_impianto: formData.get("indirizzo_impianto") ?? "",
    potenza_kw: formData.get("potenza_kw") ?? "",
    codice_distributore_zona: formData.get("codice_distributore_zona") ?? "",
    codice_catastale_comune: formData.get("codice_catastale_comune") ?? "",
    ufficio_amministrativo: formData.get("ufficio_amministrativo") ?? "",
    codice_impianto_f24: formData.get("codice_impianto_f24") ?? "",
    note: formData.get("note") ?? "",
  })
}

export async function createImpianto(formData: FormData): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("impianti")
    .insert(toPayload(parsed.data))
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/impianti")
  redirect(`/anagrafiche/impianti/${data.id}`)
}

export async function updateImpianto(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("impianti")
    .update(toPayload(parsed.data))
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/impianti")
  revalidatePath(`/anagrafiche/impianti/${id}`)
}

export async function archiviaImpianto(
  id: string,
  attivo: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("impianti")
    .update({ attivo })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/impianti")
  revalidatePath(`/anagrafiche/impianti/${id}`)
}
