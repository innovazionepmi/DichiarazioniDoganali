// Parser deterministico (testo + regex) per il PDF "stampa pagina" del
// portale E-distribuzione (brief §5.4, modalità preferita di raccolta
// letture). Il PDF ha un layer di testo pulito e una struttura stabile:
// non serve OCR/Claude vision per questo formato.
//
// Per ogni mese il PDF riporta DUE righe consecutive con la stessa
// MESE/ANNO: la prima con i valori "immessa" (F1/F2/F3), la seconda con i
// valori "prelevata". Si importa solo la riga "immessa": la dichiarazione
// doganale (Quadro A/G, verificato su documenti reali) usa produzione e
// immessa, "prelevata" è presumibilmente rilevante solo per GSE/fatturazione
// — assunzione da riconfermare al primo caso reale che la contraddica.

export interface LetturaMensileParsata {
  mese: number
  anno: number
  f1: number
  f2: number
  f3: number
}

export interface RisultatoParsingEdistribuzione {
  pod: string | null
  matricola: string | null
  costanteK: number | null
  indirizzoFornitura: string | null
  letture: LetturaMensileParsata[]
  avvisi: string[]
}

const RIGA_MESE_ANNO = /(\d{2})\/(\d{4})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g

export function parseEdistribuzionePdf(testo: string): RisultatoParsingEdistribuzione {
  const avvisi: string[] = []

  const pod = testo.match(/Codice POD:\s*([A-Za-z0-9]+)/)?.[1] ?? null
  const matricola = testo.match(/Matricola contatore:\s*(\S+)/)?.[1] ?? null
  const kMatch = testo.match(/Costante K \(A\*V\):\s*([\d.]+)/)
  const costanteK = kMatch ? Number(kMatch[1]) : null
  const indirizzoFornitura =
    testo.match(/Indirizzo di fornitura:\s*(.+)/)?.[1]?.trim() ?? null

  if (!pod) avvisi.push("Codice POD non trovato nel PDF")
  if (!matricola) avvisi.push("Matricola contatore non trovata nel PDF")
  if (costanteK === null) avvisi.push("Costante K non trovata nel PDF")

  // La pagina prosegue con altre tabelle (picco di potenza in kW, energia
  // reattiva) che hanno la STESSA forma "MM/AAAA valore valore valore" ma
  // non sono energia attiva in kWh: vanno escluse esplicitamente, non solo
  // la prima tabella "Energia attiva (kWh)" ma tutto ciò che segue fino al
  // primo indicatore di un'altra grandezza. "Energia attiva (kW)" (senza
  // "h") è l'inizio della tabella di picco potenza, sempre presente dopo la
  // tabella energia sui PDF osservati: la usiamo come confine di sicurezza.
  const inizioSezione = testo.indexOf("Valori di energia")
  const fineSezione = testo.indexOf("Energia attiva (kW)")
  const sezioneEnergia =
    inizioSezione >= 0
      ? testo.slice(inizioSezione, fineSezione > inizioSezione ? fineSezione : undefined)
      : testo

  if (inizioSezione < 0) {
    avvisi.push(
      "Sezione 'Valori di energia' non trovata nel PDF: l'estrazione delle letture mensili potrebbe includere dati non pertinenti (es. picchi di potenza)."
    )
  }

  const righeGrezze: LetturaMensileParsata[] = []
  for (const match of sezioneEnergia.matchAll(RIGA_MESE_ANNO)) {
    const [, meseStr, annoStr, f1Str, f2Str, f3Str] = match
    righeGrezze.push({
      mese: Number(meseStr),
      anno: Number(annoStr),
      f1: Number(f1Str),
      f2: Number(f2Str),
      f3: Number(f3Str),
    })
  }

  const letture: LetturaMensileParsata[] = []
  let i = 0
  while (i < righeGrezze.length) {
    const corrente = righeGrezze[i]
    const successiva = righeGrezze[i + 1]
    letture.push(corrente)

    if (successiva && successiva.mese === corrente.mese && successiva.anno === corrente.anno) {
      i += 2 // salta la riga "prelevata" abbinata
    } else {
      avvisi.push(
        `Mese ${String(corrente.mese).padStart(2, "0")}/${corrente.anno}: trovata una sola riga di valori (attese due, immessa+prelevata) — verificare manualmente.`
      )
      i += 1
    }
  }

  if (letture.length === 0) {
    avvisi.push("Nessun valore mensile trovato nel PDF")
  }

  return { pod, matricola, costanteK, indirizzoFornitura, letture, avvisi }
}
