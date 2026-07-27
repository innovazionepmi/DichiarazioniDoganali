"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error?: string } | void

// Periodo: 0 = dichiarazione annuale, 1 = primo semestre, 2 = secondo
// semestre (brief §9 — la periodicità dipende da diritto_licenza_dovuto
// sull'impianto, decisa lato UI, non qui).
export async function toggleDichiarazione(
  impiantoId: string,
  anno: number,
  periodo: 0 | 1 | 2,
  inviata: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from("tracking_dichiarazioni").upsert(
    {
      impianto_id: impiantoId,
      anno,
      periodo,
      inviata,
      data_invio: inviata ? new Date().toISOString().slice(0, 10) : null,
    },
    { onConflict: "impianto_id,anno,periodo" }
  )

  if (error) return { error: error.message }

  revalidatePath("/tracking")
}

export async function toggleFattura(
  clienteId: string,
  anno: number,
  emessa: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from("tracking_fatture").upsert(
    {
      cliente_id: clienteId,
      anno,
      emessa,
      data_emissione: emessa ? new Date().toISOString().slice(0, 10) : null,
    },
    { onConflict: "cliente_id,anno" }
  )

  if (error) return { error: error.message }

  revalidatePath("/tracking")
}

// Importo fattura per cliente/anno (fix richiesto da Paolo, accanto alla
// spunta "emessa"): upsert parziale, senza toccare `emessa` — se la riga non
// esiste ancora (nessuna fattura mai spuntata) viene creata con
// emessa=false di default.
export async function aggiornaImportoFattura(
  clienteId: string,
  anno: number,
  importo: number | null
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tracking_fatture")
    .upsert({ cliente_id: clienteId, anno, importo }, { onConflict: "cliente_id,anno" })

  if (error) return { error: error.message }

  revalidatePath("/tracking")
}
