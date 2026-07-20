"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { letturaRegistro, mesePrecedente, type LetturaMensile } from "@/lib/calc/registro"
import {
  generaDichiarazioneEeSemestraleXml,
  parseDichiarazioneEeSemestraleXml,
} from "@/lib/xml/dichiarazione-ee-semestrale"
import {
  dichiarazioneEeSemestraleSchema,
  type DichiarazioneEeSemestraleInput,
} from "@/lib/validation/dichiarazione-ee.schema"
import { caricaDocumento, scaricaDocumento } from "@/lib/actions/documenti"
import {
  inviaDichiarazioneSoap,
  controllaStatoSoap,
  type EsitoInvioAdm,
  type EsitoControlloStato,
} from "@/lib/adm/soap-client"
import { generaRicevutaInvioPdf } from "@/lib/pdf/ricevuta-invio-generator"

export type ActionResult = { error?: string } | void

type Contatore = {
  id: string
  matricola: string
  tipo: "produzione" | "immissione"
  costante_k: number | null
  lettura_iniziale: number
}

type Lettura = {
  contatore_id: string
  periodo_mese: number
  periodo_anno: number
  valore_f1: number | null
  valore_f2: number | null
  valore_f3: number | null
}

function mesiPeriodo(anno: number, periodoRiferimento: 1 | 2): { anno: number; mese: number }[] {
  const meseIniziale = periodoRiferimento === 1 ? 1 : 7
  return Array.from({ length: 6 }, (_, i) => ({ anno, mese: meseIniziale + i }))
}

function letturaMensile(
  letture: Lettura[],
  contatoreId: string
): (LetturaMensile & { periodo_mese: number; periodo_anno: number })[] {
  return letture
    .filter((l) => l.contatore_id === contatoreId)
    .map((l) => ({
      anno: l.periodo_anno,
      mese: l.periodo_mese,
      periodo_anno: l.periodo_anno,
      periodo_mese: l.periodo_mese,
      valore_periodo: (l.valore_f1 ?? 0) + (l.valore_f2 ?? 0) + (l.valore_f3 ?? 0),
    }))
}

export type GeneraDichiarazioneResult =
  | { error: string }
  | { dichiarazioneId: string; xmlBase64: string; nomeFile: string }

// Genera l'XML della dichiarazione semestrale (Quadro A produzione + Quadro G
// cessione, unico profilo coperto per ora — vedi piano/memoria per i
// riferimenti normativi). Non invia nulla: Paolo carica il file a mano sul
// portale ADM, poi archivia qui il PDF/protocollo che ADM restituisce
// (caricaEsitoDichiarazione più sotto).
export async function generaDichiarazioneSemestrale(
  impiantoId: string,
  anno: number,
  periodoRiferimento: 1 | 2
): Promise<GeneraDichiarazioneResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: impianto, error: impiantoError } = await supabase
    .from("impianti")
    .select("id, nome_impianto, codice_impianto_f24, codice_distributore_zona")
    .eq("id", impiantoId)
    .single()
  if (impiantoError || !impianto) return { error: impiantoError?.message ?? "Impianto non trovato" }

  const campiMancanti: string[] = []
  if (!impianto.codice_impianto_f24) campiMancanti.push("codice ditta/licenza")

  const { data: contatori, error: contatoriError } = await supabase
    .from("contatori")
    .select("id, matricola, tipo, costante_k, lettura_iniziale")
    .eq("impianto_id", impiantoId)
  if (contatoriError) return { error: contatoriError.message }

  const contatoriProduzione = (contatori ?? []).filter((c) => c.tipo === "produzione")
  const contatoriImmissione = (contatori ?? []).filter((c) => c.tipo === "immissione")

  if (contatoriProduzione.length === 0) {
    campiMancanti.push("almeno un contatore di produzione")
  }
  if (contatoriImmissione.length > 0 && !impianto.codice_distributore_zona) {
    campiMancanti.push("codice distributore di zona (Quadro G)")
  }

  const contatoreIds = (contatori ?? []).map((c) => c.id)
  // Serve la storia completa delle letture (non solo il semestre): la lettura
  // di registro progressiva (LettA/LettP) si calcola sommando dal
  // lettura_iniziale del contatore in poi — stesso pattern già usato per la
  // riconciliazione in components/letture/letture-table.tsx.
  const { data: letture, error: lettureError } =
    contatoreIds.length > 0
      ? await supabase
          .from("letture")
          .select("contatore_id, periodo_mese, periodo_anno, valore_f1, valore_f2, valore_f3")
          .in("contatore_id", contatoreIds)
      : { data: [] as Lettura[], error: null }
  if (lettureError) return { error: lettureError.message }

  const mesi = mesiPeriodo(anno, periodoRiferimento)

  function rigaContatore(contatore: Contatore) {
    const K = contatore.costante_k ?? 1
    const storia = letturaMensile(letture ?? [], contatore.id)
    return mesi.map((periodo) => {
      const letturaDelMese = storia.find(
        (l) => l.periodo_anno === periodo.anno && l.periodo_mese === periodo.mese
      )
      if (!letturaDelMese) {
        campiMancanti.push(
          `letture ${String(periodo.mese).padStart(2, "0")}/${periodo.anno} — contatore ${contatore.matricola}`
        )
      }
      const kwh = letturaDelMese?.valore_periodo ?? 0
      const lettP = letturaRegistro(contatore.lettura_iniziale, K, storia, mesePrecedente(periodo))
      const lettA = letturaRegistro(contatore.lettura_iniziale, K, storia, periodo)
      return {
        numMese: periodo.mese,
        matricola: contatore.matricola,
        lettP,
        lettA,
        diffLett: lettA - lettP,
        costLett: K,
        kwh,
      }
    })
  }

  const righeProduzionePerMese = contatoriProduzione.map(rigaContatore)
  const righeCessionePerMese = contatoriImmissione.map(rigaContatore)

  if (campiMancanti.length > 0) {
    return {
      error: `Dati incompleti per generare la dichiarazione: ${Array.from(new Set(campiMancanti)).join("; ")}.`,
    }
  }

  const quadroA = mesi.map((periodo, i) => ({
    numMese: periodo.mese,
    contatori: righeProduzionePerMese.map((righe) => {
      const { matricola, lettP, lettA, diffLett, costLett, kwh } = righe[i]
      return { matricola, lettP, lettA, diffLett, costLett, kwh }
    }),
  }))

  const quadroG =
    contatoriImmissione.length === 0
      ? null
      : mesi.map((periodo, i) => ({
          numMese: periodo.mese,
          contatori: righeCessionePerMese.map((righe) => {
            const { matricola, lettP, lettA, diffLett, costLett, kwh } = righe[i]
            return {
              matricola,
              lettP,
              lettA,
              diffLett,
              costLett,
              kwh,
              tipo: "B" as const,
              id: impianto.codice_distributore_zona!,
            }
          }),
        }))

  const parsed = dichiarazioneEeSemestraleSchema.safeParse({
    codDitta: impianto.codice_impianto_f24,
    codAtt: 1,
    anno,
    periodoRiferimento,
    quadroA,
    quadroG,
  })
  if (!parsed.success) {
    return { error: `Dati non validi per la dichiarazione: ${parsed.error.issues[0]?.message}` }
  }

  const xml = generaDichiarazioneEeSemestraleXml(parsed.data)
  const nomeFile = `EE_Semestrale_${anno}_S${periodoRiferimento}_${impianto.nome_impianto.replace(/[^a-z0-9]+/gi, "-")}.xml`
  const percorso = `impianti/${impiantoId}/dichiarazione_xml/${Date.now()}-${nomeFile}`

  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, new Blob([xml], { type: "application/xml" }), {
      contentType: "application/xml",
    })
  if (uploadError) return { error: uploadError.message }

  const { data: documento, error: documentoError } = await supabase
    .from("documenti")
    .insert({
      tipo: "dichiarazione_xml",
      storage_path: percorso,
      nome_file: nomeFile,
      mime_type: "application/xml",
      dimensione_bytes: new Blob([xml]).size,
      impianto_id: impiantoId,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (documentoError) return { error: documentoError.message }

  const { data: dichiarazione, error: dichiarazioneError } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .upsert(
      {
        impianto_id: impiantoId,
        anno,
        periodo_riferimento: periodoRiferimento,
        documento_xml_id: documento.id,
        data_generazione: new Date().toISOString(),
        created_by: user.id,
      },
      { onConflict: "impianto_id,anno,periodo_riferimento" }
    )
    .select("id")
    .single()
  if (dichiarazioneError) return { error: dichiarazioneError.message }

  revalidatePath(`/anagrafiche/impianti/${impiantoId}`)

  return {
    dichiarazioneId: dichiarazione.id,
    xmlBase64: Buffer.from(xml, "utf-8").toString("base64"),
    nomeFile,
  }
}

// Archivia il PDF o il protocollo (.txt) che ADM restituisce dopo il
// caricamento manuale dell'XML sul portale — riusa caricaDocumento
// (lib/actions/documenti.ts) e segna la dichiarazione come 'inviata'.
export async function caricaEsitoDichiarazione(
  dichiarazioneId: string,
  tipo: "dichiarazione" | "protocollo",
  formData: FormData
): Promise<ActionResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { error: "Nessun file selezionato" }
  }

  const supabase = await createClient()
  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select("id, impianto_id")
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }

  const caricamento = await caricaDocumento(riga.impianto_id, tipo, file)
  if ("error" in caricamento) return { error: caricamento.error }

  const colonna = tipo === "dichiarazione" ? "documento_pdf_id" : "documento_protocollo_id"
  const { error: updateError } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .update({
      [colonna]: caricamento.documentoId,
      stato: "inviata",
      data_invio: new Date().toISOString().slice(0, 10),
    })
    .eq("id", dichiarazioneId)
  if (updateError) return { error: updateError.message }

  revalidatePath(`/anagrafiche/impianti/${riga.impianto_id}`)
}

export type RiepilogoDichiarazioneResult =
  | { error: string }
  | {
      dati: DichiarazioneEeSemestraleInput
      impiantoNome: string
      clienteRagioneSociale: string
      dichiaranteSuggerito: string
    }

// Rilegge e ri-analizza l'XML già generato e archiviato (non lo ricalcola da
// letture/contatori): la schermata di riepilogo pre-invio deve mostrare
// esattamente ciò che è nel file che Paolo ha firmato, non un dato
// potenzialmente disallineato se qualcosa a DB fosse cambiato nel frattempo.
export async function recuperaRiepilogoDichiarazione(
  dichiarazioneId: string
): Promise<RiepilogoDichiarazioneResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select("documento_xml_id, impianto_id")
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }
  if (!riga.documento_xml_id) return { error: "XML non ancora generato per questa dichiarazione." }

  const xmlResult = await scaricaDocumento(riga.documento_xml_id)
  if ("error" in xmlResult) return xmlResult

  let dati: DichiarazioneEeSemestraleInput
  try {
    dati = parseDichiarazioneEeSemestraleXml(Buffer.from(xmlResult.base64, "base64").toString("utf-8"))
  } catch {
    return { error: "L'XML archiviato non è leggibile: rigenera la dichiarazione." }
  }

  const { data: impianto, error: impiantoError } = await supabase
    .from("impianti")
    .select("nome_impianto, cliente_id")
    .eq("id", riga.impianto_id)
    .single()
  if (impiantoError || !impianto) return { error: impiantoError?.message ?? "Impianto non trovato" }

  const { data: cliente } = await supabase
    .from("clienti")
    .select("ragione_sociale, partita_iva, codice_fiscale")
    .eq("id", impianto.cliente_id)
    .single()

  return {
    dati,
    impiantoNome: impianto.nome_impianto,
    clienteRagioneSociale: cliente?.ragione_sociale ?? "",
    dichiaranteSuggerito: cliente?.partita_iva || cliente?.codice_fiscale || "",
  }
}

// Invio S2S reale (ambiente produzione — mai addestramento, quello è solo
// per la nostra sandbox di validazione). Riusa lo stesso client SOAP già
// validato in addestramento (lib/adm/soap-client.ts). L'endpoint di
// produzione non è ancora pubblicato da ADM: fino ad allora questa azione
// ritorna l'errore friendly già previsto da inviaDichiarazioneSoap
// ("ambiente non ancora configurato"), non un crash — la funzione resta
// pronta per quando l'endpoint sarà disponibile.
export async function inviaDichiarazioneReale(
  dichiarazioneId: string,
  formData: FormData
): Promise<EsitoInvioAdm | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Seleziona il file XML firmato" }
  }
  const dichiarante = String(formData.get("dichiarante") ?? "").trim()
  if (!dichiarante) {
    return { error: "Codice fiscale/P.IVA del dichiarante mancante" }
  }

  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select("id, impianto_id")
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }

  const xmlFirmato = Buffer.from(await file.arrayBuffer())
  const risultato = await inviaDichiarazioneSoap({ ambiente: "produzione", xmlFirmato, dichiarante })

  const iut = risultato.ok ? risultato.iut : risultato.iut
  if (iut) {
    await supabase
      .from("dichiarazioni_ee_semestrali")
      .update({
        iut,
        esito_codice: risultato.ok ? risultato.esitoCodice : null,
        esito_descrizione: risultato.ok
          ? risultato.esitoMessaggi.join(" — ") || null
          : risultato.messaggio,
        esito_aggiornato_at: new Date().toISOString(),
        // Data ufficiale di registrazione riportata da ADM stessa (campo
        // dataRegistrazione dell'Output) — preferita alla nostra ora
        // locale per la ricevuta, quando disponibile.
        ...(risultato.ok && risultato.dataRegistrazione
          ? { data_registrazione_adm: risultato.dataRegistrazione }
          : {}),
        ...(risultato.ok
          ? { stato: "inviata", data_invio: new Date().toISOString().slice(0, 10) }
          : {}),
      })
      .eq("id", dichiarazioneId)
  }

  revalidatePath(`/anagrafiche/impianti/${riga.impianto_id}`)
  return risultato
}

// Controllo stato asincrono (esito sostanziale) per un invio reale già
// effettuato — stesso endpoint REST già validato in addestramento.
export async function controllaStatoDichiarazioneReale(
  dichiarazioneId: string
): Promise<EsitoControlloStato | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select("iut, impianto_id")
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }
  if (!riga.iut) return { error: "Nessun IUT disponibile: invia prima la dichiarazione." }

  const risultato = await controllaStatoSoap({ ambiente: "produzione", iut: riga.iut })

  if (risultato.ok) {
    await supabase
      .from("dichiarazioni_ee_semestrali")
      .update({
        esito_codice: risultato.codice,
        esito_descrizione: risultato.descrizione,
        esito_aggiornato_at: new Date().toISOString(),
      })
      .eq("id", dichiarazioneId)
    revalidatePath(`/anagrafiche/impianti/${riga.impianto_id}`)
  }

  return risultato
}

export type ScaricaRicevutaResult = { error: string } | { base64: string; nomeFile: string }

// Genera (o riscarica, se già generata) una ricevuta PDF con frontespizio +
// Quadro A/G + IUT/esito — S2S non fornisce nativamente un PDF pronto come
// l'invio manuale U2S (solo messaggi XML OUTPUT/ESITO), quindi lo
// costruiamo noi (lib/pdf/ricevuta-invio-generator.ts), ispirandoci a un
// vero PDF di dichiarazione U2S storico. "Numero di registrazione" non è
// disponibile (richiederebbe InteropService.recuperaEsito — costruito e
// testato, ma bloccato da un'incongruenza lato ADM, vedi PROJECT_STATUS.md):
// la ricevuta riporta IUT + esito, non quel numero.
export async function scaricaRicevutaDichiarazione(
  dichiarazioneId: string
): Promise<ScaricaRicevutaResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select(
      "impianto_id, documento_xml_id, iut, esito_codice, esito_descrizione, esito_aggiornato_at, data_registrazione_adm, documento_protocollo_id"
    )
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }
  if (!riga.iut) {
    return { error: "Nessun IUT disponibile: invia la dichiarazione via S2S prima di scaricare la ricevuta." }
  }

  if (riga.documento_protocollo_id) {
    const esistente = await scaricaDocumento(riga.documento_protocollo_id)
    if ("error" in esistente) return esistente
    return { base64: esistente.base64, nomeFile: esistente.nomeFile }
  }

  if (!riga.documento_xml_id) return { error: "XML non disponibile per questa dichiarazione." }
  const xmlResult = await scaricaDocumento(riga.documento_xml_id)
  if ("error" in xmlResult) return xmlResult

  let dati: DichiarazioneEeSemestraleInput
  try {
    dati = parseDichiarazioneEeSemestraleXml(Buffer.from(xmlResult.base64, "base64").toString("utf-8"))
  } catch {
    return { error: "L'XML archiviato non è leggibile." }
  }

  const { data: impianto } = await supabase
    .from("impianti")
    .select("cliente_id, indirizzo_via, indirizzo_citta")
    .eq("id", riga.impianto_id)
    .single()
  const { data: cliente } = impianto
    ? await supabase.from("clienti").select("ragione_sociale").eq("id", impianto.cliente_id).single()
    : { data: null }

  // Preferiamo la data ufficiale riportata da ADM stessa (dataRegistrazione
  // dell'Output) alla nostra ora locale — se non disponibile, fallback su
  // quando abbiamo registrato l'ultimo esito noto.
  const dataRegistrazione = riga.data_registrazione_adm
    ? riga.data_registrazione_adm
    : riga.esito_aggiornato_at
      ? `${new Date(riga.esito_aggiornato_at).toLocaleDateString("it-IT")} ${new Date(riga.esito_aggiornato_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
      : new Date().toLocaleDateString("it-IT")

  const pdfBytes = await generaRicevutaInvioPdf({
    iut: riga.iut,
    esitoCodice: riga.esito_codice,
    esitoDescrizione: riga.esito_descrizione,
    dataRegistrazione,
    clienteRagioneSociale: cliente?.ragione_sociale ?? "",
    impiantoComune: impianto?.indirizzo_citta ?? "",
    impiantoIndirizzo: impianto?.indirizzo_via ?? "",
    dati,
  })

  const nomeFile = `Ricevuta_${riga.iut}.pdf`
  const percorso = `impianti/${riga.impianto_id}/ricevuta/${Date.now()}-${nomeFile}`

  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, Buffer.from(pdfBytes), { contentType: "application/pdf" })
  if (uploadError) return { error: uploadError.message }

  const { data: documento, error: documentoError } = await supabase
    .from("documenti")
    .insert({
      tipo: "ricevuta",
      storage_path: percorso,
      nome_file: nomeFile,
      mime_type: "application/pdf",
      dimensione_bytes: pdfBytes.byteLength,
      impianto_id: riga.impianto_id,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (documentoError) return { error: documentoError.message }

  await supabase
    .from("dichiarazioni_ee_semestrali")
    .update({ documento_protocollo_id: documento.id })
    .eq("id", dichiarazioneId)

  revalidatePath(`/anagrafiche/impianti/${riga.impianto_id}`)

  return { base64: Buffer.from(pdfBytes).toString("base64"), nomeFile }
}
