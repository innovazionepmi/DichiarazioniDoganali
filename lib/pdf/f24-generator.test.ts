import { PDFParse } from "pdf-parse"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { generaF24Pdf, type F24Input } from "./f24-generator"

// Dati interamente inventati (nessun dato reale del cliente).
const INPUT_SINTETICO: F24Input = {
  righe: [
    { provinciaImpianto: "TV", codiceIdentificativo: "TVE00001A", importo: 23.24 },
    { provinciaImpianto: "TV", codiceIdentificativo: "TVE00002B", importo: 77.47 },
  ],
  annoRiferimento: 2026,
  dataScadenza: "2026-12-16",
}

describe("generaF24Pdf", () => {
  it("produce un PDF valido con lo stesso numero di pagine del template", async () => {
    const bytes = await generaF24Pdf(INPUT_SINTETICO)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3)
  })

  it("scrive nel PDF i valori attesi (codici riga, importi, totale) e non la sezione anagrafica", async () => {
    const bytes = await generaF24Pdf(INPUT_SINTETICO)
    const parser = new PDFParse({ data: Buffer.from(bytes) })
    const risultato = await parser.getText()
    await parser.destroy()

    // Nessun dato anagrafico va compilato — sezione "CONTRIBUENTE" lasciata
    // in bianco su richiesta esplicita di Paolo (non sempre sa con certezza
    // chi sia la persona tenuta al pagamento).
    expect(risultato.text).not.toContain("RSSMRA80A01H501U")
    expect(risultato.text).toContain("TVE00001A")
    expect(risultato.text).toContain("TVE00002B")
    expect(risultato.text).toContain("2813")
    expect(risultato.text).toContain("23,24")
    expect(risultato.text).toContain("77,47")
    // Totale = 23.24 + 77.47 = 100.71, scritto in tre punti (TOTALE O,
    // SALDO O, SALDO FINALE).
    const occorrenzeTotale = risultato.text.split("100,71").length - 1
    expect(occorrenzeTotale).toBeGreaterThanOrEqual(3)
  })

  it("tronca le righe oltre il numero massimo supportato dal modulo", async () => {
    const tanteRighe: F24Input = {
      ...INPUT_SINTETICO,
      righe: Array.from({ length: 10 }, (_, i) => ({
        provinciaImpianto: "TV",
        codiceIdentificativo: `TVE0000${i}Z`,
        importo: 10,
      })),
    }
    const bytes = await generaF24Pdf(tanteRighe)
    const parser = new PDFParse({ data: Buffer.from(bytes) })
    const risultato = await parser.getText()
    await parser.destroy()

    // Solo le prime 6 righe (F24_COORD.accise.numeroRigheMassimo) vanno
    // scritte, non tutte e 10.
    expect(risultato.text).toContain("TVE00005Z")
    expect(risultato.text).not.toContain("TVE00009Z")
  })
})
