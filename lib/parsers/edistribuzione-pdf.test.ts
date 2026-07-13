import { describe, expect, it } from "vitest"
import { parseEdistribuzionePdf } from "./edistribuzione-pdf"

// Fixture sintetica: stessa struttura del PDF "stampa pagina" reale
// (verificata a mano contro un file reale in fase di sviluppo, mai
// committato), ma POD/matricola/indirizzo/valori sono inventati.
const TESTO_SINTETICO = `Curve di Carico
DITTA DI PROVA SRL
Curve di carico
La tua fornitura
Matricola contatore: 	00099999
Codice contatore: 	11A1B1C11
Potenza (kW): 	50
Tensione: 	BT
Potenza disponibile (kW): 	50
Costante K (A*V): 	10
Periodo di rifermento
Inizio:
Mese
Gennaio
Anno
2025
Fine:
Mese
Marzo
Anno
2025
Valori di energia
Codice POD: 	IT001E00099999
Indirizzo di fornitura: 	VIA DI PROVA 1, COMUNE DI PROVA - AB 00000
Modifica periodo
Energia attiva (kWh) 	Energia Reattiva capacitiva (kVARh) 	Energia Reattiva Induttiva (kVARh)
MESE/ANNO 	F1 IMMESSA 	F2 IMMESSA 	F3 IMMESSA 	F1 PRELEVATA 	F2 PRELEVATA 	F3 PRELEVATA
01/2025 	100.5 	200.25 	50.1
01/2025 	900.1 	800.2 	700.3
Valori di picco di potenza
Curva di carico
MESE/ANNO 	F1 IMMESSA 	F2 IMMESSA 	F3 IMMESSA 	F1 PRELEVATA 	F2 PRELEVATA 	F3 PRELEVATA
02/2025 	120.0 	210.0 	60.0
02/2025 	850.0 	780.0 	650.0
03/2025 	80.75 	150.5 	40.25
03/2025 	700.0 	600.0 	500.0
Energia attiva (kW) 	Energia Reattiva capacitiva (kVAR) 	Energia Reattiva Induttiva (kVAR)
MESE/ANNO 	F1 IMMESSA 	F2 IMMESSA 	F3 IMMESSA 	F1 PRELEVATA 	F2 PRELEVATA 	F3 PRELEVATA
01/2025 	9.9 	9.9 	9.9
01/2025 	9.9 	9.9 	9.9
02/2025 	9.9 	9.9 	9.9
02/2025 	9.9 	9.9 	9.9
03/2025 	9.9 	9.9 	9.9
03/2025 	9.9 	9.9 	9.9
`

describe("parseEdistribuzionePdf", () => {
  it("estrae POD, matricola, K e indirizzo", () => {
    const risultato = parseEdistribuzionePdf(TESTO_SINTETICO)
    expect(risultato.pod).toBe("IT001E00099999")
    expect(risultato.matricola).toBe("00099999")
    expect(risultato.costanteK).toBe(10)
    expect(risultato.indirizzoFornitura).toBe(
      "VIA DI PROVA 1, COMUNE DI PROVA - AB 00000"
    )
  })

  it("estrae solo la riga immessa (prima delle due) per ciascun mese", () => {
    const risultato = parseEdistribuzionePdf(TESTO_SINTETICO)
    expect(risultato.letture).toEqual([
      { mese: 1, anno: 2025, f1: 100.5, f2: 200.25, f3: 50.1 },
      { mese: 2, anno: 2025, f1: 120.0, f2: 210.0, f3: 60.0 },
      { mese: 3, anno: 2025, f1: 80.75, f2: 150.5, f3: 40.25 },
    ])
  })

  it("non genera avvisi quando il formato è quello atteso", () => {
    const risultato = parseEdistribuzionePdf(TESTO_SINTETICO)
    expect(risultato.avvisi).toEqual([])
  })

  it("esclude la tabella 'picco di potenza' (kW) che segue quella energia (kWh)", () => {
    // Regressione: trovato leggendo un PDF reale del cliente in fase di
    // sviluppo (mai committato) — il regex delle righe mensili corrispondeva
    // anche alla tabella di picco potenza, che ha la stessa forma
    // "MM/AAAA valore valore valore" ma valori in kW, non energia in kWh.
    const risultato = parseEdistribuzionePdf(TESTO_SINTETICO)
    const valori = risultato.letture.flatMap((l) => [l.f1, l.f2, l.f3])
    expect(valori).not.toContain(9.9)
    expect(risultato.letture).toHaveLength(3)
  })

  it("segnala un mese con una sola riga di valori (formato anomalo)", () => {
    const testoAnomalo = `Codice POD: 	IT001E00099999
Matricola contatore: 	00099999
Costante K (A*V): 	10
Indirizzo di fornitura: 	VIA DI PROVA 1
04/2025 	10.0 	20.0 	30.0
`
    const risultato = parseEdistribuzionePdf(testoAnomalo)
    expect(risultato.letture).toEqual([{ mese: 4, anno: 2025, f1: 10, f2: 20, f3: 30 }])
    expect(risultato.avvisi).toContainEqual(expect.stringContaining("04/2025"))
  })

  it("segnala quando mancano i campi anagrafici del contatore", () => {
    const risultato = parseEdistribuzionePdf("testo senza nessun campo riconoscibile")
    expect(risultato.pod).toBeNull()
    expect(risultato.matricola).toBeNull()
    expect(risultato.costanteK).toBeNull()
    expect(risultato.avvisi).toEqual(
      expect.arrayContaining([
        expect.stringContaining("POD"),
        expect.stringContaining("Matricola"),
        expect.stringContaining("K"),
      ])
    )
  })

  it("non estrae righe mensili da testo senza la tabella valori", () => {
    const risultato = parseEdistribuzionePdf("Codice POD: \tIT001E00099999")
    expect(risultato.letture).toEqual([])
    expect(risultato.avvisi).toContainEqual(
      expect.stringContaining("Nessun valore mensile")
    )
  })
})
