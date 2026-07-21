"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { letturaRegistro, type LetturaMensile } from "@/lib/calc/registro"
import { generaRegistroLetturePdf } from "@/lib/pdf/registro-letture-generator"
import { inviaEmail } from "@/lib/email/client"

export type GeneraRegistroLettureResult =
  | { error: string }
  | { pdfBase64: string; nomeFile: string }

export type ActionResult = { error?: string } | void

// Genera il registro letture (Mod. M-bis 36, brief Fase 4/5) per un intero
// anno solare — a differenza della dichiarazione (semestrale dal 2026), il
// registro è un libro/ledger annuale indipendente dalla periodicità della
// dichiarazione: contiene tutti i contatori dell'impianto (produzione e
// immissione insieme), non solo quelli coinvolti in un singolo quadro.
export async function generaRegistroLetture(
  impiantoId: string,
  anno: number
): Promise<GeneraRegistroLettureResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: impianto, error: impiantoError } = await supabase
    .from("impianti")
    .select(
      "id, nome_impianto, cliente_id, codice_impianto_f24, indirizzo_via, indirizzo_citta, attributi_extra"
    )
    .eq("id", impiantoId)
    .single()
  if (impiantoError || !impianto) return { error: impiantoError?.message ?? "Impianto non trovato" }
  if (!impianto.codice_impianto_f24) {
    return { error: "Manca il codice ditta/licenza dell'impianto: compilalo prima di generare il registro." }
  }

  const { data: cliente, error: clienteError } = await supabase
    .from("clienti")
    .select("ragione_sociale")
    .eq("id", impianto.cliente_id)
    .single()
  if (clienteError || !cliente) return { error: clienteError?.message ?? "Cliente non trovato" }

  const { data: contatori, error: contatoriError } = await supabase
    .from("contatori")
    .select("id, matricola, costante_k, lettura_iniziale")
    .eq("impianto_id", impiantoId)
  if (contatoriError) return { error: contatoriError.message }
  if (!contatori || contatori.length === 0) {
    return { error: "Nessun contatore censito per questo impianto." }
  }

  const contatoreIds = contatori.map((c) => c.id)
  const { data: letture, error: lettureError } = await supabase
    .from("letture")
    .select("contatore_id, periodo_mese, periodo_anno, valore_f1, valore_f2, valore_f3")
    .in("contatore_id", contatoreIds)
  if (lettureError) return { error: lettureError.message }

  const lettureExtra: Record<string, LetturaMensile[]> = {}
  for (const c of contatori) {
    lettureExtra[c.id] = (letture ?? [])
      .filter((l) => l.contatore_id === c.id)
      .map((l) => ({
        anno: l.periodo_anno,
        mese: l.periodo_mese,
        valore_periodo: (l.valore_f1 ?? 0) + (l.valore_f2 ?? 0) + (l.valore_f3 ?? 0),
      }))
  }

  const contatoriInput = contatori.map((c) => {
    const K = c.costante_k ?? 1
    const storia = lettureExtra[c.id]
    const letturePerMese = Array.from({ length: 12 }, (_, i) => {
      const mese = i + 1
      const haLetture = storia.some((l) => l.anno === anno && l.mese === mese)
      if (!haLetture) return null
      return letturaRegistro(c.lettura_iniziale, K, storia, { anno, mese })
    })
    return { matricola: c.matricola, letturePerMese }
  })

  const attributiExtra = (impianto.attributi_extra ?? {}) as Record<string, unknown>

  const pdfBytes = await generaRegistroLetturePdf({
    ragioneSociale: cliente.ragione_sociale,
    codiceDitta: impianto.codice_impianto_f24,
    comune: impianto.indirizzo_citta ?? "",
    indirizzo: impianto.indirizzo_via ?? "",
    ufficioDogane: (attributiExtra.licenza_ufficio_dogane as string | undefined) ?? null,
    anno,
    contatori: contatoriInput,
  })

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64")
  const nomeFile = `Registro_Letture_${anno}_${impianto.nome_impianto.replace(/[^a-z0-9]+/gi, "-")}.pdf`
  const percorso = `impianti/${impiantoId}/registro_letture/${Date.now()}-${nomeFile}`

  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, Buffer.from(pdfBytes), { contentType: "application/pdf" })
  if (uploadError) return { error: uploadError.message }

  const { error: documentoError } = await supabase.from("documenti").insert({
    tipo: "registro_letture",
    storage_path: percorso,
    nome_file: nomeFile,
    mime_type: "application/pdf",
    dimensione_bytes: pdfBytes.byteLength,
    impianto_id: impiantoId,
    data_documento: `${anno}-12-31`,
    created_by: user.id,
  })
  if (documentoError) return { error: documentoError.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)

  return { pdfBase64, nomeFile }
}

// Brief §5.3: "Il registro è in bianco: NON si relaziona con le letture
// E-distribuzione, pesca solo i dati generali dell'impianto. Invio via
// email ai clienti a inizio anno". A differenza di generaRegistroLetture
// (che precompila le letture già inserite, comodo per uso interno), qui le
// 12 celle mensili di ogni contatore sono **sempre vuote** — il cliente lo
// stampa e lo compila a mano durante l'anno, per normativa.
export async function inviaRegistroLettureVuotoEmail(
  impiantoId: string,
  anno: number
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: impianto, error: impiantoError } = await supabase
    .from("impianti")
    .select(
      "id, nome_impianto, cliente_id, codice_impianto_f24, indirizzo_via, indirizzo_citta, attributi_extra"
    )
    .eq("id", impiantoId)
    .single()
  if (impiantoError || !impianto) return { error: impiantoError?.message ?? "Impianto non trovato" }
  if (!impianto.codice_impianto_f24) {
    return { error: "Manca il codice ditta/licenza dell'impianto: compilalo prima di generare il registro." }
  }

  const { data: cliente, error: clienteError } = await supabase
    .from("clienti")
    .select("ragione_sociale, referente_email")
    .eq("id", impianto.cliente_id)
    .single()
  if (clienteError || !cliente) return { error: clienteError?.message ?? "Cliente non trovato" }
  if (!cliente.referente_email) {
    return { error: "Il cliente non ha un'email del referente impostata in anagrafica." }
  }

  const { data: contatori, error: contatoriError } = await supabase
    .from("contatori")
    .select("matricola")
    .eq("impianto_id", impiantoId)
  if (contatoriError) return { error: contatoriError.message }
  if (!contatori || contatori.length === 0) {
    return { error: "Nessun contatore censito per questo impianto." }
  }

  const attributiExtra = (impianto.attributi_extra ?? {}) as Record<string, unknown>

  const pdfBytes = await generaRegistroLetturePdf({
    ragioneSociale: cliente.ragione_sociale,
    codiceDitta: impianto.codice_impianto_f24,
    comune: impianto.indirizzo_citta ?? "",
    indirizzo: impianto.indirizzo_via ?? "",
    ufficioDogane: (attributiExtra.licenza_ufficio_dogane as string | undefined) ?? null,
    anno,
    contatori: contatori.map((c) => ({
      matricola: c.matricola,
      letturePerMese: Array.from({ length: 12 }, () => null),
    })),
  })

  const nomeFile = `Registro_Letture_${anno}_${impianto.nome_impianto.replace(/[^a-z0-9]+/gi, "-")}_vuoto.pdf`
  const percorso = `impianti/${impiantoId}/registro_letture/${Date.now()}-${nomeFile}`

  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, Buffer.from(pdfBytes), { contentType: "application/pdf" })
  if (uploadError) return { error: uploadError.message }

  const { error: documentoError } = await supabase.from("documenti").insert({
    tipo: "registro_letture",
    storage_path: percorso,
    nome_file: nomeFile,
    mime_type: "application/pdf",
    dimensione_bytes: pdfBytes.byteLength,
    impianto_id: impiantoId,
    data_documento: `${anno}-01-01`,
    created_by: user.id,
  })
  if (documentoError) return { error: documentoError.message }

  try {
    await inviaEmail({
      to: cliente.referente_email,
      subject: `Registro letture ${anno} — ${cliente.ragione_sociale}`,
      html: `
        <p>Gentile cliente,</p>
        <p>in allegato il registro letture per l&apos;anno <strong>${anno}</strong>:
        va stampato e compilato a mano mese per mese, come richiesto dalla
        normativa.</p>
      `,
      attachments: [
        {
          filename: nomeFile,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore nell'invio dell'email" }
  }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)
}
