"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { generaF24Pdf } from "@/lib/pdf/f24-generator"
import { inviaEmail } from "@/lib/email/client"
import { f24GenerazioneSchema, type F24GenerazioneInput } from "@/lib/validation/f24.schema"

export type ActionResult = { error?: string } | void

const CAMPI_REFERENTE_OBBLIGATORI = [
  "referente_cognome",
  "referente_nome",
  "referente_codice_fiscale",
  "referente_data_nascita",
  "referente_sesso",
  "referente_comune_nascita",
  "referente_provincia_nascita",
  "referente_domicilio_via",
  "referente_domicilio_citta",
  "referente_domicilio_provincia",
] as const

export type GeneraF24Result =
  | { error: string }
  | { f24GenerazioneId: string; pdfBase64: string; nomeFile: string }

// Genera il PDF F24 (brief §5.2), lo archivia su Storage + `documenti`
// (tipo 'f24') e crea la riga di tracking in `f24_generazioni`/`f24_righe`.
// Ritorna anche il PDF in base64 per il download immediato lato client —
// niente URL firmato: i file F24 sono piccoli (~150-200KB), più semplice
// restituirli direttamente nella risposta dell'azione.
export async function generaF24(input: F24GenerazioneInput): Promise<GeneraF24Result> {
  const parsed = f24GenerazioneSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: cliente, error: clienteError } = await supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, referente_cognome, referente_nome, referente_codice_fiscale, referente_data_nascita, referente_sesso, referente_comune_nascita, referente_provincia_nascita, referente_domicilio_via, referente_domicilio_citta, referente_domicilio_provincia"
    )
    .eq("id", parsed.data.clienteId)
    .single()

  if (clienteError || !cliente) return { error: clienteError?.message ?? "Cliente non trovato" }

  const campiMancanti = CAMPI_REFERENTE_OBBLIGATORI.filter(
    (campo) => !cliente[campo as keyof typeof cliente]
  )
  if (campiMancanti.length > 0) {
    return {
      error: `Dati del referente incompleti per l'F24 (sezione "Dati per F24" nella scheda cliente): mancano ${campiMancanti.join(", ")}.`,
    }
  }

  const impiantoIds = parsed.data.righe.map((r) => r.impiantoId)
  const { data: impianti, error: impiantiError } = await supabase
    .from("impianti")
    .select("id, codice_impianto_f24, indirizzo_provincia")
    .in("id", impiantoIds)

  if (impiantiError) return { error: impiantiError.message }
  if (!impianti || impianti.length !== impiantoIds.length) {
    return { error: "Uno o più impianti selezionati non sono stati trovati." }
  }

  const righeConDati = parsed.data.righe.map((r) => {
    const impianto = impianti.find((i) => i.id === r.impiantoId)
    return {
      impiantoId: r.impiantoId,
      importo: r.importo,
      codiceIdentificativo: impianto?.codice_impianto_f24 ?? "",
      provinciaImpianto:
        impianto?.indirizzo_provincia ?? cliente.referente_domicilio_provincia ?? "",
    }
  })

  const pdfBytes = await generaF24Pdf({
    referente: {
      codiceFiscale: cliente.referente_codice_fiscale!,
      cognome: cliente.referente_cognome!,
      nome: cliente.referente_nome!,
      dataNascita: cliente.referente_data_nascita!,
      sesso: cliente.referente_sesso as "M" | "F",
      comuneNascita: cliente.referente_comune_nascita!,
      provinciaNascita: cliente.referente_provincia_nascita!,
      domicilioComune: cliente.referente_domicilio_citta!,
      domicilioProvincia: cliente.referente_domicilio_provincia!,
      domicilioVia: cliente.referente_domicilio_via!,
    },
    righe: righeConDati.map((r) => ({
      provinciaImpianto: r.provinciaImpianto,
      codiceIdentificativo: r.codiceIdentificativo,
      importo: r.importo,
    })),
    annoRiferimento: parsed.data.annoRiferimento,
    dataScadenza: parsed.data.dataScadenza,
  })

  const nomeFile = `F24_${parsed.data.annoRiferimento}_${cliente.ragione_sociale.replace(/[^a-z0-9]+/gi, "-")}.pdf`
  const percorso = `clienti/${cliente.id}/f24/${Date.now()}-${nomeFile}`

  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, Buffer.from(pdfBytes), { contentType: "application/pdf" })
  if (uploadError) return { error: uploadError.message }

  const { data: documento, error: documentoError } = await supabase
    .from("documenti")
    .insert({
      tipo: "f24",
      storage_path: percorso,
      nome_file: nomeFile,
      mime_type: "application/pdf",
      dimensione_bytes: pdfBytes.byteLength,
      cliente_id: cliente.id,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (documentoError) return { error: documentoError.message }

  const { data: generazione, error: generazioneError } = await supabase
    .from("f24_generazioni")
    .insert({
      cliente_id: cliente.id,
      anno_riferimento: parsed.data.annoRiferimento,
      data_scadenza: parsed.data.dataScadenza,
      documento_id: documento.id,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (generazioneError) return { error: generazioneError.message }

  const { error: righeError } = await supabase.from("f24_righe").insert(
    righeConDati.map((r) => ({
      f24_generazione_id: generazione.id,
      impianto_id: r.impiantoId,
      importo: r.importo,
      codice_identificativo: r.codiceIdentificativo,
    }))
  )
  if (righeError) return { error: righeError.message }

  revalidatePath(`/anagrafiche/clienti/${cliente.id}`)

  return {
    f24GenerazioneId: generazione.id,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    nomeFile,
  }
}

// Riscarica un F24 già generato in passato (storico), leggendo il file
// archiviato su Storage — non rigenera nulla.
export async function scaricaF24(
  f24GenerazioneId: string
): Promise<{ error: string } | { pdfBase64: string; nomeFile: string }> {
  const supabase = await createClient()
  const { data: generazione, error } = await supabase
    .from("f24_generazioni")
    .select("documenti:documento_id(storage_path, nome_file)")
    .eq("id", f24GenerazioneId)
    .single()

  if (error || !generazione) return { error: error?.message ?? "Generazione F24 non trovata" }

  const documento = Array.isArray(generazione.documenti)
    ? generazione.documenti[0]
    : generazione.documenti
  if (!documento) return { error: "Documento F24 non trovato." }

  const { data: file, error: downloadError } = await supabase.storage
    .from("documenti")
    .download(documento.storage_path)
  if (downloadError || !file) {
    return { error: downloadError?.message ?? "Impossibile scaricare il PDF F24" }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  return { pdfBase64: buffer.toString("base64"), nomeFile: documento.nome_file }
}

// Invio email al cliente (brief §5.2: mai automatico, sempre dopo "OK
// invio" esplicito di Paolo — qui il passo di conferma è il click stesso
// sul bottone dedicato in UI, non c'è invio silenzioso in nessun altro punto
// del flusso).
export async function inviaEmailF24(f24GenerazioneId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: generazione, error } = await supabase
    .from("f24_generazioni")
    .select(
      "id, cliente_id, anno_riferimento, cliente:cliente_id(ragione_sociale, referente_email), documenti:documento_id(storage_path, nome_file)"
    )
    .eq("id", f24GenerazioneId)
    .single()

  if (error || !generazione) return { error: error?.message ?? "Generazione F24 non trovata" }

  const cliente = Array.isArray(generazione.cliente) ? generazione.cliente[0] : generazione.cliente
  const documento = Array.isArray(generazione.documenti)
    ? generazione.documenti[0]
    : generazione.documenti

  if (!cliente?.referente_email) {
    return { error: "Il cliente non ha un'email del referente impostata in anagrafica." }
  }
  if (!documento) return { error: "Documento F24 non trovato." }

  const { data: file, error: downloadError } = await supabase.storage
    .from("documenti")
    .download(documento.storage_path)
  if (downloadError || !file) {
    return { error: downloadError?.message ?? "Impossibile leggere il PDF F24 da inviare" }
  }

  try {
    await inviaEmail({
      to: cliente.referente_email,
      subject: `Avviso pagamento diritto di licenza ${generazione.anno_riferimento} — ${cliente.ragione_sociale}`,
      html: `<p>In allegato l'F24 precompilato per il pagamento del diritto di licenza per l'anno ${generazione.anno_riferimento}.</p>`,
      attachments: [
        {
          filename: documento.nome_file,
          content: Buffer.from(await file.arrayBuffer()),
          contentType: "application/pdf",
        },
      ],
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore nell'invio dell'email" }
  }

  const { error: updateError } = await supabase
    .from("f24_generazioni")
    .update({ stato: "inviato", data_invio: new Date().toISOString() })
    .eq("id", f24GenerazioneId)
  if (updateError) return { error: updateError.message }

  revalidatePath(`/anagrafiche/clienti/${generazione.cliente_id}`)
}
