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

export interface F24ReferenteInput {
  codiceFiscale: string
  cognome: string
  nome: string
  dataNascita: string // YYYY-MM-DD
  sesso: "M" | "F"
  comuneNascita: string
  provinciaNascita: string
  domicilioComune: string
  domicilioProvincia: string
  domicilioVia: string
}

export interface F24RigaInput {
  provinciaImpianto: string
  codiceIdentificativo: string
  importo: number
}

export interface F24Input {
  referente: F24ReferenteInput
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

// Genera il PDF F24 Accise precompilato sovrapponendo i valori al modulo
// ufficiale vuoto (brief §5.2). Nessuna riga oltre F24_COORD.accise.
// numeroRigheMassimo: se un cliente ha più impianti soggetti di quante
// righe entrano nel modulo, il chiamante deve dividerli su più chiamate
// (una pagina/PDF ciascuna) — vedi nota nel piano.
export async function generaF24Pdf(input: F24Input): Promise<Uint8Array> {
  const templateBytes = readFileSync(TEMPLATE_PATH)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const courier = await pdfDoc.embedFont(StandardFonts.Courier)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const dataNascita = splitDataIso(input.referente.dataNascita)
  const dataScadenza = splitDataIso(input.dataScadenza)

  const righeStampate = input.righe.slice(0, F24_COORD.accise.numeroRigheMassimo)
  const totale = righeStampate.reduce((acc, r) => acc + r.importo, 0)

  for (const page of pdfDoc.getPages()) {
    drawChars(page, courier, input.referente.codiceFiscale, F24_COORD.codiceFiscale.xs, F24_COORD.codiceFiscale.y)
    drawText(page, helvetica, input.referente.cognome, F24_COORD.cognome.x, F24_COORD.cognome.y)
    drawText(page, helvetica, input.referente.nome, F24_COORD.nome.x, F24_COORD.nome.y)
    drawChars(
      page,
      courier,
      dataNascita.giorno + dataNascita.mese + dataNascita.anno,
      F24_COORD.dataNascita.xs,
      F24_COORD.dataNascita.y
    )
    drawText(page, helvetica, input.referente.sesso, F24_COORD.sesso.x, F24_COORD.sesso.y)
    drawText(page, helvetica, input.referente.comuneNascita, F24_COORD.comuneNascita.x, F24_COORD.comuneNascita.y)
    drawChars(page, courier, input.referente.provinciaNascita, F24_COORD.provinciaNascita.xs, F24_COORD.provinciaNascita.y)
    drawText(page, helvetica, input.referente.domicilioComune, F24_COORD.domicilioComune.x, F24_COORD.domicilioComune.y)
    drawChars(
      page,
      courier,
      input.referente.domicilioProvincia,
      F24_COORD.domicilioProvincia.xs,
      F24_COORD.domicilioProvincia.y
    )
    drawText(page, helvetica, input.referente.domicilioVia, F24_COORD.domicilioVia.x, F24_COORD.domicilioVia.y)

    righeStampate.forEach((riga, index) => {
      const y = F24_COORD.accise.primaRigaY - index * F24_COORD.accise.passoRiga
      drawText(page, helvetica, "D", F24_COORD.accise.ente, y)
      drawChars(page, courier, riga.provinciaImpianto, F24_COORD.accise.provincia, y)
      drawText(page, helvetica, "2813", F24_COORD.accise.codiceTributo, y)
      drawText(page, helvetica, riga.codiceIdentificativo, F24_COORD.accise.codiceIdentificativo, y)
      drawText(page, helvetica, String(input.annoRiferimento), F24_COORD.accise.anno, y)
      drawText(page, helvetica, formatImporto(riga.importo), F24_COORD.accise.importo, y)
    })

    drawText(page, helvetica, formatImporto(totale), F24_COORD.totaleO.x, F24_COORD.totaleO.y)
    drawText(page, helvetica, formatImporto(totale), F24_COORD.saldoO.x, F24_COORD.saldoO.y)
    drawText(page, helvetica, formatImporto(totale), F24_COORD.saldoFinale.x, F24_COORD.saldoFinale.y)
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
