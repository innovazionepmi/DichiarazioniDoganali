"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error?: string } | void

const relazioneSchema = z.object({
  contatore_produzione_id: z.string().uuid("Seleziona il contatore di produzione"),
  contatore_immissione_id: z.string().uuid("Seleziona il contatore di immissione"),
})

export async function creaRelazioneContatori(
  impiantoId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = relazioneSchema.safeParse({
    contatore_produzione_id: formData.get("contatore_produzione_id"),
    contatore_immissione_id: formData.get("contatore_immissione_id"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("contatori_relazioni").insert(parsed.data)

  if (error) {
    // Il trigger DB (check_contatori_relazione) rifiuta coppie non valide
    // (impianti diversi o tipo contatore errato): mostriamo il messaggio così com'è.
    return { error: error.message }
  }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}

export async function eliminaRelazioneContatori(
  impiantoId: string,
  relazioneId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("contatori_relazioni")
    .delete()
    .eq("id", relazioneId)

  if (error) return { error: error.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}
