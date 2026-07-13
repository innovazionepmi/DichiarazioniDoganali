import "pdf-parse/worker"
import { PDFParse } from "pdf-parse"

// Alcuni documenti (es. licenze ADM) sono scansioni: pdf-parse estrae ~0
// caratteri di testo, quindi qui non si fa parsing regex ma si rasterizzano
// le pagine in immagini da passare a un modello vision (lib/ai/estrai-licenza.ts).
// `import "pdf-parse/worker"` è necessario anche qui per lo stesso motivo
// già risolto per il parser letture: senza, il rendering fallisce in modo
// silenzioso sulle funzioni serverless di Vercel.

export interface PaginaRasterizzata {
  base64: string
  mediaType: "image/png"
}

export interface RisultatoRasterizzazione {
  pagine: PaginaRasterizzata[]
  troncato: boolean
}

const SCALA_RENDER = 2.0

// Limite pagine inviate al modello vision: documenti reali (licenze) sono
// tipicamente 2-4 pagine; il cap evita costi/latenza eccessivi su upload
// anomali senza bloccare il caso normale.
export async function rasterizzaPaginePdf(
  bytes: Buffer,
  maxPagine = 6
): Promise<RisultatoRasterizzazione> {
  const parser = new PDFParse({ data: bytes })
  try {
    const totale = await parser.getScreenshot({ scale: SCALA_RENDER })
    const troncato = totale.pages.length > maxPagine
    const pagine = totale.pages.slice(0, maxPagine).map((p) => ({
      base64: Buffer.from(p.data).toString("base64"),
      mediaType: "image/png" as const,
    }))
    return { pagine, troncato }
  } finally {
    await parser.destroy()
  }
}
