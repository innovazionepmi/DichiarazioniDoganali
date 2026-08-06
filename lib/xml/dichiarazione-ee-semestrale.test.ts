import { describe, expect, it } from "vitest"
import {
  generaDichiarazioneEeSemestraleXml,
  parseDichiarazioneEeSemestraleXml,
} from "./dichiarazione-ee-semestrale"
import type { DichiarazioneEeSemestraleInput } from "../validation/dichiarazione-ee.schema"

// Dati interamente inventati (nessun dato reale del cliente) — un contatore
// di produzione e uno di immissione, K=1 per semplicità (DiffLett = kWh),
// letture progressive coerenti mese su mese.
function meseA(numMese: number, lettP: number, kwh: number) {
  return {
    numMese,
    contatori: [
      {
        matricola: "PROD001",
        lettP,
        lettA: lettP + kwh,
        diffLett: kwh,
        costLett: 1,
        kwh,
      },
    ],
  }
}

function meseG(numMese: number, lettP: number, kwh: number) {
  return {
    numMese,
    contatori: [
      {
        tipo: "B" as const,
        id: "ABC12345D",
        matricola: "IMM001",
        lettP,
        lettA: lettP + kwh,
        diffLett: kwh,
        costLett: 1,
        kwh,
      },
    ],
  }
}

const KWH_PRODUZIONE = [100, 110, 120, 130, 140, 150]
const KWH_CESSIONE = [40, 44, 48, 52, 56, 60]

function cumulativo(valori: number[]): number[] {
  const risultato: number[] = []
  let acc = 0
  for (const v of valori) {
    risultato.push(acc)
    acc += v
  }
  return risultato
}

const lettPProduzione = cumulativo(KWH_PRODUZIONE)
const lettPCessione = cumulativo(KWH_CESSIONE)

const INPUT_SINTETICO: DichiarazioneEeSemestraleInput = {
  codDitta: "ABC12345D",
  codAtt: 1,
  anno: 2026,
  periodoRiferimento: 1,
  quadroA: KWH_PRODUZIONE.map((kwh, i) => meseA(i + 1, lettPProduzione[i], kwh)),
  quadroC: KWH_PRODUZIONE.map((kwh, i) => ({ numMese: i + 1, kwh: kwh - KWH_CESSIONE[i] })),
  quadroG: KWH_CESSIONE.map((kwh, i) => meseG(i + 1, lettPCessione[i], kwh)),
}

describe("generaDichiarazioneEeSemestraleXml", () => {
  it("produce un XML ben formato con namespace ed elementi radice", () => {
    const xml = generaDichiarazioneEeSemestraleXml(INPUT_SINTETICO)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(
      '<EnergiaElettricaSemestrale xmlns="http://energiaelettrica.jaxb.types.controlliEEGN.accise.adm.finanze.it">'
    )
    expect(xml).toContain("<CodDitta>ABC12345D</CodDitta>")
    expect(xml).toContain("<CodAtt>1</CodAtt>")
    expect(xml).toContain("<Anno>2026</Anno>")
    expect(xml).toContain("<PeriodoRiferimento>1</PeriodoRiferimento>")
  })

  it("scrive 6 mesi nel Quadro A con i totali corretti", () => {
    const xml = generaDichiarazioneEeSemestraleXml(INPUT_SINTETICO)
    for (let mese = 1; mese <= 6; mese++) {
      expect(xml).toContain(`<Mese NumMese="${mese}">`)
    }
    expect(xml).toContain("<Matr>PROD001</Matr>")
    // Mese 1: LettP=0, LettA=100, DiffLett=100.0000, kWh=100
    expect(xml).toContain("<LettP>0.0000</LettP>")
    expect(xml).toContain("<LettA>100.0000</LettA>")
    expect(xml).toContain("<DiffLett>100.0000</DiffLett>")
    expect(xml).toContain("<CostLett>1.0000</CostLett>")
    expect(xml).toContain("<kWh>100</kWh>")
    // TotaleQuadro A = somma dei 6 mesi di produzione
    const totaleA = KWH_PRODUZIONE.reduce((a, b) => a + b, 0)
    expect(xml).toContain(`<A>`)
    expect(xml.split("<A>")[1].split("</A>")[0]).toContain(
      `<TotaleQuadro>${totaleA}</TotaleQuadro>`
    )
  })

  it("scrive il Quadro C tra A e G con Matr vuoto e Tipologia L2", () => {
    const xml = generaDichiarazioneEeSemestraleXml(INPUT_SINTETICO)
    expect(xml.indexOf("<A>")).toBeLessThan(xml.indexOf("<C>"))
    expect(xml.indexOf("<C>")).toBeLessThan(xml.indexOf("<G>"))
    expect(xml).toContain("<Matr></Matr>")
    expect(xml).toContain("<Tipologia>L2</Tipologia>")
    // Mese 1: autoconsumo = 100 (produzione) − 40 (cessione) = 60
    expect(xml.split("<C>")[1].split("</C>")[0]).toContain("<kWh>60</kWh>")
    const totaleC = KWH_PRODUZIONE.reduce((a, b) => a + b, 0) - KWH_CESSIONE.reduce((a, b) => a + b, 0)
    expect(xml.split("<C>")[1].split("</C>")[0]).toContain(`<TotaleQuadro>${totaleC}</TotaleQuadro>`)
  })

  it("scrive il Quadro G con Tipo B, Id e Kwh (K maiuscola)", () => {
    const xml = generaDichiarazioneEeSemestraleXml(INPUT_SINTETICO)
    expect(xml).toContain("<Tipo>B</Tipo>")
    expect(xml).toContain("<Id>ABC12345D</Id>")
    expect(xml).toContain("<Matr>IMM001</Matr>")
    expect(xml).toContain("<Kwh>40</Kwh>")
    const totaleG = KWH_CESSIONE.reduce((a, b) => a + b, 0)
    expect(xml.split("<G>")[1].split("</G>")[0]).toContain(
      `<TotaleQuadro>${totaleG}</TotaleQuadro>`
    )
  })

  it("omette il Quadro G quando non c'è cessione alla rete", () => {
    const xml = generaDichiarazioneEeSemestraleXml({ ...INPUT_SINTETICO, quadroG: null })
    expect(xml).not.toContain("<G>")
    expect(xml).not.toContain("<Tipo>B</Tipo>")
  })

  it("arrotonda i kWh a numero intero", () => {
    const input: DichiarazioneEeSemestraleInput = {
      ...INPUT_SINTETICO,
      quadroA: INPUT_SINTETICO.quadroA.map((mese, i) =>
        i === 0
          ? { ...mese, contatori: [{ ...mese.contatori[0], kwh: 100.6 }] }
          : mese
      ),
    }
    const xml = generaDichiarazioneEeSemestraleXml(input)
    expect(xml).toContain("<kWh>101</kWh>")
  })

  it("rifiuta un codice ditta malformato", () => {
    expect(() =>
      generaDichiarazioneEeSemestraleXml({ ...INPUT_SINTETICO, codDitta: "non-valido" })
    ).toThrow()
  })

  it("rifiuta se il Quadro A non ha esattamente 6 mesi", () => {
    expect(() =>
      generaDichiarazioneEeSemestraleXml({
        ...INPUT_SINTETICO,
        quadroA: INPUT_SINTETICO.quadroA.slice(0, 5),
      })
    ).toThrow()
  })
})

describe("parseDichiarazioneEeSemestraleXml", () => {
  it("ricostruisce gli stessi dati (round-trip) di un XML con Quadro G", () => {
    const xml = generaDichiarazioneEeSemestraleXml(INPUT_SINTETICO)
    const parsed = parseDichiarazioneEeSemestraleXml(xml)
    expect(parsed.codDitta).toBe("ABC12345D")
    expect(parsed.codAtt).toBe(1)
    expect(parsed.anno).toBe(2026)
    expect(parsed.periodoRiferimento).toBe(1)
    expect(parsed.quadroA).toHaveLength(6)
    expect(parsed.quadroA[0]).toEqual({
      numMese: 1,
      contatori: [
        { matricola: "PROD001", lettA: 100, lettP: 0, diffLett: 100, costLett: 1, kwh: 100 },
      ],
    })
    expect(parsed.quadroC).toHaveLength(6)
    expect(parsed.quadroC[0]).toEqual({ numMese: 1, kwh: 60 })
    expect(parsed.quadroG).toHaveLength(6)
    expect(parsed.quadroG![0]).toEqual({
      numMese: 1,
      contatori: [
        {
          matricola: "IMM001",
          lettA: 40,
          lettP: 0,
          diffLett: 40,
          costLett: 1,
          kwh: 40,
          tipo: "B",
          id: "ABC12345D",
        },
      ],
    })
  })

  it("gestisce l'assenza del Quadro G", () => {
    const xml = generaDichiarazioneEeSemestraleXml({ ...INPUT_SINTETICO, quadroG: null })
    const parsed = parseDichiarazioneEeSemestraleXml(xml)
    expect(parsed.quadroG).toBeNull()
  })
})
