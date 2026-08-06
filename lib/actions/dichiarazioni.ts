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
import { inviaEmail } from "@/lib/email/client"

const MESI_LABEL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

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

  // Quadro C — autoconsumo esente da fonte rinnovabile (Allegato 4, brief
  // §5.8: profilo "officina di produzione da fonti rinnovabili uso proprio
  // esente" richiede A, C, G — la circolare 20/2026 ha corretto solo il
  // refuso sul Quadro L, non ha toccato C). Misurato "per differenza"
  // (produzione − immissione), non da un contatore dedicato — coerente con
  // Circolare 20/2026 punto 1. Un autoconsumo negativo (immissione >
  // produzione) è un'anomalia nei dati, non un caso legittimo da dichiarare:
  // stesso alert già mostrato in /letture, qui blocca la generazione invece
  // di lasciar passare un valore che l'XSD non accetterebbe comunque
  // (kWh non può essere negativo).
  const quadroC = mesi.map((periodo, i) => {
    const produzioneTot = righeProduzionePerMese.reduce((acc, righe) => acc + righe[i].kwh, 0)
    const immissioneTot = righeCessionePerMese.reduce((acc, righe) => acc + righe[i].kwh, 0)
    const autoconsumo = produzioneTot - immissioneTot
    if (autoconsumo < 0) {
      campiMancanti.push(
        `autoconsumo negativo nel mese ${String(periodo.mese).padStart(2, "0")}/${periodo.anno} (immissione maggiore della produzione: controlla le letture)`
      )
    }
    return { numMese: periodo.mese, kwh: autoconsumo }
  })

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
    quadroC,
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
// validato in addestramento (lib/adm/soap-client.ts). Endpoint di
// produzione confermato (platform.adm.gov.it, vedi soap-client.ts) —
// questa azione può ora davvero contattare ADM, non solo rispondere con
// l'errore friendly di prima.
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

export type DichiarazioneInviata = {
  id: string
  anno: number
  periodoRiferimento: 1 | 2
  iut: string
  impiantoNome: string
  clienteRagioneSociale: string
  clienteEmail: string | null
  emailClienteInviataAt: string | null
}

// Elenco delle dichiarazioni già accolte da ADM (IUT presente), per la
// sezione di test in /impostazioni: permette di verificare il percorso
// reale "invia email al cliente" (inviaRicevutaClienteEmail) su una
// dichiarazione vera già inviata via S2S, senza dover navigare fino alla
// scheda impianto specifica.
export async function listaDichiarazioniInviate(): Promise<DichiarazioneInviata[] | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select(
      "id, anno, periodo_riferimento, iut, email_cliente_inviata_at, impianto:impianto_id(nome_impianto, cliente:cliente_id(ragione_sociale, referente_email))"
    )
    .not("iut", "is", null)
    .order("anno", { ascending: false })
    .order("periodo_riferimento", { ascending: false })
  if (error) return { error: error.message }

  return (data ?? []).map((d) => {
    const impianto = Array.isArray(d.impianto) ? d.impianto[0] : d.impianto
    const cliente = impianto
      ? Array.isArray(impianto.cliente)
        ? impianto.cliente[0]
        : impianto.cliente
      : null
    return {
      id: d.id,
      anno: d.anno,
      periodoRiferimento: d.periodo_riferimento as 1 | 2,
      iut: d.iut as string,
      impiantoNome: impianto?.nome_impianto ?? "—",
      clienteRagioneSociale: cliente?.ragione_sociale ?? "—",
      clienteEmail: cliente?.referente_email ?? null,
      emailClienteInviataAt: d.email_cliente_inviata_at,
    }
  })
}

// "Invia ricevute dichiarazione" (brief §5.8): compone e manda l'email al
// cliente finale con la ricevuta (riusa scaricaRicevutaDichiarazione — la
// genera se non esiste ancora, altrimenti riusa quella già archiviata) e
// una tabellina con le letture di fine mese del periodo, che il cliente
// riporterà sul proprio registro cartaceo. Mai automatico: parte solo dal
// click esplicito sul bottone dedicato in UI (stesso pattern di
// inviaEmailF24).
export async function inviaRicevutaClienteEmail(dichiarazioneId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const { data: riga, error } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .select("impianto_id, anno, periodo_riferimento, iut, documento_xml_id")
    .eq("id", dichiarazioneId)
    .single()
  if (error || !riga) return { error: error?.message ?? "Dichiarazione non trovata" }
  if (!riga.iut) {
    return { error: "Invia prima la dichiarazione via S2S: senza esito non c'è nulla da mandare al cliente." }
  }
  if (!riga.documento_xml_id) return { error: "XML non disponibile per questa dichiarazione." }

  const { data: impianto, error: impiantoError } = await supabase
    .from("impianti")
    .select("nome_impianto, cliente_id")
    .eq("id", riga.impianto_id)
    .single()
  if (impiantoError || !impianto) return { error: impiantoError?.message ?? "Impianto non trovato" }

  const { data: cliente, error: clienteError } = await supabase
    .from("clienti")
    .select("ragione_sociale, referente_email")
    .eq("id", impianto.cliente_id)
    .single()
  if (clienteError || !cliente) return { error: clienteError?.message ?? "Cliente non trovato" }
  if (!cliente.referente_email) {
    return { error: "Il cliente non ha un'email del referente impostata in anagrafica." }
  }

  const ricevuta = await scaricaRicevutaDichiarazione(dichiarazioneId)
  if ("error" in ricevuta) return ricevuta

  const xmlResult = await scaricaDocumento(riga.documento_xml_id)
  if ("error" in xmlResult) return xmlResult

  let dati: DichiarazioneEeSemestraleInput
  try {
    dati = parseDichiarazioneEeSemestraleXml(Buffer.from(xmlResult.base64, "base64").toString("utf-8"))
  } catch {
    return { error: "L'XML archiviato non è leggibile." }
  }

  const righeTabellina = dati.quadroA.flatMap((mese) =>
    mese.contatori.map((c) => ({
      mese: MESI_LABEL[mese.numMese - 1],
      matricola: c.matricola,
      lettura: c.lettA.toFixed(2),
    }))
  )
  const righeTabellinaHtml = righeTabellina
    .map(
      (r) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${r.mese}</td><td style="padding:4px 8px;border:1px solid #ddd;">${r.matricola}</td><td style="padding:4px 8px;border:1px solid #ddd;">${r.lettura}</td></tr>`
    )
    .join("")

  const html = `
    <p>Gentile cliente,</p>
    <p>in allegato la ricevuta della dichiarazione doganale di energia elettrica per il periodo
    <strong>${riga.anno} — ${riga.periodo_riferimento}° semestre</strong> (IUT ${riga.iut}).</p>
    <p>Di seguito le letture di fine mese da riportare sul registro cartaceo:</p>
    <table style="border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mese</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Matricola</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Lettura</th>
        </tr>
      </thead>
      <tbody>${righeTabellinaHtml}</tbody>
    </table>
  `

  try {
    await inviaEmail({
      to: cliente.referente_email,
      subject: `Dichiarazione energia elettrica ${riga.anno} — ${riga.periodo_riferimento}° semestre — ${cliente.ragione_sociale}`,
      html,
      attachments: [
        {
          filename: ricevuta.nomeFile,
          content: Buffer.from(ricevuta.base64, "base64"),
          contentType: "application/pdf",
        },
      ],
      contesto: {
        tipo: "ricevuta_dichiarazione",
        clienteId: impianto.cliente_id,
        impiantoId: riga.impianto_id,
      },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore nell'invio dell'email" }
  }

  const { error: updateError } = await supabase
    .from("dichiarazioni_ee_semestrali")
    .update({ email_cliente_inviata_at: new Date().toISOString() })
    .eq("id", dichiarazioneId)
  if (updateError) return { error: updateError.message }

  revalidatePath(`/anagrafiche/impianti/${riga.impianto_id}`)
}
