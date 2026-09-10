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
// comune → CAP/codice catastale auto-popolati). Query leggera: 107 righe,
// distinct su una tabella statica — nessuna cache dedicata, il client la
// carica una sola volta al mount del selettore.
export async function cercaProvince(): Promise<Provincia[] | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("comuni")
    .select("provincia_sigla, provincia_nome")
    .order("provincia_nome")
  if (error) return { error: error.message }

  const viste = new Set<string>()
  const province: Provincia[] = []
  for (const riga of data ?? []) {
    if (viste.has(riga.provincia_sigla)) continue
    viste.add(riga.provincia_sigla)
    province.push({ sigla: riga.provincia_sigla, nome: riga.provincia_nome })
  }
  return province
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
