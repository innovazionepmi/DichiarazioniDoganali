import { readFileSync } from "node:fs"
import path from "node:path"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { ultimoGiornoMese } from "@/lib/calc/registro"

// Registro letture (Serie M-bis-Mod.36) — ricostruito per replicare
// fedelmente un modello reale fornito dall'utente (frontespizio + pagina
// annuale di un registro ADM autentico, cliente Giorik: "7 frontespiszio +
// Registro letture triennale 2023 2024 2025 - GIORIK.doc"), incluso il logo
// ufficiale dell'Agenzia delle Dogane e dei Monopoli (estratto dal file
// originale, immagine pubblica dell'ente). L'originale era **triennale** (3
// fogli annuali + 1 frontespiglio): qui generiamo la versione **annuale**
// (1 solo foglio), su richiesta esplicita dell'utente.

const TEMPLATE_LOGO_PATH = path.join(process.cwd(), "lib/pdf/templates/logo-agenzia-dogane.jpg")

export interface RegistroLettureContatore {
  matricola: string
  tipo: "produzione" | "immissione"
  costanteK: number
  letturePerMese: (number | null)[] // 12 valori (gennaio..dicembre), null se mese senza letture
}

export interface RegistroLettureInput {
  ragioneSociale: string
  codiceDitta: string // senza prefisso "IT00" — lo aggiunge il generatore
  comune: string
  provincia: string
  indirizzo: string
  cap: string
  ufficioDogane: string // "Ufficio Amministrativo" dell'impianto (es. "Treviso")
  anno: number
  contatori: RegistroLettureContatore[]
}

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

const TIPO_LABEL: Record<RegistroLettureContatore["tipo"], string> = {
  produzione: "PRODUZIONE",
  immissione: "SCAMBIO",
}

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 50

function centrato(page: PDFPage, font: PDFFont, text: string, y: number, size: number) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font })
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const parole = text.split(" ")
  const righe: string[] = []
  let corrente = ""
  for (const parola of parole) {
    const tentativo = corrente ? `${corrente} ${parola}` : parola
    if (font.widthOfTextAtSize(tentativo, size) > maxWidth && corrente) {
      righe.push(corrente)
      corrente = parola
    } else {
      corrente = tentativo
    }
  }
  if (corrente) righe.push(corrente)
  return righe
}

function formattaLettura(valore: number | null): string {
  if (valore === null) return ""
  return valore.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

async function disegnaFrontespizio(
  pdfDoc: PDFDocument,
  input: RegistroLettureInput,
  logo: Awaited<ReturnType<PDFDocument["embedJpg"]>>,
  helvetica: PDFFont,
  helveticaBold: PDFFont
) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const larghezzaContenuto = PAGE_WIDTH - 2 * MARGIN

  const logoLarghezza = 220
  const logoAltezza = logoLarghezza * (logo.height / logo.width)
  let y = PAGE_HEIGHT - 60
  page.drawImage(logo, { x: (PAGE_WIDTH - logoLarghezza) / 2, y: y - logoAltezza, width: logoLarghezza, height: logoAltezza })
  y -= logoAltezza + 24

  centrato(page, helveticaBold, `UFFICIO DELLE DOGANE DI ${input.ufficioDogane.toUpperCase()}`, y, 13)
  y -= 28
  centrato(page, helvetica, "Accisa sull'energia elettrica", y, 11)
  y -= 26
  centrato(page, helveticaBold, `Codice ditta: IT00${input.codiceDitta}`, y, 10)
  y -= 26
  centrato(page, helvetica, "Officina elettrica sita in:", y, 10)
  y -= 15
  centrato(page, helvetica, `sita in ${input.indirizzo} ${input.cap} ${input.comune} (${input.provincia})`, y, 10)
  y -= 26
  centrato(page, helvetica, "esercitata dalla Ditta:", y, 10)
  y -= 15
  centrato(page, helveticaBold, input.ragioneSociale, y, 11)
  y -= 34
  centrato(page, helveticaBold, "Registro delle letture dei contatori elettrici", y, 12)
  y -= 18
  centrato(page, helveticaBold, `ANNO ${input.anno}`, y, 12)
  y -= 34

  page.drawText("NOTE:", { x: MARGIN, y, size: 10, font: helveticaBold })
  y -= 16

  const ufficio = input.ufficioDogane.toUpperCase()
  const note = [
    "Il presente registro è annuale, si compone di 1 foglio, escluso il presente frontespizio.",
    "La vidimazione viene effettuata da dicembre per l'anno successivo.",
    "Le letture dei contatori dovranno essere trascritte giornalmente, rilevate possibilmente alla stessa ora.",
    "Il registro deve essere chiuso al termine di ogni esercizio finanziario e conservato per ulteriori cinque anni.",
    "La mancata o l'irregolare tenuta del registro è punita con la sanzione amministrativa prevista dall'art. 50, comma 1 del D.Lgs. 26 ottobre 1995, n. 504.",
    `Eventuali anomalie riscontrate nel funzionamento del gruppo di misura devono essere comunicate all'Ufficio delle Dogane di ${ufficio} ed indicate nelle apposite annotazioni con l'indicazione della data, dell'ora e del motivo che le hanno causate.`,
    "I contatori installati dovranno essere tarati almeno ogni 5 anni (ogni tre anni se trattasi di contatori statici).",
    `Le operazioni di verifica dovranno essere effettuate da ente autorizzato alla presenza di un funzionario dell'Ufficio delle Dogane di ${ufficio}.`,
  ]

  const larghezzaTestoNote = larghezzaContenuto - 20
  for (let i = 0; i < note.length; i++) {
    const righe = wrapText(helvetica, note[i], 9, larghezzaTestoNote)
    righe.forEach((riga, indiceRiga) => {
      const prefisso = indiceRiga === 0 ? `${i + 1}. ` : "    "
      page.drawText(`${prefisso}${riga}`, { x: MARGIN, y, size: 9, font: helvetica })
      y -= 13
    })
  }

  y -= 30
  centrato(page, helvetica, "Protocollo n. _______ del ___________", y, 10)
}

function disegnaPaginaAnno(
  pdfDoc: PDFDocument,
  input: RegistroLettureInput,
  logo: Awaited<ReturnType<PDFDocument["embedJpg"]>>,
  helvetica: PDFFont,
  helveticaBold: PDFFont
) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  const logoLarghezza = 160
  const logoAltezza = logoLarghezza * (logo.height / logo.width)
  let y = PAGE_HEIGHT - 50
  page.drawImage(logo, { x: (PAGE_WIDTH - logoLarghezza) / 2, y: y - logoAltezza, width: logoLarghezza, height: logoAltezza })

  const serieTesto = "Serie M-bis-Mod.36"
  const serieWidth = helvetica.widthOfTextAtSize(serieTesto, 8)
  page.drawText(serieTesto, { x: PAGE_WIDTH - MARGIN - serieWidth, y: y - 10, size: 8, font: helvetica })

  y -= logoAltezza + 18
  centrato(page, helveticaBold, `UFFICIO DELLE DOGANE DI ${input.ufficioDogane.toUpperCase()}`, y, 11)
  y -= 16
  centrato(page, helveticaBold, "ACCISA SUL GAS E SULL'ENERGIA ELETTRICA", y, 10)
  y -= 16
  centrato(page, helvetica, `Ditta ${input.ragioneSociale} - ${input.comune}`, y, 9)
  y -= 14
  centrato(page, helvetica, `Codice ditta: IT00${input.codiceDitta}`, y, 9)
  y -= 26
  centrato(
    page,
    helveticaBold,
    `REGISTRO DELLE LETTURE DEI CONTATORI ELETTRICI USO PROPRIO - ANNO ${input.anno}`,
    y,
    10
  )
  y -= 24

  // Tabella: colonna etichetta + una per contatore + "ANNOTAZIONI". La riga
  // "Impianto / 1" in cima è concettualmente un'unica cella che copre tutte
  // le colonne dei contatori (nel modello originale non ci sono divisori
  // verticali tra i contatori su quella riga) — per questo i divisori
  // verticali tra contatori partono da sotto quella riga, non dal bordo
  // superiore della tabella.
  const larghezzaTabella = PAGE_WIDTH - 2 * MARGIN
  const larghezzaLabel = 65
  const larghezzaAnnotazioni = 110
  const larghezzaContatore =
    (larghezzaTabella - larghezzaLabel - larghezzaAnnotazioni) / input.contatori.length
  const larghezzaColonne = [
    larghezzaLabel,
    ...input.contatori.map(() => larghezzaContatore),
    larghezzaAnnotazioni,
  ]
  const colonneX = [MARGIN]
  for (const larghezza of larghezzaColonne) {
    colonneX.push(colonneX[colonneX.length - 1] + larghezza)
  }
  const xLabelDivisore = colonneX[1]
  const xAnnotazioniDivisore = colonneX[colonneX.length - 2]

  const altezzaRiga = 15.5
  const righeFisse = ["misura", "matricola", "K", "Riporto", ...MESI]
  const numeroRighe = righeFisse.length + 1 // +1 per la riga "Impianto/1"
  const altezzaTabella = altezzaRiga * numeroRighe

  const yTabellaAlto = y
  const yTabellaBasso = y - altezzaTabella
  const ySottoRigaImpianto = yTabellaAlto - altezzaRiga

  // Righe orizzontali
  for (let r = 0; r <= numeroRighe; r++) {
    const yLinea = yTabellaAlto - r * altezzaRiga
    page.drawLine({
      start: { x: MARGIN, y: yLinea },
      end: { x: MARGIN + larghezzaTabella, y: yLinea },
      thickness: r <= 1 ? 1 : 0.5,
      color: rgb(0, 0, 0),
    })
  }
  // Bordo esterno + divisore label/dati + divisore dati/annotazioni: per
  // tutta l'altezza della tabella.
  for (const x of [MARGIN, xLabelDivisore, xAnnotazioniDivisore, MARGIN + larghezzaTabella]) {
    page.drawLine({
      start: { x, y: yTabellaAlto },
      end: { x, y: yTabellaBasso },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    })
  }
  // Divisori verticali tra contatori: solo sotto la riga "Impianto/1".
  for (let i = 1; i < input.contatori.length; i++) {
    const x = colonneX[1 + i]
    page.drawLine({
      start: { x, y: ySottoRigaImpianto },
      end: { x, y: yTabellaBasso },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    })
  }

  // Riga "Impianto / 1" (merged sui contatori) + "ANNOTAZIONI"
  const yImpiantoTesto = yTabellaAlto - altezzaRiga + 4
  page.drawText("Impianto", { x: MARGIN + 4, y: yImpiantoTesto, size: 8, font: helveticaBold })
  // "1" centrato nello spazio dei contatori (non sull'intera pagina, quindi
  // non si può riusare l'helper `centrato`): calcolo manuale.
  {
    const testo1 = "1"
    const centro = (xLabelDivisore + xAnnotazioniDivisore) / 2
    const larghezzaTesto1 = helveticaBold.widthOfTextAtSize(testo1, 8)
    page.drawText(testo1, { x: centro - larghezzaTesto1 / 2, y: yImpiantoTesto, size: 8, font: helveticaBold })
  }
  page.drawText("ANNOTAZIONI", {
    x: xAnnotazioniDivisore + 4,
    y: yImpiantoTesto,
    size: 8,
    font: helveticaBold,
  })

  // Righe misura/matricola/K
  const yMisura = ySottoRigaImpianto - altezzaRiga + 4
  page.drawText("misura", { x: MARGIN + 4, y: yMisura, size: 8, font: helveticaBold })
  input.contatori.forEach((c, i) => {
    page.drawText(TIPO_LABEL[c.tipo], { x: colonneX[i + 1] + 4, y: yMisura, size: 8, font: helvetica })
  })

  const yMatricola = yMisura - altezzaRiga
  page.drawText("matricola", { x: MARGIN + 4, y: yMatricola, size: 8, font: helveticaBold })
  input.contatori.forEach((c, i) => {
    page.drawText(c.matricola, { x: colonneX[i + 1] + 4, y: yMatricola, size: 8, font: helvetica })
  })

  const yK = yMatricola - altezzaRiga
  page.drawText("K", { x: MARGIN + 4, y: yK, size: 8, font: helveticaBold })
  input.contatori.forEach((c, i) => {
    page.drawText(`K = ${c.costanteK}`, { x: colonneX[i + 1] + 4, y: yK, size: 8, font: helvetica })
  })

  // Riporto + 12 mesi
  const yRiporto = yK - altezzaRiga
  page.drawText("Riporto", { x: MARGIN + 4, y: yRiporto, size: 8, font: helvetica })

  MESI.forEach((nomeMese, indiceMese) => {
    const yRigaMese = yRiporto - altezzaRiga * (indiceMese + 1)
    const ultimoGiorno = ultimoGiornoMese(input.anno, indiceMese + 1)
    page.drawText(`${nomeMese} ${ultimoGiorno}`, { x: MARGIN + 4, y: yRigaMese, size: 8, font: helvetica })
    input.contatori.forEach((c, i) => {
      page.drawText(formattaLettura(c.letturePerMese[indiceMese]), {
        x: colonneX[i + 1] + 4,
        y: yRigaMese,
        size: 8,
        font: helvetica,
      })
    })
  })

  y = yTabellaBasso - 22
  const righeNotaTabella = wrapText(
    helvetica,
    "Le eventuali anomalie riscontrate nel funzionamento della misura devono essere indicate nelle apposite annotazioni con la indicazione della data, dell'ora e del motivo che l'hanno causate.",
    8,
    larghezzaTabella
  )
  righeNotaTabella.forEach((riga) => {
    page.drawText(riga, { x: MARGIN, y, size: 8, font: helvetica })
    y -= 11
  })

  y -= 30
  page.drawText("(*) lettura fine mese", { x: MARGIN, y, size: 8, font: helvetica })
  const lineaFirma = "____________________________________"
  const larghezzaLineaFirma = helvetica.widthOfTextAtSize(lineaFirma, 9)
  page.drawText(lineaFirma, { x: PAGE_WIDTH - MARGIN - larghezzaLineaFirma, y, size: 9, font: helvetica })
  y -= 13
  const perLaDitta = "per la Ditta"
  const larghezzaPerLaDitta = helvetica.widthOfTextAtSize(perLaDitta, 8)
  page.drawText(perLaDitta, { x: PAGE_WIDTH - MARGIN - larghezzaPerLaDitta, y, size: 8, font: helvetica })
}

export async function generaRegistroLetturePdf(input: RegistroLettureInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const logoBytes = readFileSync(TEMPLATE_LOGO_PATH)
  const logo = await pdfDoc.embedJpg(logoBytes)

  await disegnaFrontespizio(pdfDoc, input, logo, helvetica, helveticaBold)
  disegnaPaginaAnno(pdfDoc, input, logo, helvetica, helveticaBold)

  return pdfDoc.save()
}
