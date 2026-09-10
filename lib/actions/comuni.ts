"use server"

import { createClient } from "@/lib/supabase/server"

export type Provincia = { sigla: string; nome: string }
export type Comune = {
  codice_catastale: string
  nome: string
  cap: string
  provincia_sigla: string
}

// Elenco province per la tendina (brief: form indirizzo con provincia →
// comune → CAP/codice catastale auto-popolati). Legge dalla vista `province`
// (107 righe) invece di dedurre le distinte da `comuni` lato applicazione:
// quella query leggeva tutte le 7904 righe di `comuni`, superando il limite
// di default di Supabase/PostgREST di 1000 righe per risposta e troncando
// silenziosamente l'elenco (bug osservato: mancavano le province dopo
// "Bergamo" in ordine alfabetico).
export async function cercaProvince(): Promise<Provincia[] | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("province")
    .select("provincia_sigla, provincia_nome")
    .order("provincia_nome")
  if (error) return { error: error.message }

  return (data ?? []).map((riga) => ({ sigla: riga.provincia_sigla, nome: riga.provincia_nome }))
}

// Comuni di una provincia, per la seconda tendina — caricati solo dopo la
// scelta della provincia (nessun bisogno di avere tutti i 7904 comuni sul
// client).
export async function cercaComuniPerProvincia(
  provinciaSigla: string
): Promise<Comune[] | { error: string }> {
  if (!provinciaSigla) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("comuni")
    .select("codice_catastale, nome, cap, provincia_sigla")
    .eq("provincia_sigla", provinciaSigla)
    .order("nome")
  if (error) return { error: error.message }

  return data ?? []
}
