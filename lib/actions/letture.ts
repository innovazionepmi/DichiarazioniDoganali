"use server"

// L'import del worker deve avvenire prima di usare PDFParse: necessario per
// gli ambienti serverless (Vercel) — vedi anche serverExternalPackages in
// next.config.ts.
import "pdf-parse/worker"
import { PDFParse } from "pdf-parse"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { caricaDocumento } from "@/lib/actions/documenti"
import { parseEdistribuzionePdf } from "@/lib/parsers/edistribuzione-pdf"
import { upsertLettureSchema, type LetturaCellaInput } from "@/lib/validation/lettura.schema"

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
      pod: string
      matricolaPdf: string | null
      contatoreId: string
      contatoreMatricola: string
      avvisi: string[]
      sostituzioneSospetta: boolean
      righe: RigaDiffPdf[]
    }

// Estrae e confronta col DB, ma NON scrive letture: Paolo deve confermare
// riga per riga in UI prima che qualsiasi valore venga scritto (evita che
// un import automatico sovrascriva silenziosamente una correzione manuale —
// vedi modificataManualmente su ogni riga del risultato). Il documento PDF
// viene comunque archiviato subito su Storage (caricaDocumento), a
// prescindere da cosa Paolo poi conferma di importare.
export async function analizzaPdfLetture(
  impiantoId: string,
  formData: FormData
): Promise<AnalisiPdfResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { error: "Nessun file selezionato" }
  }

  const caricamento = await caricaDocumento(impiantoId, "pdf_letture", file)
  if ("error" in caricamento) return { error: caricamento.error }

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

  const parsed = parseEdistribuzionePdf(testo)
  if (!parsed.pod) {
    return { error: "Codice POD non trovato nel PDF: impossibile associare un contatore." }
  }
  if (parsed.letture.length === 0) {
    return { error: "Nessun valore mensile trovato nel PDF." }
  }

  const supabase = await createClient()
  const { data: contatore } = await supabase
    .from("contatori")
    .select("id, matricola")
    .eq("impianto_id", impiantoId)
    .eq("pod", parsed.pod)
    .maybeSingle()

  if (!contatore) {
    return {
      error: `Nessun contatore con POD ${parsed.pod} trovato su questo impianto. Crealo prima di importare (o verifica che il POD sia corretto).`,
    }
  }

  const avvisi = [...parsed.avvisi]
  const sostituzioneSospetta =
    parsed.matricola !== null && parsed.matricola !== contatore.matricola
  if (sostituzioneSospetta) {
    avvisi.push(
      `La matricola nel PDF (${parsed.matricola}) non corrisponde a quella registrata (${contatore.matricola}) per questo POD: possibile sostituzione contatore. Verifica prima di importare.`
    )
  }

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
    pod: parsed.pod,
    matricolaPdf: parsed.matricola,
    contatoreId: contatore.id,
    contatoreMatricola: contatore.matricola,
    avvisi,
    sostituzioneSospetta,
    righe,
  }
}
