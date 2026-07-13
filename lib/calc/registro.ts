// Motore di calcolo del registro letture (brief §4.1). Punto critico e
// controintuitivo, segnalato esplicitamente dal cliente come fonte di
// confusione: i valori E-distribuzione sono energia reale (kWh); per la
// lettura di registro si DIVIDE per K, per tornare all'energia (dichiarazione
// doganale) si MOLTIPLICA per K. Vedi registro.test.ts per i casi verificati
// contro un dataset storico reale fornito dal cliente.

export interface Periodo {
  anno: number
  mese: number // 1-12
}

export interface LetturaMensile extends Periodo {
  valore_periodo: number
}

function periodoKey({ anno, mese }: Periodo): number {
  return anno * 12 + mese
}

export function mesePrecedente({ anno, mese }: Periodo): Periodo {
  return mese === 1 ? { anno: anno - 1, mese: 12 } : { anno, mese: mese - 1 }
}

// Lettura progressiva di registro (÷K) fino a un dato mese incluso, a
// partire dalla lettura_iniziale del contatore (il valore che il contatore
// fisico mostrava all'attivazione: 0 per un contatore nuovo, un valore reale
// per un contatore già in uso onboardato in corsa).
export function letturaRegistro(
  letturaIniziale: number,
  costanteK: number,
  letture: LetturaMensile[],
  finoA: Periodo
): number {
  const soglia = periodoKey(finoA)
  const somma = letture
    .filter((l) => periodoKey(l) <= soglia)
    .reduce((acc, l) => acc + l.valore_periodo, 0)
  return letturaIniziale + somma / costanteK
}

// Autoconsumo di un singolo mese per una coppia produzione/immissione, dai
// valori reali (kWh) del periodo — non serve K qui, la costante entra in
// gioco solo quando si passa dal registro (letture progressive) all'energia.
export function autoconsumoMensile(produzioneKwh: number, immissioneKwh: number): number {
  return produzioneKwh - immissioneKwh
}

export function autoconsumoNegativo(autoconsumo: number): boolean {
  return autoconsumo < 0
}

// Riconciliazione (brief §5.6): la somma dei valori mensili reali deve
// coincidere con (lettura fine periodo − lettura inizio periodo) × K
// calcolata sul registro. Stesso controllo "Verifica"/"VERIFICATO"
// dell'Excel del cliente.
export function riconciliazione(
  letturaIniziale: number,
  costanteK: number,
  letture: LetturaMensile[],
  periodo: { inizio: Periodo; fine: Periodo },
  tolleranza = 0.5
): { atteso: number; calcolato: number; verificato: boolean } {
  const letturaInizio = letturaRegistro(
    letturaIniziale,
    costanteK,
    letture,
    mesePrecedente(periodo.inizio)
  )
  const letturaFine = letturaRegistro(letturaIniziale, costanteK, letture, periodo.fine)
  const calcolato = (letturaFine - letturaInizio) * costanteK

  const sogliaInizio = periodoKey(periodo.inizio)
  const sogliaFine = periodoKey(periodo.fine)
  const atteso = letture
    .filter((l) => {
      const k = periodoKey(l)
      return k >= sogliaInizio && k <= sogliaFine
    })
    .reduce((acc, l) => acc + l.valore_periodo, 0)

  return { atteso, calcolato, verificato: Math.abs(atteso - calcolato) <= tolleranza }
}

// Alert soft (non bloccante, brief §5.6): scostamento di ordine di grandezza
// rispetto alla potenza installata. Soglia volutamente generosa (~300
// kWh/kW/mese, ben oltre i picchi estivi italiani) per intercettare solo
// errori grossolani come l'esempio del brief (30 kW che "produce" 1.000.000
// kWh), non normali variazioni stagionali.
export function ordineGrandezzaPlausibile(kwhMese: number, potenzaKw: number): boolean {
  if (potenzaKw <= 0) return true
  return kwhMese <= potenzaKw * 300
}
