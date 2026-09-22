import { readFileSync } from "node:fs"
import path from "node:path"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import type { DichiarazioneEeSemestraleInput } from "../validation/dichiarazione-ee.schema"

// Ricevuta PDF dell'invio S2S — S2S non restituisce un PDF pronto come
// l'invio manuale U2S (solo XML OUTPUT/ESITO, vedi PROJECT_STATUS.md), lo
// costruiamo noi. Impaginazione (logo, tabelle a sezioni con intestazione
// blu, righe TOTALE MESE/TOTALE QUADRO) ricalcata su un PDF reale fornito
// da Paolo come riferimento di stile — non è un modulo ufficiale ADM, ma
// visivamente allineato a quello che si aspetta di vedere. Stesso logo già
// usato dal registro letture (lib/pdf/templates/logo-agenzia-dogane.jpg).

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
const LARGHEZZA_UTILE = PAGE_WIDTH - 2 * MARGIN

const TEMPLATE_LOGO_PATH = path.join(process.cwd(), "lib/pdf/templates/logo-agenzia-dogane.jpg")

// Blu ADM approssimato dal PDF di riferimento — intestazioni di sezione e
// di tabella, sia sul frontespizio che sui Quadri.
const BLU_TESTATA = rgb(0.11, 0.29, 0.49)
const BIANCO = rgb(1, 1, 1)
const BORDO_CHIARO = rgb(0.75, 0.75, 0.75)

const MESI_LABEL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

// Tipologia fissa "L2" (Allegato 1 Circolare 6/2026) e Matr non compilata
// (Circolare 20/2026, "per differenza") — stessa scelta del generatore XML
// (lib/xml/dichiarazione-ee-semestrale.ts), qui solo per la colonna
// visibile della tabella: il tipo di dato che arriva da `dati.quadroC` non
// porta con sé questi due valori (lo schema di input non li prevede, sono
// sempre gli stessi per il profilo coperto).
const TIPOLOGIA_QUADRO_C = "L2"

function testoDestra(page: PDFPage, font: PDFFont, text: string, xDestra: number, y: number, size: number) {
  const larghezza = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: xDestra - larghezza, y, size, font })
}

// Tronca con "…" se il testo non entra nella larghezza data — soprattutto
// per colonne come "Id. officina dest." dove il formato del valore reale
// (codice ditta/CF/PIVA) è vario e non sempre corto quanto negli esempi.
function troncaPerLarghezza(font: PDFFont, text: string, size: number, larghezzaMax: number): string {
  if (font.widthOfTextAtSize(text, size) <= larghezzaMax) return text
  let troncato = text
  while (troncato.length > 1 && font.widthOfTextAtSize(`${troncato}…`, size) > larghezzaMax) {
    troncato = troncato.slice(0, -1)
  }
  return `${troncato}…`
}

function disegnaLogo(page: PDFPage, logo: PDFImage, larghezza: number) {
  const altezza = larghezza * (logo.height / logo.width)
  const y = PAGE_HEIGHT - MARGIN - altezza
  page.drawImage(logo, { x: MARGIN, y, width: larghezza, height: altezza })
  return y
}

// Blocco "sezione informativa" del frontespizio (Officine / Periodo di
// riferimento / Rappresentante legale nel riferimento di Paolo): barra blu
// col titolo, poi righe etichetta/valore con bordo leggero. Ritorna la y
// dopo il blocco.
function disegnaSezioneInfo(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  y: number,
  titolo: string,
  righe: [string, string][]
) {
  const altezzaBarra = 18
  const altezzaRiga = 18
  const larghezzaEtichetta = LARGHEZZA_UTILE * 0.32

  page.drawRectangle({ x: MARGIN, y: y - altezzaBarra, width: LARGHEZZA_UTILE, height: altezzaBarra, color: BLU_TESTATA })
  page.drawText(titolo, { x: MARGIN + 6, y: y - altezzaBarra + 5, size: 9, font: fontBold, color: BIANCO })
  let yCorrente = y - altezzaBarra

  righe.forEach(([etichetta, valore]) => {
    page.drawRectangle({
      x: MARGIN,
      y: yCorrente - altezzaRiga,
      width: LARGHEZZA_UTILE,
      height: altezzaRiga,
      borderWidth: 0.5,
      borderColor: BORDO_CHIARO,
    })
    page.drawLine({
      start: { x: MARGIN + larghezzaEtichetta, y: yCorrente },
      end: { x: MARGIN + larghezzaEtichetta, y: yCorrente - altezzaRiga },
      thickness: 0.5,
      color: BORDO_CHIARO,
    })
    page.drawText(etichetta, { x: MARGIN + 6, y: yCorrente - altezzaRiga + 5, size: 9, font: fontBold, color: BLU_TESTATA })
    page.drawText(valore, { x: MARGIN + larghezzaEtichetta + 6, y: yCorrente - altezzaRiga + 5, size: 9, font })
    yCorrente -= altezzaRiga
  })

  return yCorrente - 16
}

type RigaTabella = (string | number)[]
type GruppoMese = { nomeMese: string; righe: RigaTabella[]; totaleMese: number }

// Tabella di un Quadro, in stile "riferimento Paolo": intestazione con
// sfondo blu e testo bianco, una riga TOTALE MESE dopo i contatori di ogni
// mese (utile quando un mese ha più contatori — qui quasi sempre uno solo,
// ma la struttura generale lo prevede), riga TOTALE QUADRO finale in
// risalto. L'ultima colonna (kWh) è allineata a destra come nel
// riferimento, le altre a sinistra.
function disegnaTabellaQuadro(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  yInizio: number,
  intestazioni: string[],
  larghezze: number[],
  gruppi: GruppoMese[],
  etichettaTotaleQuadro: string,
  totaleQuadro: number
) {
  const larghezzaTotale = larghezze.reduce((a, b) => a + b, 0)
  const altezzaRiga = 16
  const colonneX = [MARGIN]
  for (const l of larghezze) colonneX.push(colonneX[colonneX.length - 1] + l)
  const xDestraTabella = MARGIN + larghezzaTotale
  const indiceUltimaColonna = intestazioni.length - 1

  let y = yInizio

  // Intestazione
  page.drawRectangle({ x: MARGIN, y: y - altezzaRiga, width: larghezzaTotale, height: altezzaRiga, color: BLU_TESTATA })
  intestazioni.forEach((testo, i) => {
    page.drawText(testo, { x: colonneX[i] + 4, y: y - altezzaRiga + 4, size: 7.5, font: fontBold, color: BIANCO })
  })
  y -= altezzaRiga

  function bordoRiga(yRiga: number) {
    page.drawRectangle({
      x: MARGIN,
      y: yRiga - altezzaRiga,
      width: larghezzaTotale,
      height: altezzaRiga,
      borderWidth: 0.5,
      borderColor: BORDO_CHIARO,
    })
  }

  for (const gruppo of gruppi) {
    for (const riga of gruppo.righe) {
      bordoRiga(y)
      riga.forEach((cella, ci) => {
        const testo = String(cella)
        if (ci === indiceUltimaColonna) {
          testoDestra(page, font, testo, colonneX[ci + 1] - 4, y - altezzaRiga + 4, 8)
        } else {
          const disponibile = larghezze[ci] - 8
          page.drawText(troncaPerLarghezza(font, testo, 8, disponibile), {
            x: colonneX[ci] + 4,
            y: y - altezzaRiga + 4,
            size: 8,
            font,
          })
        }
      })
      y -= altezzaRiga
    }
    bordoRiga(y)
    testoDestra(page, fontBold, `TOTALE MESE ${gruppo.nomeMese}`, xDestraTabella - larghezze[indiceUltimaColonna] - 4, y - altezzaRiga + 4, 8)
    testoDestra(page, fontBold, String(gruppo.totaleMese), xDestraTabella - 4, y - altezzaRiga + 4, 8)
    y -= altezzaRiga
  }

  bordoRiga(y)
  testoDestra(page, fontBold, etichettaTotaleQuadro, xDestraTabella - larghezze[indiceUltimaColonna] - 4, y - altezzaRiga + 4, 8)
  testoDestra(page, fontBold, String(totaleQuadro), xDestraTabella - 4, y - altezzaRiga + 4, 8)
  y -= altezzaRiga

  return y
}

// Pagine Quadro A/C/G, condivise tra la ricevuta post-invio e l'anteprima
// pre-invio: stesso identico contenuto dichiarativo in entrambi i casi,
// cambia solo il frontespizio (esito ADM vs. avviso di bozza).
function disegnaQuadri(pdfDoc: PDFDocument, helvetica: PDFFont, helveticaBold: PDFFont, dati: DichiarazioneEeSemestraleInput) {
  // --- Pagina 2: Quadro A ---
  const p2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y2 = PAGE_HEIGHT - MARGIN - 24
  p2.drawText("QUADRO A - PRODUZIONE", { x: MARGIN, y: y2, size: 13, font: helveticaBold })
  y2 -= 24

  const gruppiA: GruppoMese[] = dati.quadroA.map((mese) => ({
    nomeMese: MESI_LABEL[mese.numMese - 1],
    righe: mese.contatori.map((c) => [
      MESI_LABEL[mese.numMese - 1],
      c.matricola,
      c.lettA.toFixed(0),
      c.lettP.toFixed(0),
      c.diffLett.toFixed(4),
      c.costLett.toFixed(4),
      Math.round(c.kwh),
    ]),
    totaleMese: mese.contatori.reduce((acc, c) => acc + Math.round(c.kwh), 0),
  }))
  const totaleA = gruppiA.reduce((acc, g) => acc + g.totaleMese, 0)
  disegnaTabellaQuadro(
    p2,
    helvetica,
    helveticaBold,
    y2,
    ["Mese", "Matricola", "Lettura finale", "Lettura iniziale", "Differenza", "Costante", "kWh"],
    [58, 78, 68, 72, 68, 58, 55],
    gruppiA,
    "TOTALE QUADRO A kWh",
    totaleA
  )

  // --- Pagina 3: Quadro C (autoconsumo esente) ---
  const p3c = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y3c = PAGE_HEIGHT - MARGIN - 24
  p3c.drawText("QUADRO C - CONSUMI PROPRI ESENTI/NON SOTTOPOSTI AD ACCISA", { x: MARGIN, y: y3c, size: 12, font: helveticaBold })
  y3c -= 24

  const gruppiC: GruppoMese[] = dati.quadroC.map((mese) => ({
    nomeMese: MESI_LABEL[mese.numMese - 1],
    righe: [[MESI_LABEL[mese.numMese - 1], TIPOLOGIA_QUADRO_C, "-", "-", "-", "-", Math.round(mese.kwh)]],
    totaleMese: Math.round(mese.kwh),
  }))
  const totaleC = gruppiC.reduce((acc, g) => acc + g.totaleMese, 0)
  disegnaTabellaQuadro(
    p3c,
    helvetica,
    helveticaBold,
    y3c,
    ["Mese", "Codice Uso", "Matricola", "Lettura finale", "Lettura iniziale", "Differenza", "kWh"],
    [55, 55, 65, 68, 72, 65, 65],
    gruppiC,
    "TOTALE QUADRO C kWh",
    totaleC
  )

  // --- Pagina 4: Quadro G (se presente) ---
  if (dati.quadroG) {
    const p3 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y3 = PAGE_HEIGHT - MARGIN - 24
    p3.drawText("QUADRO G - ENERGIA ELETTRICA CEDUTA", { x: MARGIN, y: y3, size: 13, font: helveticaBold })
    y3 -= 24

    const gruppiG: GruppoMese[] = dati.quadroG.map((mese) => ({
      nomeMese: MESI_LABEL[mese.numMese - 1],
      righe: mese.contatori.map((c) => [
        MESI_LABEL[mese.numMese - 1],
        c.tipo,
        c.id,
        c.matricola,
        c.lettA.toFixed(0),
        c.lettP.toFixed(0),
        c.diffLett.toFixed(4),
        c.costLett.toFixed(4),
        Math.round(c.kwh),
      ]),
      totaleMese: mese.contatori.reduce((acc, c) => acc + Math.round(c.kwh), 0),
    }))
    const totaleG = gruppiG.reduce((acc, g) => acc + g.totaleMese, 0)
    const yFineTabella = disegnaTabellaQuadro(
      p3,
      helvetica,
      helveticaBold,
      y3,
      ["Mese", "Tipologia", "Id. officina dest.", "Matricola", "Lett. finale", "Lett. iniziale", "Diff.", "Costante", "kWh"],
      [45, 48, 92, 65, 55, 55, 45, 45, 45],
      gruppiG,
      "TOTALE QUADRO G kWh",
      totaleG
    )

    const legenda = [
      "Legenda tipologia cessione:",
      "A = Cessione a consorziati/consociati; B = Vettoriamento; C = Cessione ad altra officina elettrica; D = Distribuzione per conto terzi;",
      "E = Cessione UE; F = Cessione extra UE; R = Cessione alla rete da impianto di accumulo.",
    ]
    let yLegenda = yFineTabella - 14
    legenda.forEach((riga, i) => {
      p3.drawText(riga, { x: MARGIN, y: yLegenda, size: 7.5, font: i === 0 ? helveticaBold : helvetica, color: rgb(0.35, 0.35, 0.35) })
      yLegenda -= 11
    })
  }
}

function disegnaTestataFrontespizio(
  p1: PDFPage,
  logo: PDFImage,
  helvetica: PDFFont,
  helveticaBold: PDFFont,
  input: { codDitta: string; clienteRagioneSociale: string; anno: number; periodoRiferimento: number }
) {
  const yLogo = disegnaLogo(p1, logo, 140)
  let y = yLogo - 20

  p1.drawText("DICHIARAZIONE SEMESTRALE - ENERGIA ELETTRICA", { x: MARGIN, y, size: 15, font: helveticaBold })
  y -= 28

  y = disegnaSezioneInfo(p1, helvetica, helveticaBold, y, "Officine", [
    ["Attività", "Off. produzione fonti rinnovabili uso esente"],
    ["Codice accisa", `IT00${input.codDitta}`],
    ["Ragione Sociale", input.clienteRagioneSociale],
  ])

  y = disegnaSezioneInfo(p1, helvetica, helveticaBold, y, "Periodo di riferimento", [
    ["Anno", String(input.anno)],
    ["Semestre di riferimento", `${input.periodoRiferimento}° semestre`],
  ])

  return y
}

export async function generaRicevutaInvioPdf(input: RicevutaInvioInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdfDoc.embedJpg(readFileSync(TEMPLATE_LOGO_PATH))

  // --- Pagina 1: frontespizio + esito ---
  const p1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const y = disegnaTestataFrontespizio(p1, logo, helvetica, helveticaBold, {
    codDitta: input.dati.codDitta,
    clienteRagioneSociale: input.clienteRagioneSociale,
    anno: input.dati.anno,
    periodoRiferimento: input.dati.periodoRiferimento,
  })

  disegnaSezioneInfo(p1, helvetica, helveticaBold, y, "Esito invio ADM", [
    ["IUT", input.iut],
    ["Data registrazione", input.dataRegistrazione],
    ["Esito ADM", input.esitoDescrizione ?? "Non ancora disponibile"],
    ...(input.esitoCodice ? ([["Codice esito", input.esitoCodice]] as [string, string][]) : []),
  ])

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
  const logo = await pdfDoc.embedJpg(readFileSync(TEMPLATE_LOGO_PATH))

  const p1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const y = disegnaTestataFrontespizio(p1, logo, helvetica, helveticaBold, {
    codDitta: input.dati.codDitta,
    clienteRagioneSociale: input.clienteRagioneSociale,
    anno: input.dati.anno,
    periodoRiferimento: input.dati.periodoRiferimento,
  })

  disegnaSezioneInfo(p1, helvetica, helveticaBold, y, "Anteprima — documento non inviato", [
    ["Stato", "Bozza, non inviata all'Agenzia delle Dogane e dei Monopoli"],
    ["Comune impianto", input.impiantoComune || "—"],
    ["Indirizzo impianto", input.impiantoIndirizzo || "—"],
    ["Generato il", new Date().toLocaleDateString("it-IT")],
  ])

  disegnaQuadri(pdfDoc, helvetica, helveticaBold, input.dati)

  return pdfDoc.save()
}
