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
  const quadroG = parsed.quadroG ? quadroGXml(parsed.quadroG) : ""

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<EnergiaElettricaSemestrale xmlns="${NAMESPACE}">` +
    dich +
    periodo +
    quadroA +
    quadroG +
    `</EnergiaElettricaSemestrale>`
  )
}
