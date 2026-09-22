import ExcelJS from "exceljs";

// Parser deterministico (nessuna IA) per il "registro letture" Excel che
// Paolo già tiene per ciascun cliente — richiesta esplicita: caricare il
// file che ha già, non un template nostro da compilare da capo. Il file è
// il suo prospetto di lavoro personale (un foglio per anno, letture
// progressive/cumulative del contatore, non kWh mensili già calcolati:
// stessa logica di calc/registro.ts, "Stesso controllo 'Verifica' /
// 'VERIFICATO' dell'Excel del cliente" — questo file è già il riferimento
// con cui quella funzione è stata verificata).
//
// "Blindato e deterministico" qui significa: guidato da ETICHETTE fisse che
// Paolo usa in ogni suo file ("COMMITTENTE", "Codice Fiscale", intestazioni
// di colonna "Produzione"/"Immissioni", nomi mese in italiano) invece che da
// coordinate di cella rigide — così regge a piccoli spostamenti di riga/
// colonna da cliente a cliente, ma fallisce in modo esplicito (avviso, non
// un dato inventato) se le etichette attese non si trovano.

const MESI_LABEL = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

export interface LetturaCumulativaRiga {
  mese: number;
  anno: number;
  letturaAttuale: number;
}

export interface ColonnaLetture {
  tipo: "produzione" | "immissione";
  anno: number;
  letturaBase: number;
  righe: LetturaCumulativaRiga[];
}

export interface RisultatoParsingRegistroExcel {
  clienteRagioneSociale: string | null;
  codiceFiscale: string | null;
  colonne: ColonnaLetture[];
  anniTrovati: number[];
  // Dal foglio "procedura" (se presente): matricola del contatore di
  // produzione/immissione, usata a valle per abbinare la colonna giusta
  // quando l'impianto ha più contatori attivi dello stesso tipo (il foglio
  // annuale riporta solo un totale, senza dire a quale contatore appartiene).
  matricolaProduzione: string | null;
  matricolaImmissione: string | null;
  avvisi: string[];
}

function testoCella(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((r) => r.text).join("");
    }
    if ("text" in value) {
      return String((value as { text: unknown }).text);
    }
    if (value instanceof Date) return "";
    // Cella formula: { formula, result } — il testo (etichette) non è mai
    // una formula nei file osservati, ma per sicurezza non proviamo a
    // interpretarla come testo.
    return "";
  }
  return String(value).trim();
}

function numeroCella(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "result" in value) {
    const r = (value as ExcelJS.CellFormulaValue).result;
    return typeof r === "number" ? r : null;
  }
  return null;
}

// Cerca un'etichetta (case-insensitive, match esatto sul testo della cella)
// nelle prime `righeMax` righe del foglio, e ritorna il primo valore non
// vuoto nelle celle successive sulla stessa riga.
function trovaValoreEtichetta(
  sheet: ExcelJS.Worksheet,
  etichetta: string,
  righeMax = 20,
): string | null {
  const target = etichetta.toLowerCase();
  for (let r = 1; r <= Math.min(righeMax, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      if (testoCella(row.getCell(c).value).toLowerCase() !== target) continue;
      for (let c2 = c + 1; c2 <= row.cellCount + 3; c2++) {
        const valore = testoCella(row.getCell(c2).value);
        if (valore) return valore;
      }
      return null;
    }
  }
  return null;
}

// Il foglio "procedura" (se presente) riporta due blocchi "Matricola
// contatore" (etichetta in colonna B, valore nella cella a sinistra —
// ordine invertito rispetto ai fogli anno): il blocco che ha anche "Tipo di
// cessione" tra le righe seguenti riguarda il contatore di immissione
// (vettoriamento/cessione, Quadro G), l'altro il contatore di produzione.
// Solo lettura best-effort: se il foglio non c'è o non ha questa forma,
// torna semplicemente null (l'abbinamento a valle userà solo il tipo).
function parseProcedura(sheet: ExcelJS.Worksheet | undefined): {
  produzione: string | null;
  immissione: string | null;
} {
  if (!sheet) return { produzione: null, immissione: null };
  const ws = sheet;

  const blocchi: { riga: number; matricola: string }[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      if (
        testoCella(row.getCell(c).value).toLowerCase() !== "matricola contatore"
      )
        continue;
      for (let c2 = c - 1; c2 >= 1; c2--) {
        const valore = testoCella(row.getCell(c2).value);
        if (valore) {
          blocchi.push({ riga: r, matricola: valore });
          break;
        }
      }
      break;
    }
  }

  function bloccoHaCessione(rigaInizio: number, rigaFine: number): boolean {
    for (let r = rigaInizio; r < rigaFine; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        if (
          testoCella(row.getCell(c).value)
            .toLowerCase()
            .includes("tipo di cessione")
        ) {
          return true;
        }
      }
    }
    return false;
  }

  let produzione: string | null = null;
  let immissione: string | null = null;
  blocchi.forEach((blocco, i) => {
    const rigaFine =
      i + 1 < blocchi.length ? blocchi[i + 1].riga : ws.rowCount + 1;
    if (bloccoHaCessione(blocco.riga, rigaFine)) {
      if (immissione === null) immissione = blocco.matricola;
    } else if (produzione === null) {
      produzione = blocco.matricola;
    }
  });

  return { produzione, immissione };
}

function parseFoglioAnno(
  sheet: ExcelJS.Worksheet,
  anno: number,
  avvisi: string[],
): ColonnaLetture[] {
  let rigaIntestazione = -1;
  let colProduzione = -1;
  let colImmissioni = -1;

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    let prod = -1;
    let imm = -1;
    for (let c = 1; c <= row.cellCount; c++) {
      const testo = testoCella(row.getCell(c).value).toLowerCase();
      if (testo === "produzione") prod = c;
      if (testo === "immissioni") imm = c;
    }
    if (prod > 0) {
      rigaIntestazione = r;
      colProduzione = prod;
      colImmissioni = imm;
      break;
    }
  }

  if (rigaIntestazione < 0) {
    avvisi.push(
      `Foglio ${anno}: intestazione "Produzione" non trovata — foglio ignorato.`,
    );
    return [];
  }

  const righeMese: { riga: number; mese: number }[] = [];
  for (
    let r = rigaIntestazione + 1;
    r <= sheet.rowCount && righeMese.length < 12;
    r++
  ) {
    const row = sheet.getRow(r);
    let meseTrovato = -1;
    for (let c = 1; c < colProduzione; c++) {
      const idx = MESI_LABEL.indexOf(
        testoCella(row.getCell(c).value).toLowerCase(),
      );
      if (idx >= 0) {
        meseTrovato = idx + 1;
        break;
      }
    }
    if (meseTrovato > 0) righeMese.push({ riga: r, mese: meseTrovato });
  }

  if (righeMese.length !== 12) {
    avvisi.push(
      `Foglio ${anno}: trovate ${righeMese.length}/12 righe mensili riconoscibili (Gennaio…Dicembre) — foglio ignorato.`,
    );
    return [];
  }
  if (!righeMese.every((r, i) => r.mese === i + 1)) {
    avvisi.push(
      `Foglio ${anno}: le righe mensili non sono in ordine Gennaio→Dicembre — foglio ignorato.`,
    );
    return [];
  }

  const rigaBase = righeMese[0].riga - 1;
  const colonne: ColonnaLetture[] = [];

  function estraiColonna(tipo: "produzione" | "immissione", colonna: number) {
    if (colonna <= 0) return;
    const base = numeroCella(sheet.getRow(rigaBase).getCell(colonna).value);
    if (base === null) {
      avvisi.push(
        `Foglio ${anno}: lettura di base "${tipo === "produzione" ? "Produzione" : "Immissioni"}" non trovata (riga ${rigaBase}) — colonna ignorata.`,
      );
      return;
    }
    const righe: LetturaCumulativaRiga[] = [];
    for (const { riga, mese } of righeMese) {
      const valore = numeroCella(sheet.getRow(riga).getCell(colonna).value);
      if (valore !== null) righe.push({ mese, anno, letturaAttuale: valore });
    }
    if (righe.length > 0)
      colonne.push({ tipo, anno, letturaBase: base, righe });
  }

  estraiColonna("produzione", colProduzione);
  estraiColonna("immissione", colImmissioni);

  return colonne;
}

export async function parseRegistroLettureExcel(
  buffer: Buffer,
): Promise<RisultatoParsingRegistroExcel> {
  const workbook = new ExcelJS.Workbook();
  try {
    // Cast necessario: exceljs porta con sé una versione di @types/node
    // diversa da quella del progetto, con due dichiarazioni di `Buffer`
    // strutturalmente incompatibili per TS (stesso Buffer a runtime,
    // "as unknown as Buffer" non basta perché risolverebbe comunque al
    // Buffer del progetto, non a quello atteso da exceljs).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch (e) {
    return {
      clienteRagioneSociale: null,
      codiceFiscale: null,
      colonne: [],
      anniTrovati: [],
      matricolaProduzione: null,
      matricolaImmissione: null,
      avvisi: [
        `Impossibile leggere il file Excel: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const avvisi: string[] = [];
  const fogliAnno = workbook.worksheets.filter((ws) =>
    /^\d{4}$/.test(ws.name.trim()),
  );

  if (fogliAnno.length === 0) {
    avvisi.push('Nessun foglio con nome anno (es. "2026") trovato nel file.');
    return {
      clienteRagioneSociale: null,
      codiceFiscale: null,
      colonne: [],
      anniTrovati: [],
      matricolaProduzione: null,
      matricolaImmissione: null,
      avvisi,
    };
  }

  const foglioProcedura = workbook.worksheets.find(
    (ws) => ws.name.trim().toLowerCase() === "procedura",
  );
  const { produzione: matricolaProduzione, immissione: matricolaImmissione } =
    parseProcedura(foglioProcedura);

  let clienteRagioneSociale: string | null = null;
  let codiceFiscale: string | null = null;
  const colonne: ColonnaLetture[] = [];
  const anniTrovati: number[] = [];

  for (const sheet of fogliAnno) {
    const anno = Number(sheet.name.trim());
    if (clienteRagioneSociale === null) {
      clienteRagioneSociale = trovaValoreEtichetta(sheet, "committente");
    }
    if (codiceFiscale === null) {
      codiceFiscale = trovaValoreEtichetta(sheet, "codice fiscale");
    }

    const colonneFoglio = parseFoglioAnno(sheet, anno, avvisi);
    if (colonneFoglio.length > 0) {
      anniTrovati.push(anno);
      colonne.push(...colonneFoglio);
    }
  }

  if (colonne.length === 0) {
    avvisi.push(
      "Nessuna lettura mensile valida trovata in nessun foglio del file.",
    );
  }

  return {
    clienteRagioneSociale,
    codiceFiscale,
    colonne,
    anniTrovati: anniTrovati.sort((a, b) => a - b),
    matricolaProduzione,
    matricolaImmissione,
    avvisi,
  };
}
