"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { partnerSchema } from "@/lib/validation/partner.schema"

export type ActionResult = { error?: string } | void

export async function createPartner(formData: FormData): Promise<ActionResult> {
  const parsed = partnerSchema.safeParse({
    ragione_sociale: formData.get("ragione_sociale"),
    note: formData.get("note") ?? "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("partner")
    .insert({
      ragione_sociale: parsed.data.ragione_sociale,
      note: parsed.data.note || null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/partner")
  redirect(`/anagrafiche/partner/${data.id}`)
}

export async function updatePartner(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = partnerSchema.safeParse({
    ragione_sociale: formData.get("ragione_sociale"),
    note: formData.get("note") ?? "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("partner")
    .update({
      ragione_sociale: parsed.data.ragione_sociale,
      note: parsed.data.note || null,
    })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/partner")
  revalidatePath(`/anagrafiche/partner/${id}`)
}

export async function archiviaPartner(
  id: string,
  attivo: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("partner")
    .update({ attivo })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/anagrafiche/partner")
  revalidatePath(`/anagrafiche/partner/${id}`)
}
