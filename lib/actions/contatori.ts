"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { contatoreSchema, type ContatoreInput } from "@/lib/validation/contatore.schema"

export type ActionResult = { error?: string } | void

function toPayload(data: ContatoreInput) {
  return {
    matricola: data.matricola,
    pod: data.pod,
    tipo: data.tipo,
    costante_k: data.costante_k ? Number(data.costante_k) : null,
    data_attivazione: data.data_attivazione,
    data_cessazione: data.data_cessazione || null,
    modello: data.modello || null,
    note: data.note || null,
  }
}

function parseFormData(formData: FormData) {
  return contatoreSchema.safeParse({
    matricola: formData.get("matricola"),
    pod: formData.get("pod"),
    tipo: formData.get("tipo"),
    costante_k: formData.get("costante_k") ?? "",
    data_attivazione: formData.get("data_attivazione"),
    data_cessazione: formData.get("data_cessazione") ?? "",
    modello: formData.get("modello") ?? "",
    note: formData.get("note") ?? "",
  })
}

export async function createContatore(
  impiantoId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("contatori")
    .insert({ ...toPayload(parsed.data), impianto_id: impiantoId })

  if (error) return { error: error.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}

export async function updateContatore(
  impiantoId: string,
  contatoreId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("contatori")
    .update(toPayload(parsed.data))
    .eq("id", contatoreId)

  if (error) return { error: error.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}

export async function archiviaContatore(
  impiantoId: string,
  contatoreId: string,
  attivo: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("contatori")
    .update({ attivo })
    .eq("id", contatoreId)

  if (error) return { error: error.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}
