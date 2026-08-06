import { XMLParser } from "fast-xml-parser"
import {
  dichiarazioneEeSemestraleSchema,
  type DichiarazioneEeSemestraleInput,
} from "../validation/dichiarazione-ee.schema"

// Genera l'XML della dichiarazione semestrale energia elettrica, limitato a
// Quadro A (produzione) + Quadro G (cessione alla rete, Tipo "B" —
// vettoriamento) — l'unico caso coperto per ora: "officina di produzione da
// fonti rinnovabili uso proprio esente" (autoconsumo + eccedenza immessa in
// rete, nessuna vendita a consumatori finali/consorziati/consociati). Per
// quel profilo le istruzioni ADM (Allegato 4, Circolare 9/2026) dicono
// esplicitamente che i quadri J/L/M non vanno compilati — vedi piano di
// implementazione per i riferimenti.
//
// Struttura e vincoli ricalcati da EnergiaElettricaSemestrale.xsd /
// EE_ComplexTypes_Semestrale.xsd (namespace sotto). Nessuna libreria XML
// esterna: la struttura è abbastanza semplice da costruire con template
// string, evitando una dipendenza in più.
const NAMESPACE = "http://energiaelettrica.jaxb.types.controlliEEGN.accise.adm.finanze.it"

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function el(tag: string, value: string): string {
  return `<${tag}>${escapeXml(value)}</${tag}>`
}

function formatLettura(value: number): string {
  return value.toFixed(4)
}

function formatCostante(value: number): string {
  return value.toFixed(4)
}

function formatKwh(value: number): string {
  return Math.round(value).toString()
}

type ContatoreRiga = DichiarazioneEeSemestraleInput["quadroA"][number]["contatori"][number]

function contatoreProduzioneXml(c: ContatoreRiga): string {
  return (
    `<Contatore>` +
    el("Matr", c.matricola) +
    el("LettA", formatLettura(c.lettA)) +
    el("LettP", formatLettura(c.lettP)) +
    el("DiffLett", formatLettura(c.diffLett)) +
    el("CostLett", formatCostante(c.costLett)) +
    el("kWh", formatKwh(c.kwh)) +
    `</Contatore>`
  )
}

type ContatoreCedutaRiga = NonNullable<
  DichiarazioneEeSemestraleInput["quadroG"]
>[number]["contatori"][number]

function contatoreCedutaXml(c: ContatoreCedutaRiga): string {
  return (
    `<Contatore>` +
    el("Tipo", c.tipo) +
    el("Id", c.id) +
    el("Matr", c.matricola) +
    el("LettA", formatLettura(c.lettA)) +
    el("LettP", formatLettura(c.lettP)) +
    el("DiffLett", formatLettura(c.diffLett)) +
    el("CostLett", formatCostante(c.costLett)) +
    el("Kwh", formatKwh(c.kwh)) +
    `</Contatore>`
  )
}

// Tipologia fissa "L2" (Allegato 1 Circolare 6/2026): unico codice uso
// coperto per il profilo "officina di produzione da fonti rinnovabili uso
// proprio esente". Matr vuoto e nessuna lettura/costante: misurato "per
// differenza" (Circolare 20/2026 punto 1), non da un contatore dedicato.
const TIPOLOGIA_QUADRO_C = "L2"

function quadroCXml(mesi: DichiarazioneEeSemestraleInput["quadroC"]): string {
  const meseNodi = mesi
    .map((mese) => {
      const kwh = formatKwh(mese.kwh)
      return (
        `<Mese NumMese="${mese.numMese}">` +
        `<Contatore>` +
        el("Matr", "") +
        el("kWh", kwh) +
        el("Tipologia", TIPOLOGIA_QUADRO_C) +
        `</Contatore>` +
        el("TotaleMese", kwh) +
        `</Mese>`
      )
    })
    .join("")
  const totaleQuadro = mesi.reduce((acc, mese) => acc + Math.round(mese.kwh), 0)
  return `<C>${meseNodi}${el("TotaleQuadro", formatKwh(totaleQuadro))}</C>`
}

function quadroAXml(mesi: DichiarazioneEeSemestraleInput["quadroA"]): string {
  const meseNodi = mesi
    .map((mese) => {
      const totaleMese = mese.contatori.reduce((acc, c) => acc + Math.round(c.kwh), 0)
      return (
        `<Mese NumMese="${mese.numMese}">` +
        mese.contatori.map(contatoreProduzioneXml).join("") +
        el("TotaleMese", formatKwh(totaleMese)) +
        `</Mese>`
      )
    })
    .join("")
  const totaleQuadro = mesi.reduce(
    (acc, mese) => acc + mese.contatori.reduce((a, c) => a + Math.round(c.kwh), 0),
    0
  )
  return `<A>${meseNodi}${el("TotaleQuadro", formatKwh(totaleQuadro))}</A>`
}

function quadroGXml(mesi: NonNullable<DichiarazioneEeSemestraleInput["quadroG"]>): string {
  const meseNodi = mesi
    .map((mese) => {
      const totaleMese = mese.contatori.reduce((acc, c) => acc + Math.round(c.kwh), 0)
      return (
        `<Mese NumMese="${mese.numMese}">` +
        mese.contatori.map(contatoreCedutaXml).join("") +
        el("TotaleMese", formatKwh(totaleMese)) +
        `</Mese>`
      )
    })
    .join("")
  const totaleQuadro = mesi.reduce(
    (acc, mese) => acc + mese.contatori.reduce((a, c) => a + Math.round(c.kwh), 0),
    0
  )
  return `<G>${meseNodi}${el("TotaleQuadro", formatKwh(totaleQuadro))}</G>`
}

export function generaDichiarazioneEeSemestraleXml(input: DichiarazioneEeSemestraleInput): string {
  const parsed = dichiarazioneEeSemestraleSchema.parse(input)

  const dich = `<Dich>${el("CodDitta", parsed.codDitta)}${el("CodAtt", String(parsed.codAtt))}</Dich>`
  const periodo = `<Periodo>${el("Anno", String(parsed.anno))}${el("PeriodoRiferimento", String(parsed.periodoRiferimento))}</Periodo>`
  const quadroA = quadroAXml(parsed.quadroA)
  const quadroC = quadroCXml(parsed.quadroC)
  const quadroG = parsed.quadroG ? quadroGXml(parsed.quadroG) : ""

  // Ordine elementi vincolato dallo XSD (EE_ComplexTypes_Semestrale.xsd):
  // Dich, Periodo, A, C, ..., G — il Quadro C va tra A e G, non dopo.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<EnergiaElettricaSemestrale xmlns="${NAMESPACE}">` +
    dich +
    periodo +
    quadroA +
    quadroC +
    quadroG +
    `</EnergiaElettricaSemestrale>`
  )
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "Mese" || name === "Contatore",
})

// Inverso del generatore: ricostruisce i dati strutturati dall'XML già
// generato e archiviato (documento_xml_id), invece di ricalcolarli da
// letture/contatori — così la schermata di riepilogo pre-invio mostra
// esattamente ciò che è stato scritto nel file (quello poi firmato da
// Paolo), anche se nel frattempo qualcosa a DB fosse cambiato.
export function parseDichiarazioneEeSemestraleXml(xml: string): DichiarazioneEeSemestraleInput {
  const parsed = parser.parse(xml)
  const root = parsed.EnergiaElettricaSemestrale

  function contatoreProduzione(c: Record<string, unknown>) {
    return {
      matricola: String(c.Matr),
      lettA: Number(c.LettA),
      lettP: Number(c.LettP),
      diffLett: Number(c.DiffLett),
      costLett: Number(c.CostLett),
      kwh: Number(c.kWh),
    }
  }

  function contatoreCeduta(c: Record<string, unknown>) {
    return {
      ...contatoreProduzione({ ...c, kWh: c.Kwh }),
      tipo: "B" as const,
      id: String(c.Id),
    }
  }

  function mesiQuadro(
    quadro: Record<string, unknown> | undefined,
    mappaContatore: (c: Record<string, unknown>) => ReturnType<typeof contatoreProduzione>
  ) {
    const mesi = (quadro?.Mese ?? []) as Record<string, unknown>[]
    return mesi.map((mese) => ({
      numMese: Number(mese["@_NumMese"]),
      contatori: (mese.Contatore as Record<string, unknown>[]).map(mappaContatore),
    }))
  }

  function mesiQuadroC(quadro: Record<string, unknown> | undefined) {
    const mesi = (quadro?.Mese ?? []) as Record<string, unknown>[]
    return mesi.map((mese) => {
      const contatori = mese.Contatore as Record<string, unknown>[]
      return { numMese: Number(mese["@_NumMese"]), kwh: Number(contatori[0].kWh) }
    })
  }

  return dichiarazioneEeSemestraleSchema.parse({
    codDitta: String(root.Dich.CodDitta),
    codAtt: Number(root.Dich.CodAtt),
    anno: Number(root.Periodo.Anno),
    periodoRiferimento: Number(root.Periodo.PeriodoRiferimento),
    quadroA: mesiQuadro(root.A, contatoreProduzione),
    quadroC: mesiQuadroC(root.C),
    quadroG: root.G ? mesiQuadro(root.G, contatoreCeduta) : null,
  })
}
