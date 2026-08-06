import { readFileSync } from "node:fs"
import path from "node:path"
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import { F24_COORD } from "./f24-coordinates"

// Il template va letto da un percorso NON dentro public/ (quella cartella è
// servita staticamente ma non è garantito che finisca nel bundle delle
// funzioni serverless di Vercel — stesso tipo di problema già incontrato con
// pdf-parse). path.join(process.cwd(), ...) con percorso statico permette a
// Next.js di includere il file nel tracciamento automatico degli asset.
const TEMPLATE_PATH = path.join(process.cwd(), "lib/pdf/templates/f24-accise-vuoto.pdf")

export interface F24RigaInput {
  provinciaImpianto: string
  codiceIdentificativo: string
  importo: number
}

export interface F24Input {
  righe: F24RigaInput[]
  annoRiferimento: number
  dataScadenza: string // YYYY-MM-DD
}

function splitDataIso(iso: string): { giorno: string; mese: string; anno: string } {
  const [anno, mese, giorno] = iso.split("-")
  return { giorno: giorno ?? "", mese: mese ?? "", anno: anno ?? "" }
}

function formatImporto(n: number): string {
  return n.toFixed(2).replace(".", ",")
}

function drawChars(page: PDFPage, font: PDFFont, text: string, xs: readonly number[], y: number, size = 9) {
  const chars = text.toUpperCase().split("")
  for (let i = 0; i < xs.length; i++) {
    const ch = chars[i]
    if (!ch) continue
    page.drawText(ch, { x: xs[i], y, size, font })
  }
}

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 8) {
  page.drawText(text.toUpperCase(), { x, y, size, font })
}

// Testo libero vincolato a una larghezza massima (es. codice identificativo
// impianto, lunghezza variabile): riduce il font-size finché non ci sta
// dentro, invece di farlo sforare oltre il bordo della casella.
function drawTextFit(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size = 8,
  minSize = 5
) {
  const upper = text.toUpperCase()
  let fitSize = size
  while (fitSize > minSize && font.widthOfTextAtSize(upper, fitSize) > maxWidth) {
    fitSize -= 0.5
  }
  page.drawText(upper, { x, y, size: fitSize, font })
}

// Importi: il modulo ha una virgola pre-stampata come guida per i decimali.
// Invece di allineare la stringa a sinistra (che sfasa la virgola a seconda
// di quante cifre intere ha il valore), ancoriamo la virgola scritta esattamente
// alla virgola del modulo — parte intera terminante a commaX, parte
// decimale (",XX") a partire da commaX.
function drawAmountAtComma(page: PDFPage, font: PDFFont, value: number, commaX: number, y: number, size = 8) {
  const formatted = formatImporto(value)
  const commaIndex = formatted.indexOf(",")
  const intPart = formatted.slice(0, commaIndex)
  const decPart = formatted.slice(commaIndex)
  const intWidth = font.widthOfTextAtSize(intPart, size)
  page.drawText(intPart, { x: commaX - intWidth, y, size, font })
  page.drawText(decPart, { x: commaX, y, size, font })
}

// Genera il PDF F24 Accise precompilato sovrapponendo i valori al modulo
// ufficiale vuoto (brief §5.2). Nessuna riga oltre F24_COORD.accise.
// numeroRigheMassimo: se un cliente ha più impianti soggetti di quante
// righe entrano nel modulo, il chiamante deve dividerli su più chiamate
// (una pagina/PDF ciascuna) — vedi nota nel piano.
//
// La sezione "CONTRIBUENTE" (anagrafica di chi paga) resta deliberatamente
// vuota — richiesta esplicita di Paolo: non è mai sicuro di chi sia
// effettivamente la persona tenuta al pagamento, va compilata a mano da chi
// paga davvero, non dall'app.
export async function generaF24Pdf(input: F24Input): Promise<Uint8Array> {
  const templateBytes = readFileSync(TEMPLATE_PATH)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const courier = await pdfDoc.embedFont(StandardFonts.Courier)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const dataScadenza = splitDataIso(input.dataScadenza)

  const righeStampate = input.righe.slice(0, F24_COORD.accise.numeroRigheMassimo)
  const totale = righeStampate.reduce((acc, r) => acc + r.importo, 0)

  for (const page of pdfDoc.getPages()) {
    righeStampate.forEach((riga, index) => {
      const y = F24_COORD.accise.primaRigaY - index * F24_COORD.accise.passoRiga
      drawText(page, helvetica, "D", F24_COORD.accise.ente, y)
      drawChars(page, courier, riga.provinciaImpianto, F24_COORD.accise.provincia, y)
      drawText(page, helvetica, "2813", F24_COORD.accise.codiceTributo, y)
      drawTextFit(
        page,
        helvetica,
        riga.codiceIdentificativo,
        F24_COORD.accise.codiceIdentificativo.x,
        y,
        F24_COORD.accise.codiceIdentificativo.maxWidth
      )
      drawText(page, helvetica, String(input.annoRiferimento), F24_COORD.accise.anno, y)
      drawAmountAtComma(page, helvetica, riga.importo, F24_COORD.accise.importoCommaX, y)
    })

    drawAmountAtComma(page, helvetica, totale, F24_COORD.totaleO.commaX, F24_COORD.totaleO.y)
    drawAmountAtComma(page, helvetica, totale, F24_COORD.saldoO.commaX, F24_COORD.saldoO.y)
    drawAmountAtComma(page, helvetica, totale, F24_COORD.saldoFinale.commaX, F24_COORD.saldoFinale.y)
    drawChars(
      page,
      courier,
      dataScadenza.giorno + dataScadenza.mese + dataScadenza.anno,
      F24_COORD.dataScadenza.xs,
      F24_COORD.dataScadenza.y
    )
  }

  return pdfDoc.save()
}
