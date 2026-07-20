import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

// Registro letture (Mod. M-bis 36) — a differenza dell'F24 (sovrapposto a un
// modulo ufficiale vuoto) qui non abbiamo un template PDF vuoto disponibile:
// costruiamo la pagina da zero con pdf-lib, riproducendo la struttura di un
// esempio reale (intestazione + tabella annuale RIPORTO/12 mesi × matricole
// contatori + colonna annotazioni), non l'estetica esatta del modulo ADM
// originale.

export interface RegistroLettureContatore {
  matricola: string
  letturePerMese: (number | null)[] // 12 valori (gennaio..dicembre), null se mese senza letture
}

export interface RegistroLettureInput {
  ragioneSociale: string
  codiceDitta: string // senza prefisso "IT00" — lo aggiunge il generatore
  comune: string
  indirizzo: string
  ufficioDogane: string | null
  anno: number
  contatori: RegistroLettureContatore[]
}

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 40

function centrato(page: PDFPage, font: PDFFont, text: string, y: number, size: number) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font })
}

function formattaLettura(valore: number | null): string {
  if (valore === null) return ""
  return valore.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export async function generaRegistroLetturePdf(input: RegistroLettureInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let y = PAGE_HEIGHT - 50

  centrato(page, helveticaBold, "AGENZIA DELLE DOGANE E DEI MONOPOLI", y, 13)
  y -= 18
  if (input.ufficioDogane) {
    centrato(page, helvetica, `Ufficio delle Dogane di ${input.ufficioDogane}`, y, 10)
    y -= 16
  }
  centrato(page, helveticaBold, "ACCISA SUL CONSUMO DI ENERGIA ELETTRICA", y, 11)
  y -= 24

  const righeIntestazione: [string, string][] = [
    ["Periodo di validità del presente registro", `dal 01/01/${input.anno} al 31/12/${input.anno}`],
    ["Denominazione Ditta", input.ragioneSociale],
    ["Codice Ditta", `IT00${input.codiceDitta}`],
    ["Ubicazione dell'impianto", `Comune di ${input.comune} — ${input.indirizzo}`],
  ]
  for (const [etichetta, valore] of righeIntestazione) {
    page.drawText(`${etichetta}:`, { x: MARGIN, y, size: 9, font: helvetica })
    page.drawText(valore, { x: MARGIN + 220, y, size: 9, font: helveticaBold })
    y -= 15
  }
  y -= 10

  centrato(page, helveticaBold, "REGISTRO DELLE LETTURE DEI CONTATORI ELETTRICI", y, 11)
  y -= 20

  const testoContatori = input.contatori
    .map((c) => `Matricola n. ${c.matricola}`)
    .join("  —  ")
  page.drawText(testoContatori, { x: MARGIN, y, size: 8, font: helvetica })
  y -= 20

  // Tabella: colonna "Mese" + una per contatore + "Annotazioni"
  const larghezzaTabella = PAGE_WIDTH - 2 * MARGIN
  const larghezzaMese = 90
  const larghezzaAnnotazioni = 90
  const larghezzaContatore = (larghezzaTabella - larghezzaMese - larghezzaAnnotazioni) / input.contatori.length
  const larghezzaColonne = [larghezzaMese, ...input.contatori.map(() => larghezzaContatore), larghezzaAnnotazioni]

  // Un solo calcolo dei confini di colonna (N+1 posizioni per N colonne),
  // riusato sia per le righe verticali della griglia sia per il testo —
  // avere due calcoli separati (uno per le linee, uno per il testo) aveva
  // portato a un disallineamento: il testo "Annotazioni" finiva sovrapposto
  // all'ultima colonna dei contatori perché quel calcolo non includeva il
  // confine finale.
  const colonneX = [MARGIN]
  for (const larghezza of larghezzaColonne) {
    colonneX.push(colonneX[colonneX.length - 1] + larghezza)
  }

  const altezzaRiga = 16
  const righeTabella = ["RIPORTO", ...MESI]
  const altezzaTabella = altezzaRiga * (righeTabella.length + 1) // +1 header

  const yTabellaAlto = y
  const yTabellaBasso = y - altezzaTabella

  // Righe orizzontali
  for (let r = 0; r <= righeTabella.length + 1; r++) {
    const yLinea = yTabellaAlto - r * altezzaRiga
    page.drawLine({
      start: { x: MARGIN, y: yLinea },
      end: { x: MARGIN + larghezzaTabella, y: yLinea },
      thickness: r === 0 || r === 1 ? 1 : 0.5,
      color: rgb(0, 0, 0),
    })
  }
  // Colonne verticali
  for (const xLinea of colonneX) {
    page.drawLine({
      start: { x: xLinea, y: yTabellaAlto },
      end: { x: xLinea, y: yTabellaBasso },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    })
  }

  // Header: "Mese" + matricole + "Annotazioni" (stessa formula delle righe
  // dati sotto, "riga -1": baseline vicino al fondo della banda di riga)
  const yHeaderTesto = yTabellaAlto - altezzaRiga + 3
  page.drawText("Mese", { x: colonneX[0] + 4, y: yHeaderTesto, size: 8, font: helveticaBold })
  input.contatori.forEach((c, i) => {
    page.drawText(c.matricola, { x: colonneX[i + 1] + 4, y: yHeaderTesto, size: 8, font: helveticaBold })
  })
  page.drawText("Annotazioni", {
    x: colonneX[input.contatori.length + 1] + 4,
    y: yHeaderTesto,
    size: 8,
    font: helveticaBold,
  })

  // Righe dati (RIPORTO vuoto — è la lettura di fine anno precedente, non
  // tracciata da noi separatamente — poi Gennaio..Dicembre con la lettura di
  // registro cumulativa di ciascun contatore)
  righeTabella.forEach((nomeRiga, indiceRiga) => {
    const yRiga = yTabellaAlto - altezzaRiga * (indiceRiga + 2) + 3
    page.drawText(nomeRiga, { x: colonneX[0] + 4, y: yRiga, size: 8, font: helvetica })
    if (indiceRiga > 0) {
      const mese = indiceRiga - 1
      input.contatori.forEach((c, i) => {
        page.drawText(formattaLettura(c.letturePerMese[mese]), {
          x: colonneX[i + 1] + 4,
          y: yRiga,
          size: 8,
          font: helvetica,
        })
      })
    }
  })

  y = yTabellaBasso - 20
  page.drawText(
    "Le letture riportate sono quelle di fine mese; le eventuali anomalie sono annotate nella colonna dedicata.",
    { x: MARGIN, y, size: 7, font: helvetica }
  )

  return pdfDoc.save()
}
