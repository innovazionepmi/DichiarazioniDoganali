import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseRegistroLettureExcel } from "./registro-letture-excel";

// Fixture costruita in memoria (nessun file binario nel repo, nessun dato
// cliente reale): ricalca la forma del registro letture che Paolo tiene per
// ogni cliente — foglio per anno, etichette "COMMITTENTE"/"Codice Fiscale",
// intestazioni "Produzione"/"Immissioni", righe mensili con letture
// cumulative (non kWh già calcolati).
async function creaWorkbookFinto(opts?: {
  omettiImmissioni?: boolean;
  mesiCompilati?: number;
  omettiIntestazioneProduzione?: boolean;
  anni?: number[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const anni = opts?.anni ?? [2026];
  const mesiCompilati = opts?.mesiCompilati ?? 12;

  for (const anno of anni) {
    const sheet = workbook.addWorksheet(String(anno));
    sheet.getCell("B2").value = "COMMITTENTE";
    sheet.getCell("C2").value = "Test SRL";
    sheet.getCell("B6").value = "Codice Fiscale";
    sheet.getCell("C6").value = "12345678901";

    if (!opts?.omettiIntestazioneProduzione) {
      sheet.getCell("C23").value = "Data";
      sheet.getCell("D23").value = "Produzione";
      sheet.getCell("E23").value = "Prelievi";
      if (!opts?.omettiImmissioni) sheet.getCell("F23").value = "Immissioni";
    }

    sheet.getCell("D27").value = 1000;
    if (!opts?.omettiImmissioni) sheet.getCell("F27").value = 500;

    const mesi = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ];
    let produzione = 1000;
    let immissione = 500;
    for (let i = 0; i < mesiCompilati; i++) {
      const riga = 28 + i;
      sheet.getCell(`B${riga}`).value = mesi[i];
      produzione += 100;
      immissione += 40;
      sheet.getCell(`D${riga}`).value = produzione;
      if (!opts?.omettiImmissioni) sheet.getCell(`F${riga}`).value = immissione;
    }
    // righe mensili oltre mesiCompilati restano con solo l'etichetta del
    // mese (come nel file reale, dove i mesi futuri non hanno ancora dati).
    for (let i = mesiCompilati; i < 12; i++) {
      sheet.getCell(`B${28 + i}`).value = mesi[i];
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseRegistroLettureExcel", () => {
  it("estrae committente, codice fiscale e le colonne produzione/immissione", async () => {
    const buffer = await creaWorkbookFinto();
    const risultato = await parseRegistroLettureExcel(buffer);

    expect(risultato.clienteRagioneSociale).toBe("Test SRL");
    expect(risultato.codiceFiscale).toBe("12345678901");
    expect(risultato.anniTrovati).toEqual([2026]);
    expect(risultato.avvisi).toEqual([]);

    const produzione = risultato.colonne.find((c) => c.tipo === "produzione");
    const immissione = risultato.colonne.find((c) => c.tipo === "immissione");
    expect(produzione?.letturaBase).toBe(1000);
    expect(produzione?.righe).toHaveLength(12);
    expect(produzione?.righe[0]).toEqual({
      mese: 1,
      anno: 2026,
      letturaAttuale: 1100,
    });
    expect(produzione?.righe[11]).toEqual({
      mese: 12,
      anno: 2026,
      letturaAttuale: 2200,
    });
    expect(immissione?.letturaBase).toBe(500);
    expect(immissione?.righe[0]).toEqual({
      mese: 1,
      anno: 2026,
      letturaAttuale: 540,
    });
  });

  it("gestisce un anno parziale (mesi futuri non ancora compilati)", async () => {
    const buffer = await creaWorkbookFinto({ mesiCompilati: 6 });
    const risultato = await parseRegistroLettureExcel(buffer);

    const produzione = risultato.colonne.find((c) => c.tipo === "produzione");
    expect(produzione?.righe).toHaveLength(6);
    expect(produzione?.righe.at(-1)?.mese).toBe(6);
  });

  it("ignora la colonna immissioni se assente, senza bloccare la produzione", async () => {
    const buffer = await creaWorkbookFinto({ omettiImmissioni: true });
    const risultato = await parseRegistroLettureExcel(buffer);

    expect(risultato.colonne.some((c) => c.tipo === "immissione")).toBe(false);
    expect(risultato.colonne.some((c) => c.tipo === "produzione")).toBe(true);
  });

  it("segnala con un avviso un foglio senza intestazione Produzione, senza far fallire l'intero file", async () => {
    const buffer = await creaWorkbookFinto({
      omettiIntestazioneProduzione: true,
    });
    const risultato = await parseRegistroLettureExcel(buffer);

    expect(risultato.colonne).toEqual([]);
    expect(risultato.avvisi[0]).toMatch(/Produzione.*non trovata/);
  });

  it("legge più fogli-anno nello stesso file", async () => {
    const buffer = await creaWorkbookFinto({ anni: [2025, 2026] });
    const risultato = await parseRegistroLettureExcel(buffer);

    expect(risultato.anniTrovati).toEqual([2025, 2026]);
    const anniColonne = new Set(risultato.colonne.map((c) => c.anno));
    expect(anniColonne).toEqual(new Set([2025, 2026]));
  });

  it("ignora fogli che non hanno un nome anno a 4 cifre (es. 'procedura')", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("procedura");
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const risultato = await parseRegistroLettureExcel(buffer);

    expect(risultato.avvisi).toEqual([
      'Nessun foglio con nome anno (es. "2026") trovato nel file.',
    ]);
  });
});
