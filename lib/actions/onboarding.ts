"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { rasterizzaPaginePdf } from "@/lib/pdf/rasterizza-pagine"
import { estraiDatiLicenza } from "@/lib/ai/estrai-licenza"
import {
  confermaOnboardingSchema,
  type LicenzaEstratta,
} from "@/lib/validation/licenza.schema"

const TIPI_CONSENTITI = ["application/pdf"]
const DIMENSIONE_MASSIMA_BYTES = 10 * 1024 * 1024 // 10MB

export type AnalisiLicenzaResult =
  | { error: string }
  | { dati: LicenzaEstratta; avvisi: string[] }

// Solo lettura/estrazione, nessuna scrittura su DB o Storage: Paolo rivede e
// corregge i valori prima che qualunque cosa venga effettivamente salvata
// (stesso principio già seguito per l'import PDF letture — mai automatico).
export async function analizzaLicenzaPdf(formData: FormData): Promise<AnalisiLicenzaResult> {
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nessun file selezionato." }
  }
  if (!TIPI_CONSENTITI.includes(file.type)) {
    return { error: "Formato file non supportato: solo PDF." }
  }
  if (file.size > DIMENSIONE_MASSIMA_BYTES) {
    return { error: "File troppo grande (max 10MB)." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const bytes = Buffer.from(await file.arrayBuffer())
  const { pagine, troncato } = await rasterizzaPaginePdf(bytes)

  const risultato = await estraiDatiLicenza(pagine)
  if ("error" in risultato) return { error: risultato.error }

  const avvisi: string[] = []
  if (troncato) {
    avvisi.push(`Documento più lungo di ${pagine.length} pagine: analizzate solo le prime ${pagine.length}.`)
  }
  const campiChiave: { chiave: keyof LicenzaEstratta; etichetta: string }[] = [
    { chiave: "ragioneSociale", etichetta: "ragione sociale" },
    { chiave: "codiceFiscaleDitta", etichetta: "codice fiscale ditta" },
    { chiave: "dirittoLicenzaImporto", etichetta: "importo diritto di licenza" },
  ]
  const mancanti = campiChiave.filter((c) => !risultato.data[c.chiave])
  if (mancanti.length > 0) {
    avvisi.push(
      `Non rilevati nel documento: ${mancanti.map((c) => c.etichetta).join(", ")}. Verifica e completa a mano.`
    )
  }

  return { dati: risultato.data, avvisi }
}

export type ClienteCorrispondente = { id: string; ragioneSociale: string } | null

// Suggerisce "cliente esistente" invece di crearne uno duplicato, se il CF
// estratto corrisponde già a un cliente attivo — sempre sovrascrivibile in UI.
export async function cercaClientePerCodiceFiscale(
  codiceFiscale: string
): Promise<ClienteCorrispondente> {
  if (!codiceFiscale.trim()) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("clienti")
    .select("id, ragione_sociale")
    .eq("codice_fiscale", codiceFiscale.trim())
    .eq("attivo", true)
    .limit(1)

  if (!data || data.length === 0) return null
  return { id: data[0].id, ragioneSociale: data[0].ragione_sociale }
}

export type ConfermaOnboardingResult = { error: string } | void

// Scrittura in un solo passaggio (cliente/impianto/documento), stesso
// pattern già usato in generaF24: nessuna riga orfana se l'utente abbandona
// prima di arrivare qui, il PDF originale resta nello stato del dialog
// client-side tra "analizza" e "conferma".
export async function confermaOnboardingLicenza(formData: FormData): Promise<ConfermaOnboardingResult> {
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "File licenza mancante: ricarica il documento e riprova." }
  }

  const datiGrezzi = formData.get("dati")
  if (typeof datiGrezzi !== "string") {
    return { error: "Dati del form mancanti." }
  }

  let datiParsati: unknown
  try {
    datiParsati = JSON.parse(datiGrezzi)
  } catch {
    return { error: "Dati del form non validi." }
  }

  const parsed = confermaOnboardingSchema.safeParse(datiParsati)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  let clienteId = parsed.data.clienteEsistenteId || null

  if (!clienteId) {
    if (!parsed.data.cliente) {
      return { error: "Dati del nuovo cliente mancanti." }
    }
    const c = parsed.data.cliente
    const { data: nuovoCliente, error: clienteError } = await supabase
      .from("clienti")
      .insert({
        ragione_sociale: c.ragione_sociale,
        codice_fiscale: c.codice_fiscale || null,
        partita_iva: c.partita_iva || null,
        codice_licenza: c.codice_licenza || null,
        referente_nome: c.referente_nome || null,
        referente_cognome: c.referente_cognome || null,
        referente_codice_fiscale: c.referente_codice_fiscale || null,
        indirizzo_via: c.indirizzo_via || null,
        indirizzo_cap: c.indirizzo_cap || null,
        indirizzo_citta: c.indirizzo_citta || null,
        indirizzo_provincia: c.indirizzo_provincia || null,
      })
      .select("id")
      .single()

    if (clienteError) return { error: clienteError.message }
    clienteId = nuovoCliente.id
  }

  const imp = parsed.data.impianto
  const { data: nuovoImpianto, error: impiantoError } = await supabase
    .from("impianti")
    .insert({
      cliente_id: clienteId,
      nome_impianto: imp.nome_impianto,
      tipo_soggetto: imp.tipo_soggetto,
      tipologia: imp.tipologia,
      diritto_licenza_dovuto: imp.diritto_licenza_dovuto,
      diritto_licenza_importo: imp.diritto_licenza_importo
        ? Number(imp.diritto_licenza_importo)
        : null,
      indirizzo_via: imp.indirizzo_via || null,
      indirizzo_cap: imp.indirizzo_cap || null,
      indirizzo_citta: imp.indirizzo_citta || null,
      indirizzo_provincia: imp.indirizzo_provincia || null,
      codice_impianto_f24: imp.codice_impianto_f24 || null,
      attributi_extra: {
        ...(imp.protocollo ? { licenza_protocollo: imp.protocollo } : {}),
        ...(imp.data_rilascio ? { licenza_data_rilascio: imp.data_rilascio } : {}),
        ...(imp.ufficio_dogane ? { licenza_ufficio_dogane: imp.ufficio_dogane } : {}),
      },
    })
    .select("id")
    .single()

  if (impiantoError) return { error: impiantoError.message }

  const percorso = `clienti/${clienteId}/licenza/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, file, { contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  const { error: documentoError } = await supabase.from("documenti").insert({
    tipo: "licenza",
    storage_path: percorso,
    nome_file: file.name,
    mime_type: file.type,
    dimensione_bytes: file.size,
    cliente_id: clienteId,
    impianto_id: nuovoImpianto.id,
    created_by: user.id,
  })
  if (documentoError) return { error: documentoError.message }

  revalidatePath("/anagrafiche/clienti")
  revalidatePath(`/anagrafiche/clienti/${clienteId}`)
  redirect(`/anagrafiche/impianti/${nuovoImpianto.id}`)
}
