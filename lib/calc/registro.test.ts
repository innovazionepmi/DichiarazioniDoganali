import { describe, expect, it } from "vitest"
import {
  autoconsumoMensile,
  autoconsumoNegativo,
  energiaDaLetturaCumulativa,
  letturaRegistro,
  mesePrecedente,
  ordineGrandezzaPlausibile,
  riconciliazione,
  round4,
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

// Caso reale: cliente Scuola Provera (segnalato da Paolo come esempio del
// problema "letture cumulative scambiate per valori mensili"). Gennaio 2026,
// K=1: produzione 726.960 → 729.012, immissione 383.967 → 384.211.
// Autoconsumo atteso 1.808 kWh, verificato contro il registro ufficiale del
// cliente (non solo calcolato da noi).
describe("energiaDaLetturaCumulativa", () => {
  it("riproduce il caso reale Scuola Provera (K=1)", () => {
    const produzione = energiaDaLetturaCumulativa(729012, 726960, 1)
    const immissione = energiaDaLetturaCumulativa(384211, 383967, 1)
    expect(produzione).toBe(2052)
    expect(immissione).toBe(244)
    expect(autoconsumoMensile(produzione, immissione)).toBe(1808)
  })

  it("applica la costante K quando diversa da 1", () => {
    expect(energiaDaLetturaCumulativa(3490, 1165, 25)).toBe(58125)
  })
})

// Bug reale in produzione (2026-09-23): ADM ha respinto diverse dichiarazioni
// con errore 00042 "Importo non valido per il rigo: DiffLett X non
// corrisponde alla differenza attesa = Y" — sempre uno scarto di 0.0001
// sull'ultimo decimale (es. cliente CRYOS SRL, XML EE_Semestrale_2026_S1).
// Causa: lib/actions/dichiarazioni.ts calcolava `diffLett: lettA - lettP` sui
// valori GREZZI (non arrotondati) restituiti da letturaRegistro — che
// sommano tante divisioni kWh/K e portano rumore di floating point oltre la
// 4a cifra decimale — mentre LettA/LettP venivano arrotondati a 4 decimali
// SOLO al momento di scrivere l'XML (dichiarazione-ee-semestrale.ts,
// formatLettura). ADM ricalcola DiffLett dai valori LettA/LettP stampati, non
// da quelli grezzi: quando i due arrotondamenti indipendenti "scivolano" in
// direzioni diverse, la dichiarazione viene respinta. Il fix è arrotondare
// LettA/LettP a 4 decimali PRIMA di sottrarli.
describe("round4", () => {
  it("arrotonda a 4 decimali", () => {
    expect(round4(1.00005)).toBe(1.0001)
    expect(round4(170.3527)).toBe(170.3527)
  })

  it("riproduce in scala ridotta il bug reale: sottrarre PRIMA di arrotondare può disallinearsi dalla differenza tra i due valori arrotondati stampati in XML", () => {
    // Stesso meccanismo del caso reale: somme di kWh/K (qui K=3) che non
    // cadono su un multiplo esatto di 0.0001 in binario.
    const lettPRaw = 1000 + 2 / 3
    const lettARaw = 1000 + (2 + 137) / 3

    const diffLettVecchioModo = Number((lettARaw - lettPRaw).toFixed(4))
    const lettA = round4(lettARaw)
    const lettP = round4(lettPRaw)
    const diffLettNuovoModo = round4(lettA - lettP)

    // La vecchia modalità produce un DiffLett che NON torna con LettA-LettP
    // stampati — esattamente l'errore 00042 di ADM.
    expect(diffLettVecchioModo).not.toBe(Number((lettA - lettP).toFixed(4)))
    // La nuova modalità garantisce sempre coerenza con i valori stampati.
    expect(diffLettNuovoModo).toBe(Number((lettA - lettP).toFixed(4)))
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
