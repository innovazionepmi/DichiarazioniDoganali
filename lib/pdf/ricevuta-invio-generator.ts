import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import type { DichiarazioneEeSemestraleInput } from "../validation/dichiarazione-ee.schema"

// Ricevuta PDF dell'invio S2S — S2S non restituisce un PDF pronto come
// l'invio manuale U2S (solo XML OUTPUT/ESITO, vedi PROJECT_STATUS.md), lo
// costruiamo noi. Impaginazione ispirata a un vero PDF di dichiarazione U2S
// storico fornito dall'utente (frontespizio + Quadro A + Quadro G), non
// un modulo ufficiale — qui in più mostriamo IUT ed esito ADM, assenti nel
// vecchio flusso manuale.

export interface RicevutaInvioInput {
  iut: string
  esitoCodice: string | null
  esitoDescrizione: string | null
  dataRegistrazione: string
  clienteRagioneSociale: string
  impiantoComune: string
  impiantoIndirizzo: string
  dati: DichiarazioneEeSemestraleInput
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 45

function centrato(page: PDFPage, font: PDFFont, text: string, y: number, size: number) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font })
}

function bordoPagina(page: PDFPage) {
  page.drawRectangle({
    x: MARGIN - 10,
    y: MARGIN - 10,
    width: PAGE_WIDTH - 2 * (MARGIN - 10),
    height: PAGE_HEIGHT - 2 * (MARGIN - 10),
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  })
}

type RigaTabella = (string | number)[]

function disegnaTabella(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  yInizio: number,
  intestazioni: string[],
  larghezze: number[],
  righe: RigaTabella[],
  rigaTotale?: RigaTabella
) {
  const larghezzaTotale = larghezze.reduce((a, b) => a + b, 0)
  const altezzaRiga = 16
  const numeroRighe = righe.length + 1 + (rigaTotale ? 1 : 0)
  const yFine = yInizio - altezzaRiga * numeroRighe

  const colonneX = [MARGIN]
  for (const l of larghezze) colonneX.push(colonneX[colonneX.length - 1] + l)

  for (let r = 0; r <= numeroRighe; r++) {
    const yLinea = yInizio - r * altezzaRiga
    page.drawLine({
      start: { x: MARGIN, y: yLinea },
      end: { x: MARGIN + larghezzaTotale, y: yLinea },
      thickness: r <= 1 ? 1 : 0.5,
      color: rgb(0, 0, 0),
    })
  }
  for (const x of colonneX) {
    page.drawLine({ start: { x, y: yInizio }, end: { x, y: yFine }, thickness: 0.5, color: rgb(0, 0, 0) })
  }

  intestazioni.forEach((testo, i) => {
    page.drawText(testo, { x: colonneX[i] + 4, y: yInizio - altezzaRiga + 4, size: 8, font: fontBold })
  })
  righe.forEach((riga, ri) => {
    const y = yInizio - altezzaRiga * (ri + 2) + 4
    riga.forEach((cella, ci) => {
      page.drawText(String(cella), { x: colonneX[ci] + 4, y, size: 8, font })
    })
  })
  if (rigaTotale) {
    const y = yInizio - altezzaRiga * (righe.length + 2) + 4
    rigaTotale.forEach((cella, ci) => {
      page.drawText(String(cella), { x: colonneX[ci] + 4, y, size: 8, font: fontBold })
    })
  }

  return yFine
}

// Pagine Quadro A/C/G, condivise tra la ricevuta post-invio e l'anteprima
// pre-invio: stesso identico contenuto dichiarativo in entrambi i casi,
// cambia solo il frontespizio (esito ADM vs. avviso di bozza).
function disegnaQuadri(pdfDoc: PDFDocument, helvetica: PDFFont, helveticaBold: PDFFont, dati: DichiarazioneEeSemestraleInput) {
  // --- Pagina 2: Quadro A ---
  const p2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  bordoPagina(p2)
  let y2 = PAGE_HEIGHT - 70
  centrato(p2, helveticaBold, "QUADRO A — ENERGIA ELETTRICA PRODOTTA", y2, 12)
  y2 -= 30

  const righeA: RigaTabella[] = dati.quadroA.flatMap((mese) =>
    mese.contatori.map((c) => [
      mese.numMese,
      c.matricola,
      c.lettA.toFixed(2),
      c.lettP.toFixed(2),
      c.diffLett.toFixed(2),
      c.costLett.toFixed(2),
      Math.round(c.kwh),
    ])
  )
  const totaleA = dati.quadroA.reduce(
    (acc, mese) => acc + mese.contatori.reduce((a, c) => a + Math.round(c.kwh), 0),
    0
  )
  disegnaTabella(
    p2,
    helvetica,
    helveticaBold,
    y2,
    ["Mese", "Matricola", "Lett. Attuale", "Lett. Prec.", "Differenza", "Cost.", "kWh"],
    [40, 90, 75, 75, 75, 55, 60],
    righeA,
    ["", "", "", "", "", "TOTALE", totaleA]
  )

  // --- Pagina 3: Quadro C (autoconsumo esente) ---
  const p3c = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  bordoPagina(p3c)
  let y3c = PAGE_HEIGHT - 70
  centrato(p3c, helveticaBold, "QUADRO C — CONSUMI PROPRI ESENTI", y3c, 12)
  y3c -= 30

  const righeC: RigaTabella[] = dati.quadroC.map((mese) => [mese.numMese, "L2", mese.kwh])
  const totaleC = dati.quadroC.reduce((acc, mese) => acc + mese.kwh, 0)
  disegnaTabella(
    p3c,
    helvetica,
    helveticaBold,
    y3c,
    ["Mese", "Tipologia", "kWh"],
    [60, 90, 65],
    righeC,
    ["", "TOTALE", totaleC]
  )

  // --- Pagina 4: Quadro G (se presente) ---
  if (dati.quadroG) {
    const p3 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    bordoPagina(p3)
    let y3 = PAGE_HEIGHT - 70
    centrato(p3, helveticaBold, "QUADRO G — ENERGIA ELETTRICA CEDUTA", y3, 12)
    y3 -= 30

    const righeG: RigaTabella[] = dati.quadroG.flatMap((mese) =>
      mese.contatori.map((c) => [
        mese.numMese,
        c.tipo,
        c.id,
        c.matricola,
        c.lettA.toFixed(2),
        c.lettP.toFixed(2),
        Math.round(c.kwh),
      ])
    )
    const totaleG = dati.quadroG.reduce(
      (acc, mese) => acc + mese.contatori.reduce((a, c) => a + Math.round(c.kwh), 0),
      0
    )
    disegnaTabella(
      p3,
      helvetica,
      helveticaBold,
      y3,
      ["Mese", "Tipo", "Cod. Identif.", "Matricola", "Lett. Attuale", "Lett. Prec.", "kWh"],
      [40, 35, 90, 90, 75, 75, 65],
      righeG,
      ["", "", "", "", "", "TOTALE", totaleG]
    )
  }
}

function disegnaTestataFrontespizio(
  p1: PDFPage,
  helvetica: PDFFont,
  helveticaBold: PDFFont,
  input: { codDitta: string; clienteRagioneSociale: string; impiantoComune: string; impiantoIndirizzo: string; anno: number; periodoRiferimento: number }
) {
  bordoPagina(p1)
  let y = PAGE_HEIGHT - 70

  centrato(p1, helveticaBold, "AGENZIA DELLE DOGANE E DEI MONOPOLI", y, 14)
  y -= 40

  const campi: [string, string][] = [
    ["Codice ditta", `IT00${input.codDitta}`],
    ["Denominazione", input.clienteRagioneSociale],
    ["Comune", input.impiantoComune],
    ["Indirizzo", input.impiantoIndirizzo],
  ]
  for (const [etichetta, valore] of campi) {
    p1.drawText(etichetta, { x: MARGIN, y, size: 10, font: helvetica })
    p1.drawText(valore, { x: MARGIN + 150, y, size: 10, font: helveticaBold })
    y -= 18
  }
  y -= 20

  centrato(p1, helveticaBold, "IMPOSTE SUL CONSUMO DI ENERGIA ELETTRICA", y, 12)
  y -= 20
  centrato(p1, helveticaBold, "Dichiarazione Semestrale — invio System to System (S2S)", y, 11)
  y -= 16
  centrato(p1, helvetica, `Periodo: Anno ${input.anno} — ${input.periodoRiferimento}° semestre`, y, 10)
  y -= 50

  return y
}

export async function generaRicevutaInvioPdf(input: RicevutaInvioInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // --- Pagina 1: frontespizio + esito ---
  const p1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = disegnaTestataFrontespizio(p1, helvetica, helveticaBold, {
    codDitta: input.dati.codDitta,
    clienteRagioneSociale: input.clienteRagioneSociale,
    impiantoComune: input.impiantoComune,
    impiantoIndirizzo: input.impiantoIndirizzo,
    anno: input.dati.anno,
    periodoRiferimento: input.dati.periodoRiferimento,
  })

  const esito: [string, string][] = [
    ["IUT", input.iut],
    ["Data registrazione", input.dataRegistrazione],
    ["Esito ADM", input.esitoDescrizione ?? "Non ancora disponibile"],
    ...(input.esitoCodice ? ([["Codice esito", input.esitoCodice]] as [string, string][]) : []),
  ]
  for (const [etichetta, valore] of esito) {
    p1.drawText(`${etichetta}:`, { x: MARGIN, y, size: 10, font: helvetica })
    p1.drawText(valore, { x: MARGIN + 150, y, size: 10, font: helveticaBold })
    y -= 18
  }

  disegnaQuadri(pdfDoc, helvetica, helveticaBold, input.dati)

  return pdfDoc.save()
}

export interface AnteprimaDichiarazioneInput {
  clienteRagioneSociale: string
  impiantoComune: string
  impiantoIndirizzo: string
  dati: DichiarazioneEeSemestraleInput
}

// Anteprima pre-invio (feedback Paolo: vuole poter controllare il contenuto
// stampato prima di firmarlo e inviarlo a S2S) — stesso frontespizio e
// stessi Quadri A/C/G della ricevuta, ma senza IUT/esito (non esistono
// ancora) e con un avviso ben visibile che non è un documento ufficiale.
export async function generaAnteprimaDichiarazionePdf(
  input: AnteprimaDichiarazioneInput
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const p1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const y = disegnaTestataFrontespizio(p1, helvetica, helveticaBold, {
    codDitta: input.dati.codDitta,
    clienteRagioneSociale: input.clienteRagioneSociale,
    impiantoComune: input.impiantoComune,
    impiantoIndirizzo: input.impiantoIndirizzo,
    anno: input.dati.anno,
    periodoRiferimento: input.dati.periodoRiferimento,
  })

  centrato(p1, helveticaBold, "ANTEPRIMA — DOCUMENTO NON INVIATO", y - 10, 12)
  centrato(
    p1,
    helvetica,
    "Solo per verifica prima dell'invio all'Agenzia delle Dogane: non ha valore ufficiale.",
    y - 28,
    9
  )
  centrato(
    p1,
    helvetica,
    `Generato il ${new Date().toLocaleDateString("it-IT")}`,
    y - 44,
    9
  )

  disegnaQuadri(pdfDoc, helvetica, helveticaBold, input.dati)

  return pdfDoc.save()
}
