"use server";

// L'import del worker deve avvenire prima di usare PDFParse: necessario per
// gli ambienti serverless (Vercel) — vedi anche serverExternalPackages in
// next.config.ts.
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { caricaDocumento } from "@/lib/actions/documenti";
import {
  parseEdistribuzionePdf,
  type RisultatoParsingEdistribuzione,
} from "@/lib/parsers/edistribuzione-pdf";
import { estraiLettureDaScreenshot } from "@/lib/ai/estrai-letture-screenshot";
import { parseRegistroLettureExcel } from "@/lib/parsers/registro-letture-excel";
import { energiaDaLetturaCumulativa } from "@/lib/calc/registro";
import {
  upsertLettureSchema,
  type LetturaCellaInput,
} from "@/lib/validation/lettura.schema";

const TIPI_IMMAGINE = ["image/png", "image/jpeg", "image/webp"] as const;

export type ActionResult = { error?: string } | void;

type OpzioniUpsertLetture = {
  origine?: "manuale" | "pdf_stampa" | "screenshot" | "csv" | "excel";
  documentoSorgenteId?: string;
};

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
  opts: OpzioniUpsertLetture = {},
): Promise<ActionResult> {
  const parsed = upsertLettureSchema.safeParse(righe);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  if (parsed.data.length === 0) return;

  const origine = opts.origine ?? "manuale";
  const modificataManualmente = origine === "manuale";

  const supabase = await createClient();
  const { error } = await supabase.from("letture").upsert(
    parsed.data.map((riga) => ({
      ...riga,
      origine,
      modificata_manualmente: modificataManualmente,
      documento_sorgente_id: opts.documentoSorgenteId ?? null,
    })),
    { onConflict: "contatore_id,periodo_anno,periodo_mese" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/letture/${impiantoId}`);
}

// "Lettura iniziale" (riga in testa alla tabella letture, richiesta da
// Paolo): normalmente coincide con la lettura di registro calcolata al
// 31/12 dell'anno precedente (letturaRegistro con lo storico esistente),
// ma per un contatore nuovo subentrato ad anno iniziato non c'è storico —
// l'operatore deve poterla impostare a mano. Aggiorna direttamente
// `contatori.lettura_iniziale`: sicuro perché la riga si mostra editabile
// solo quando non c'è storico precedente da alterare retroattivamente (un
// contatore con anni di letture reali mostra già il valore corretto,
// calcolato, senza bisogno di modifiche).
export async function aggiornaLetturaIniziale(
  impiantoId: string,
  contatoreId: string,
  valore: number,
): Promise<ActionResult> {
  if (!Number.isFinite(valore)) return { error: "Valore non valido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contatori")
    .update({ lettura_iniziale: valore })
    .eq("id", contatoreId)
    .eq("impianto_id", impiantoId);

  if (error) return { error: error.message };

  revalidatePath(`/letture/${impiantoId}`);
}

export type RigaDiffPdf = {
  contatoreId: string;
  contatoreMatricola: string;
  contatoreTipo: "produzione" | "immissione";
  periodoMese: number;
  periodoAnno: number;
  pdfF1: number;
  pdfF2: number;
  pdfF3: number;
  dbF1: number | null;
  dbF2: number | null;
  dbF3: number | null;
  modificataManualmente: boolean;
  stato: "nuovo" | "invariato" | "differente";
};

export type AnalisiPdfResult =
  | { error: string }
  | {
      documentoId: string;
      origine: "pdf_stampa" | "screenshot" | "excel";
      pod: string | null;
      matricolaPdf: string | null;
      clienteRagioneSociale: string | null;
      avvisi: string[];
      righe: RigaDiffPdf[];
    };

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
  formData: FormData,
): Promise<AnalisiPdfResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Nessun file selezionato" };
  }

  const isImmagine = (TIPI_IMMAGINE as readonly string[]).includes(file.type);
  const tipoDocumento = isImmagine ? "screenshot_letture" : "pdf_letture";

  const caricamento = await caricaDocumento(impiantoId, tipoDocumento, file);
  if ("error" in caricamento) return { error: caricamento.error };

  let parsed: RisultatoParsingEdistribuzione;
  if (isImmagine) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const risultato = await estraiLettureDaScreenshot(
      buffer.toString("base64"),
      file.type as "image/png" | "image/jpeg" | "image/webp",
    );
    if ("error" in risultato) return { error: risultato.error };
    parsed = {
      pod: risultato.data.pod,
      matricola: risultato.data.matricola,
      costanteK: risultato.data.costanteK,
      indirizzoFornitura: null,
      letture: risultato.data.letture
        .filter((l) => l.f1 !== null && l.f2 !== null && l.f3 !== null)
        .map((l) => ({
          mese: l.mese,
          anno: l.anno,
          f1: l.f1!,
          f2: l.f2!,
          f3: l.f3!,
        })),
      avvisi:
        risultato.data.letture.length !==
        risultato.data.letture.filter(
          (l) => l.f1 !== null && l.f2 !== null && l.f3 !== null,
        ).length
          ? [
              "Alcuni mesi nello screenshot avevano valori F1/F2/F3 incompleti e sono stati scartati: verificare manualmente.",
            ]
          : [],
    };
  } else {
    let testo: string;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const risultatoTesto = await parser.getText();
      testo = risultatoTesto.text;
    } catch (e) {
      return {
        error: `Impossibile leggere il PDF: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    parsed = parseEdistribuzionePdf(testo);
  }

  if (!parsed.pod) {
    return {
      error:
        "Codice POD non trovato nel PDF: impossibile associare un contatore.",
    };
  }
  if (parsed.letture.length === 0) {
    return { error: "Nessun valore mensile trovato nel PDF." };
  }

  const supabase = await createClient();
  // Niente .maybeSingle(): con più righe corrispondenti fallirebbe in modo
  // silenzioso (data: null, error mascherato) e il codice lo avrebbe letto
  // come "nessun contatore trovato" — messaggio fuorviante se in realtà il
  // problema è un doppione in anagrafica. Gestiamo 0/1/molti esplicitamente.
  const { data: contatoriTrovati, error: contatoreError } = await supabase
    .from("contatori")
    .select("id, matricola")
    .eq("impianto_id", impiantoId)
    .eq("pod", parsed.pod)
    .eq("attivo", true);

  if (contatoreError) return { error: contatoreError.message };

  if (!contatoriTrovati || contatoriTrovati.length === 0) {
    return {
      error: `Nessun contatore attivo con POD ${parsed.pod} trovato su questo impianto. Crealo prima di importare (o verifica che il POD sia corretto).`,
    };
  }
  if (contatoriTrovati.length > 1) {
    return {
      error: `Trovati ${contatoriTrovati.length} contatori attivi con POD ${parsed.pod} su questo impianto: il POD dovrebbe identificare un solo contatore attivo. Archivia i doppioni dalla scheda impianto prima di importare.`,
    };
  }
  const contatore = contatoriTrovati[0];

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
    };
  }

  const avvisi = [...parsed.avvisi];

  const anniCoinvolti = Array.from(new Set(parsed.letture.map((l) => l.anno)));
  const { data: lettureEsistenti } = await supabase
    .from("letture")
    .select(
      "periodo_mese, periodo_anno, valore_f1, valore_f2, valore_f3, modificata_manualmente",
    )
    .eq("contatore_id", contatore.id)
    .in("periodo_anno", anniCoinvolti);

  const righe: RigaDiffPdf[] = parsed.letture.map((l) => {
    const esistente = (lettureEsistenti ?? []).find(
      (e) => e.periodo_mese === l.mese && e.periodo_anno === l.anno,
    );
    const dbF1 = esistente?.valore_f1 ?? null;
    const dbF2 = esistente?.valore_f2 ?? null;
    const dbF3 = esistente?.valore_f3 ?? null;

    let stato: RigaDiffPdf["stato"] = "nuovo";
    if (esistente) {
      stato =
        dbF1 === l.f1 && dbF2 === l.f2 && dbF3 === l.f3
          ? "invariato"
          : "differente";
    }

    return {
      contatoreId: contatore.id,
      contatoreMatricola: contatore.matricola,
      // Il PDF/screenshot E-distribuzione riguarda sempre il contatore di
      // immissione (POD): il Quadro A (produzione) non passa da questo canale.
      contatoreTipo: "immissione" as const,
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
    };
  });

  return {
    documentoId: caricamento.documentoId,
    origine: isImmagine ? "screenshot" : "pdf_stampa",
    pod: parsed.pod,
    matricolaPdf: parsed.matricola,
    clienteRagioneSociale: null,
    avvisi,
    righe,
  };
}

// Import dal registro letture Excel che Paolo tiene già per ogni cliente
// (lib/parsers/registro-letture-excel.ts, parsing deterministico via
// etichette). A differenza del PDF/screenshot (un solo contatore per file,
// abbinato per POD) il file Excel può contenere sia la colonna Produzione
// che Immissioni: qui l'abbinamento al contatore avviene per `tipo`, non per
// POD (il file non lo riporta). Stessa filosofia "non scrivere mai senza
// conferma": righe di diff, non upsert diretto.
export async function analizzaExcelLetture(
  impiantoId: string,
  formData: FormData,
): Promise<AnalisiPdfResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Nessun file selezionato" };
  }

  const caricamento = await caricaDocumento(impiantoId, "excel_letture", file);
  if ("error" in caricamento) return { error: caricamento.error };

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseRegistroLettureExcel(buffer);

  if (parsed.colonne.length === 0) {
    return { error: parsed.avvisi[0] ?? "Nessuna lettura trovata nel file." };
  }

  const supabase = await createClient();

  // Il codice fiscale nel file deve corrispondere al cliente di QUESTO
  // impianto: Paolo gestisce ~86 impianti, un file caricato per sbaglio sul
  // cliente sbagliato scriverebbe letture false su un contatore reale.
  if (parsed.codiceFiscale) {
    const { data: impianto } = await supabase
      .from("impianti")
      .select("cliente:cliente_id(codice_fiscale, ragione_sociale)")
      .eq("id", impiantoId)
      .single();
    const cliente = impianto
      ? Array.isArray(impianto.cliente)
        ? impianto.cliente[0]
        : impianto.cliente
      : null;
    if (
      cliente?.codice_fiscale &&
      cliente.codice_fiscale !== parsed.codiceFiscale
    ) {
      return {
        error:
          `Il codice fiscale nel file (${parsed.codiceFiscale}) non corrisponde al cliente di ` +
          `questo impianto (${cliente.ragione_sociale}, CF ${cliente.codice_fiscale}): hai caricato ` +
          `il file del cliente giusto?`,
      };
    }
  }

  const { data: contatori, error: contatoriError } = await supabase
    .from("contatori")
    .select("id, matricola, tipo, modalita_letture, costante_k")
    .eq("impianto_id", impiantoId)
    .eq("attivo", true);

  if (contatoriError) return { error: contatoriError.message };

  const contatoreIds = (contatori ?? []).map((c) => c.id);
  const anniCoinvolti = Array.from(
    new Set(parsed.colonne.flatMap((c) => c.righe.map((r) => r.anno))),
  );
  const { data: lettureEsistenti } =
    contatoreIds.length > 0 && anniCoinvolti.length > 0
      ? await supabase
          .from("letture")
          .select(
            "contatore_id, periodo_mese, periodo_anno, valore_f1, modificata_manualmente",
          )
          .in("contatore_id", contatoreIds)
          .in("periodo_anno", anniCoinvolti)
      : { data: [] };

  const avvisi = [...parsed.avvisi];
  const righe: RigaDiffPdf[] = [];

  for (const tipo of ["produzione", "immissione"] as const) {
    const colonneTipo = parsed.colonne.filter((c) => c.tipo === tipo);
    if (colonneTipo.length === 0) continue;

    const candidati = (contatori ?? []).filter((c) => c.tipo === tipo);
    if (candidati.length === 0) {
      avvisi.push(
        `Nessun contatore attivo di tipo "${tipo}" su questo impianto: colonna "${tipo === "produzione" ? "Produzione" : "Immissioni"}" del file ignorata.`,
      );
      continue;
    }
    if (candidati.length > 1) {
      avvisi.push(
        `Trovati ${candidati.length} contatori attivi di tipo "${tipo}" su questo impianto: il file riporta un unico totale, non so a quale abbinarlo. Colonna ignorata — importa questi mesi a mano.`,
      );
      continue;
    }
    const contatore = candidati[0];
    if (contatore.modalita_letture !== "cumulativa") {
      avvisi.push(
        `Il contatore ${contatore.matricola} non è impostato in modalità "lettura cumulativa" (scheda impianto): colonna "${tipo === "produzione" ? "Produzione" : "Immissioni"}" ignorata.`,
      );
      continue;
    }

    for (const colonna of colonneTipo) {
      let letturaPrecedente = colonna.letturaBase;
      for (const rigaLettura of colonna.righe) {
        const kwh = energiaDaLetturaCumulativa(
          rigaLettura.letturaAttuale,
          letturaPrecedente,
          contatore.costante_k ?? 1,
        );
        letturaPrecedente = rigaLettura.letturaAttuale;

        const esistente = (lettureEsistenti ?? []).find(
          (e) =>
            e.contatore_id === contatore.id &&
            e.periodo_mese === rigaLettura.mese &&
            e.periodo_anno === rigaLettura.anno,
        );
        const dbF1 = esistente?.valore_f1 ?? null;

        righe.push({
          contatoreId: contatore.id,
          contatoreMatricola: contatore.matricola,
          contatoreTipo: tipo,
          periodoMese: rigaLettura.mese,
          periodoAnno: rigaLettura.anno,
          pdfF1: kwh,
          pdfF2: 0,
          pdfF3: 0,
          dbF1,
          dbF2: null,
          dbF3: null,
          modificataManualmente: esistente?.modificata_manualmente ?? false,
          stato: !esistente
            ? "nuovo"
            : dbF1 === kwh
              ? "invariato"
              : "differente",
        });
      }
    }
  }

  if (righe.length === 0) {
    return {
      error: avvisi[0] ?? "Nessuna lettura importabile trovata nel file.",
    };
  }

  return {
    documentoId: caricamento.documentoId,
    origine: "excel",
    pod: null,
    matricolaPdf: null,
    clienteRagioneSociale: parsed.clienteRagioneSociale,
    avvisi,
    righe,
  };
}
