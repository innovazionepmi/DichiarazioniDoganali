"use server"

// L'import del worker deve avvenire prima di usare PDFParse: necessario per
// gli ambienti serverless (Vercel) — vedi anche serverExternalPackages in
// next.config.ts.
import "pdf-parse/worker"
import { PDFParse } from "pdf-parse"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { caricaDocumento } from "@/lib/actions/documenti"
import { parseEdistribuzionePdf, type RisultatoParsingEdistribuzione } from "@/lib/parsers/edistribuzione-pdf"
import { estraiLettureDaScreenshot } from "@/lib/ai/estrai-letture-screenshot"
import { upsertLettureSchema, type LetturaCellaInput } from "@/lib/validation/lettura.schema"

const TIPI_IMMAGINE = ["image/png", "image/jpeg", "image/webp"] as const

export type ActionResult = { error?: string } | void

type OpzioniUpsertLetture = {
  origine?: "manuale" | "pdf_stampa" | "screenshot" | "csv"
  documentoSorgenteId?: string
}

// Salvataggio bulk della tabella letture (brief §5.4). Di default simula
// l'inserimento manuale ("sempre disponibile" per correggere i casi in cui
// E-distribuzione non è affidabile): origine='manuale',
// modificata_manualmente=true. L'import da PDF (analizzaPdfLetture più sotto)
// passa opts espliciti per marcare origine e documento sorgente corretti,
// riusando lo stesso upsert (stessa protezione anti-duplicati: unique su
// contatore_id+periodo_anno+periodo_mese, vedi 20260714090006_letture.sql).
export async function upsertLetture(
  impiantoId: string,
  righe: LetturaCellaInput[],
  opts: OpzioniUpsertLetture = {}
): Promise<ActionResult> {
  const parsed = upsertLettureSchema.safeParse(righe)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" }
  }

  if (parsed.data.length === 0) return

  const origine = opts.origine ?? "manuale"
  const modificataManualmente = origine === "manuale"

  const supabase = await createClient()
  const { error } = await supabase.from("letture").upsert(
    parsed.data.map((riga) => ({
      ...riga,
      origine,
      modificata_manualmente: modificataManualmente,
      documento_sorgente_id: opts.documentoSorgenteId ?? null,
    })),
    { onConflict: "contatore_id,periodo_anno,periodo_mese" }
  )

  if (error) return { error: error.message }

  revalidatePath(`/letture/${impiantoId}`)
}

export type RigaDiffPdf = {
  contatoreId: string
  periodoMese: number
  periodoAnno: number
  pdfF1: number
  pdfF2: number
  pdfF3: number
  dbF1: number | null
  dbF2: number | null
  dbF3: number | null
  modificataManualmente: boolean
  stato: "nuovo" | "invariato" | "differente"
}

export type AnalisiPdfResult =
  | { error: string }
  | {
      documentoId: string
      origine: "pdf_stampa" | "screenshot"
      pod: string
      matricolaPdf: string | null
      contatoreId: string
      contatoreMatricola: string
      avvisi: string[]
      righe: RigaDiffPdf[]
    }

// Estrae e confronta col DB, ma NON scrive letture: Paolo deve confermare
// riga per riga in UI prima che qualsiasi valore venga scritto (evita che
// un import automatico sovrascriva silenziosamente una correzione manuale —
// vedi modificataManualmente su ogni riga del risultato). Il documento
// (PDF o screenshot) viene comunque archiviato subito su Storage
// (caricaDocumento), a prescindere da cosa Paolo poi conferma di importare.
//
// Due percorsi di estrazione, stessa logica di confronto/diff a valle:
// - PDF "stampa pagina" E-distribuzione → parsing regex deterministico
//   (parseEdistribuzionePdf), nessuna chiamata esterna.
// - Screenshot/immagine → vision AI (estraiLettureDaScreenshot), richiesta
//   esplicita dell'utente per i casi in cui stampare il PDF non è comodo
//   (es. foto da telefono). Meno affidabile del parsing regex: i valori
//   restano comunque soggetti alla stessa revisione riga per riga in UI.
export async function analizzaPdfLetture(
  impiantoId: string,
  formData: FormData
): Promise<AnalisiPdfResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { error: "Nessun file selezionato" }
  }

  const isImmagine = (TIPI_IMMAGINE as readonly string[]).includes(file.type)
  const tipoDocumento = isImmagine ? "screenshot_letture" : "pdf_letture"

  const caricamento = await caricaDocumento(impiantoId, tipoDocumento, file)
  if ("error" in caricamento) return { error: caricamento.error }

  let parsed: RisultatoParsingEdistribuzione
  if (isImmagine) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const risultato = await estraiLettureDaScreenshot(
      buffer.toString("base64"),
      file.type as "image/png" | "image/jpeg" | "image/webp"
    )
    if ("error" in risultato) return { error: risultato.error }
    parsed = {
      pod: risultato.data.pod,
      matricola: risultato.data.matricola,
      costanteK: risultato.data.costanteK,
      indirizzoFornitura: null,
      letture: risultato.data.letture
        .filter((l) => l.f1 !== null && l.f2 !== null && l.f3 !== null)
        .map((l) => ({ mese: l.mese, anno: l.anno, f1: l.f1!, f2: l.f2!, f3: l.f3! })),
      avvisi:
        risultato.data.letture.length !==
        risultato.data.letture.filter((l) => l.f1 !== null && l.f2 !== null && l.f3 !== null).length
          ? ["Alcuni mesi nello screenshot avevano valori F1/F2/F3 incompleti e sono stati scartati: verificare manualmente."]
          : [],
    }
  } else {
    let testo: string
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const parser = new PDFParse({ data: buffer })
      const risultatoTesto = await parser.getText()
      testo = risultatoTesto.text
    } catch (e) {
      return {
        error: `Impossibile leggere il PDF: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
    parsed = parseEdistribuzionePdf(testo)
  }

  if (!parsed.pod) {
    return { error: "Codice POD non trovato nel PDF: impossibile associare un contatore." }
  }
  if (parsed.letture.length === 0) {
    return { error: "Nessun valore mensile trovato nel PDF." }
  }

  const supabase = await createClient()
  // Niente .maybeSingle(): con più righe corrispondenti fallirebbe in modo
  // silenzioso (data: null, error mascherato) e il codice lo avrebbe letto
  // come "nessun contatore trovato" — messaggio fuorviante se in realtà il
  // problema è un doppione in anagrafica. Gestiamo 0/1/molti esplicitamente.
  const { data: contatoriTrovati, error: contatoreError } = await supabase
    .from("contatori")
    .select("id, matricola")
    .eq("impianto_id", impiantoId)
    .eq("pod", parsed.pod)
    .eq("attivo", true)

  if (contatoreError) return { error: contatoreError.message }

  if (!contatoriTrovati || contatoriTrovati.length === 0) {
    return {
      error: `Nessun contatore attivo con POD ${parsed.pod} trovato su questo impianto. Crealo prima di importare (o verifica che il POD sia corretto).`,
    }
  }
  if (contatoriTrovati.length > 1) {
    return {
      error: `Trovati ${contatoriTrovati.length} contatori attivi con POD ${parsed.pod} su questo impianto: il POD dovrebbe identificare un solo contatore attivo. Archivia i doppioni dalla scheda impianto prima di importare.`,
    }
  }
  const contatore = contatoriTrovati[0]

  // Sostituzione contatore (brief §5.5): la matricola nel PDF non corrisponde
  // a quella a DB per lo stesso POD. Blocchiamo l'import invece di limitarci
  // ad avvisare: scrivere comunque le letture sul contatore vecchio
  // mischierebbe le letture del contatore nuovo (che ripartono da zero) con
  // la sua storia, rompendo la lettura progressiva di registro
  // (lettura_iniziale + somma valori / K, vedi lib/calc/registro.ts).
  // L'operatore deve prima censire il nuovo contatore a mano dalla scheda
  // impianto (nuova matricola, stesso POD/tipo, lettura_iniziale=0) e cessare
  // il vecchio, poi ripetere l'import: a quel punto la ricerca per POD sopra
  // troverà il contatore giusto.
  if (parsed.matricola !== null && parsed.matricola !== contatore.matricola) {
    return {
      error:
        `La matricola nel PDF (${parsed.matricola}) non corrisponde a quella registrata ` +
        `(${contatore.matricola}) per il POD ${parsed.pod}: probabile sostituzione contatore. ` +
        `Vai sulla scheda impianto e crea il nuovo contatore (stesso POD e tipo, matricola ` +
        `${parsed.matricola}, lettura iniziale 0), imposta la data di cessazione sul contatore ` +
        `vecchio, poi ripeti l'import.`,
    }
  }

  const avvisi = [...parsed.avvisi]

  const anniCoinvolti = Array.from(new Set(parsed.letture.map((l) => l.anno)))
  const { data: lettureEsistenti } = await supabase
    .from("letture")
    .select("periodo_mese, periodo_anno, valore_f1, valore_f2, valore_f3, modificata_manualmente")
    .eq("contatore_id", contatore.id)
    .in("periodo_anno", anniCoinvolti)

  const righe: RigaDiffPdf[] = parsed.letture.map((l) => {
    const esistente = (lettureEsistenti ?? []).find(
      (e) => e.periodo_mese === l.mese && e.periodo_anno === l.anno
    )
    const dbF1 = esistente?.valore_f1 ?? null
    const dbF2 = esistente?.valore_f2 ?? null
    const dbF3 = esistente?.valore_f3 ?? null

    let stato: RigaDiffPdf["stato"] = "nuovo"
    if (esistente) {
      stato = dbF1 === l.f1 && dbF2 === l.f2 && dbF3 === l.f3 ? "invariato" : "differente"
    }

    return {
      contatoreId: contatore.id,
      periodoMese: l.mese,
      periodoAnno: l.anno,
      pdfF1: l.f1,
      pdfF2: l.f2,
      pdfF3: l.f3,
      dbF1,
      dbF2,
      dbF3,
      modificataManualmente: esistente?.modificata_manualmente ?? false,
      stato,
    }
  })

  return {
    documentoId: caricamento.documentoId,
    origine: isImmagine ? "screenshot" : "pdf_stampa",
    pod: parsed.pod,
    matricolaPdf: parsed.matricola,
    contatoreId: contatore.id,
    contatoreMatricola: contatore.matricola,
    avvisi,
    righe,
  }
}
