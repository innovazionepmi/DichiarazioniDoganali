"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { upsertLettureSchema, type LetturaCellaInput } from "@/lib/validation/lettura.schema"

export type ActionResult = { error?: string } | void

// Salvataggio bulk della tabella letture editabile (brief §5.4: "sempre
// disponibile" l'inserimento manuale). Ogni cella diventa origine='manuale',
// modificata_manualmente=true — coerente col fatto che le letture
// E-distribuzione non sono sempre affidabili e Paolo deve poter sempre
// correggere a mano.
export async function upsertLetture(
  impiantoId: string,
  righe: LetturaCellaInput[]
): Promise<ActionResult> {
  const parsed = upsertLettureSchema.safeParse(righe)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  if (parsed.data.length === 0) return

  const supabase = await createClient()
  const { error } = await supabase.from("letture").upsert(
    parsed.data.map((riga) => ({
      ...riga,
      origine: "manuale" as const,
      modificata_manualmente: true,
    })),
    { onConflict: "contatore_id,periodo_anno,periodo_mese" }
  )

  if (error) return { error: error.message }

  revalidatePath(`/letture/${impiantoId}`)
}
