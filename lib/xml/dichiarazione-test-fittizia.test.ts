import { describe, expect, it } from "vitest"
import { generaXmlDichiarazioneTestFittizia } from "./dichiarazione-test-fittizia"

describe("generaXmlDichiarazioneTestFittizia", () => {
  it("produce un XML valido (passa la validazione zod del generatore reale)", () => {
    expect(() => generaXmlDichiarazioneTestFittizia()).not.toThrow()
  })

  it("contiene Quadro A e Quadro G con dati palesemente fittizi", () => {
    const xml = generaXmlDichiarazioneTestFittizia()
    expect(xml).toContain("<CodDitta>TST00001T</CodDitta>")
    expect(xml).toContain("<Matr>TESTPROD01</Matr>")
    expect(xml).toContain("<Matr>TESTIMM01</Matr>")
    expect(xml).toContain("<Tipo>B</Tipo>")
    expect(xml).toContain("<Id>TESTDISTRIBUTORE01</Id>")
  })

  it("rispetta il semestre richiesto (mesi 7-12 per il 2° semestre)", () => {
    const xml = generaXmlDichiarazioneTestFittizia({ periodoRiferimento: 2 })
    expect(xml).toContain('<Mese NumMese="7">')
    expect(xml).toContain('<Mese NumMese="12">')
    expect(xml).not.toContain('<Mese NumMese="1">')
  })
})
