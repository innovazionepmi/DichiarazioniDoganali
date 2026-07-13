import { describe, expect, it } from "vitest"
import {
  autoconsumoMensile,
  autoconsumoNegativo,
  letturaRegistro,
  mesePrecedente,
  ordineGrandezzaPlausibile,
  riconciliazione,
} from "./registro"

// Valori di ancoraggio: dataset storico reale fornito dal cliente per
// collaudare il motore (fonte anonimizzata) — lettura precedente 1165,
// lettura attuale 3490, K=25, energia 58125 kWh (notazione italiana a punti
// nel documento originale: 58.125).
describe("letturaRegistro", () => {
  it("riproduce un caso reale di lettura progressiva di registro", () => {
    const risultato = letturaRegistro(
      1165,
      25,
      [{ anno: 2025, mese: 12, valore_periodo: 58125 }],
      { anno: 2025, mese: 12 }
    )
    expect(risultato).toBe(3490)
  })

  it("accumula correttamente su più mesi", () => {
    const letture = [
      { anno: 2025, mese: 1, valore_periodo: 30000 },
      { anno: 2025, mese: 2, valore_periodo: 28125 },
    ]
    expect(letturaRegistro(1165, 25, letture, { anno: 2025, mese: 1 })).toBe(1165 + 30000 / 25)
    expect(letturaRegistro(1165, 25, letture, { anno: 2025, mese: 2 })).toBe(3490)
  })

  it("ignora le letture successive al periodo richiesto", () => {
    const letture = [
      { anno: 2025, mese: 1, valore_periodo: 1000 },
      { anno: 2025, mese: 2, valore_periodo: 9999 },
    ]
    expect(letturaRegistro(0, 25, letture, { anno: 2025, mese: 1 })).toBe(1000 / 25)
  })

  it("un contatore nuovo (lettura_iniziale=0) parte da zero", () => {
    expect(letturaRegistro(0, 25, [], { anno: 2025, mese: 1 })).toBe(0)
  })
})

describe("mesePrecedente", () => {
  it("torna al mese precedente nello stesso anno", () => {
    expect(mesePrecedente({ anno: 2025, mese: 6 })).toEqual({ anno: 2025, mese: 5 })
  })

  it("torna a dicembre dell'anno precedente da gennaio", () => {
    expect(mesePrecedente({ anno: 2025, mese: 1 })).toEqual({ anno: 2024, mese: 12 })
  })
})

// Valori reali: dataset storico del cliente, una coppia produzione/immissione
// di gennaio (fonte anonimizzata) — produzione 2055.215, immissione 686.815.
describe("autoconsumoMensile", () => {
  it("riproduce un caso reale di autoconsumo mensile", () => {
    expect(autoconsumoMensile(2055.215, 686.815)).toBeCloseTo(1368.4, 3)
  })

  it("può essere negativo (dato anomalo, deve essere segnalato)", () => {
    const risultato = autoconsumoMensile(100, 150)
    expect(risultato).toBe(-50)
    expect(autoconsumoNegativo(risultato)).toBe(true)
  })

  it("un autoconsumo positivo non viene segnalato", () => {
    expect(autoconsumoNegativo(autoconsumoMensile(1368.4, 686.815))).toBe(false)
  })
})

describe("riconciliazione", () => {
  it("verifica quando il totale mensile coincide con il delta di registro × K", () => {
    const letture = [
      { anno: 2025, mese: 1, valore_periodo: 2500 },
      { anno: 2025, mese: 2, valore_periodo: 3000 },
      { anno: 2025, mese: 3, valore_periodo: 2000 },
    ]
    const risultato = riconciliazione(1165, 25, letture, {
      inizio: { anno: 2025, mese: 1 },
      fine: { anno: 2025, mese: 3 },
    })
    expect(risultato.verificato).toBe(true)
    expect(risultato.atteso).toBe(7500)
    expect(risultato.calcolato).toBeCloseTo(7500, 6)
  })

  it("un mese mancante nella serie riduce il totale ma resta internamente coerente", () => {
    // atteso e calcolato derivano entrambi dallo stesso array `letture`, quindi
    // un mese assente abbassa il totale invece di generare un falso mismatch —
    // utile capire che questo controllo intercetta errori aritmetici, non
    // l'assenza di dati (quella è responsabilità della UI, non del motore).
    const letture = [
      { anno: 2025, mese: 1, valore_periodo: 2500 },
      // febbraio mancante
      { anno: 2025, mese: 3, valore_periodo: 2000 },
    ]
    const risultato = riconciliazione(1165, 25, letture, {
      inizio: { anno: 2025, mese: 1 },
      fine: { anno: 2025, mese: 3 },
    })
    expect(risultato.verificato).toBe(true)
    expect(risultato.atteso).toBe(4500)
  })
})

describe("ordineGrandezzaPlausibile", () => {
  it("segnala l'esempio del brief: 30 kW che 'produce' 1.000.000 kWh", () => {
    expect(ordineGrandezzaPlausibile(1_000_000, 30)).toBe(false)
  })

  it("non segnala una produzione mensile plausibile", () => {
    expect(ordineGrandezzaPlausibile(4000, 30)).toBe(true)
  })

  it("non segnala nulla se la potenza non è ancora impostata", () => {
    expect(ordineGrandezzaPlausibile(1_000_000, 0)).toBe(true)
  })
})
