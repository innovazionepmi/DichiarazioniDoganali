import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { rasterizzaPaginePdf } from "./rasterizza-pagine"

async function creaPdfSintetico(numeroPagine: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < numeroPagine; i++) {
    const page = doc.addPage([200, 200])
    page.drawText(`Pagina ${i + 1}`, { x: 20, y: 100, size: 14, font })
  }
  return Buffer.from(await doc.save())
}

describe("rasterizzaPaginePdf", () => {
  it("rasterizza tutte le pagine in PNG base64 se sotto il limite", async () => {
    const bytes = await creaPdfSintetico(3)
    const risultato = await rasterizzaPaginePdf(bytes, 6)

    expect(risultato.troncato).toBe(false)
    expect(risultato.pagine).toHaveLength(3)
    for (const pagina of risultato.pagine) {
      expect(pagina.mediaType).toBe("image/png")
      expect(pagina.base64.length).toBeGreaterThan(0)
      // Un PNG valido inizia sempre con la stessa firma di byte.
      const buffer = Buffer.from(pagina.base64, "base64")
      expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    }
  })

  it("tronca oltre il numero massimo di pagine e lo segnala", async () => {
    const bytes = await creaPdfSintetico(8)
    const risultato = await rasterizzaPaginePdf(bytes, 6)

    expect(risultato.troncato).toBe(true)
    expect(risultato.pagine).toHaveLength(6)
  })
})
