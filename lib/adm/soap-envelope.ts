import { XMLParser } from "fast-xml-parser"

// Logica pura (costruzione busta SOAP, interpretazione risposta,
// categorizzazione codici) separata da lib/adm/soap-client.ts apposta: qui
// niente "server-only"/rete/Supabase, così è testabile senza mock — stesso
// principio di lib/xml/dichiarazione-ee-semestrale.ts (pura) vs
// lib/actions/dichiarazioni.ts (orchestrazione).

export type CategoriaErroreAdm = "certificato" | "xml_malformato" | "rete" | "esito_negativo" | "altro"

export type EsitoInvioAdm =
  | { ok: true; iut: string; esitoCodice: string; esitoMessaggi: string[]; dataRegistrazione: string | null }
  | { ok: false; categoria: CategoriaErroreAdm; messaggio: string; dettaglioTecnico?: string; iut?: string }

export type EsitoControlloStato =
  | { ok: true; codice: string; descrizione: string }
  | { ok: false; categoria: CategoriaErroreAdm; messaggio: string; dettaglioTecnico?: string }

// Tabella codici di stato/errore ADM (manuale operativo, §7 — dichiarazione
// semestrale energia elettrica). Usata sia per l'esito immediato del metodo
// `process` sia per il controllo stato asincrono (stesso spazio di codici).
export const DESCRIZIONE_CODICE: Record<string, string> = {
  "0": "Impossibile fornire una risposta a causa di un errore interno imprevisto",
  "1": "La verifica della firma è fallita",
  "2": "Il certificato utilizzato per la firma non è valido",
  "3": "L'Autorità di certificazione non è ritenuta sicura",
  "4": "La verifica dell'integrità del messaggio è fallita",
  "10": "Verifica XSD fallita",
  "11": "Verifica XSD esito fallita",
  "14": "Utente non autorizzato",
  "15": "Dati di input non validi",
  "16": "Certificato di autenticazione non valido",
  "18": "Firmatario non autorizzato",
  "20": "Acquisito a sistema",
  "50": "In elaborazione",
  "197": "Elaborazione KO: senza esito",
  "198": "Elaborazione KO: con esito",
  "199": "Elaborazione OK: completata senza esito finale",
  "200": "Elaborazione OK: completata con esito finale",
}

const CODICI_CERTIFICATO = new Set(["1", "2", "3", "4", "16", "18"])
const CODICI_XML_MALFORMATO = new Set(["10", "11", "15"])
const CODICI_ESITO_NEGATIVO = new Set(["197", "198"])
const CODICI_NON_ERRORE = new Set(["20", "50", "51", "199", "200"])

export function categorizzaCodice(codice: string): CategoriaErroreAdm | null {
  if (CODICI_NON_ERRORE.has(codice)) return null
  if (CODICI_CERTIFICATO.has(codice)) return "certificato"
  if (CODICI_XML_MALFORMATO.has(codice)) return "xml_malformato"
  if (CODICI_ESITO_NEGATIVO.has(codice)) return "esito_negativo"
  return "altro"
}

// Errori a livello di connessione TLS/rete: distinguiamo certificato (chiave
// errata, cifratura corrotta, CA non riconosciuta) da problemi di rete puri
// (host irraggiungibile, timeout) in base al codice errore di Node — non è
// una scienza esatta, ma copre i casi più comuni senza dover indovinare dal
// messaggio.
export function categorizzaErroreConnessione(err: unknown): { categoria: CategoriaErroreAdm; messaggio: string } {
  const code = (err as { code?: string })?.code ?? ""
  const message = err instanceof Error ? err.message : String(err)

  const CODICI_CERTIFICATO_TLS = [
    "ERR_OSSL_",
    "EPROTO",
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT",
    "ERR_TLS_CERT_ALTERNATIVE_NAME_INVALID",
    "SELF_SIGNED_CERT_IN_CHAIN",
  ]
  if (CODICI_CERTIFICATO_TLS.some((c) => code.includes(c))) {
    return {
      categoria: "certificato",
      messaggio:
        "Errore nella connessione sicura con ADM: il certificato caricato potrebbe essere scaduto, corrotto o con password errata.",
    }
  }

  const CODICI_RETE = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN"]
  if (CODICI_RETE.includes(code)) {
    return {
      categoria: "rete",
      messaggio: "Impossibile raggiungere il servizio ADM (rete o servizio non disponibile).",
    }
  }

  return { categoria: "altro", messaggio: `Errore imprevisto nella connessione ad ADM: ${message}` }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function costruisciBustaInvio(xmlFirmatoBase64: string, dichiarante: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <Input xmlns="http://eesemestralim24.domest.sogei.it">
      <serviceId>invioEnergiaElettricaSemestrale</serviceId>
      <data>
        <xml>${xmlFirmatoBase64}</xml>
        <dichiarante>${escapeXml(dichiarante)}</dichiarante>
      </data>
    </Input>
  </soapenv:Body>
</soapenv:Envelope>`
}

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, trimValues: true })

function estraiMessaggi(valore: unknown): string[] {
  if (Array.isArray(valore)) return valore.map(String)
  if (valore === undefined || valore === null) return []
  return [String(valore)]
}

export function interpretaRispostaInvio(httpBody: string): EsitoInvioAdm {
  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(httpBody)
  } catch {
    return {
      ok: false,
      categoria: "altro",
      messaggio: "La risposta di ADM non è un XML valido.",
      dettaglioTecnico: httpBody.slice(0, 2000),
    }
  }

  const envelope = parsed?.Envelope as Record<string, unknown> | undefined
  const body = envelope?.Body as Record<string, unknown> | undefined
  const fault = body?.Fault as Record<string, unknown> | undefined
  if (fault) {
    return {
      ok: false,
      categoria: "altro",
      messaggio: String(fault.faultstring ?? "Errore SOAP restituito da ADM (senza dettaglio)."),
      dettaglioTecnico: JSON.stringify(fault),
    }
  }

  const output = body?.Output as Record<string, unknown> | undefined
  if (!output) {
    return {
      ok: false,
      categoria: "altro",
      messaggio: "Risposta di ADM in un formato non riconosciuto.",
      dettaglioTecnico: httpBody.slice(0, 2000),
    }
  }

  const esito = output.esito as Record<string, unknown> | undefined
  const esitoCodice = String(esito?.codice ?? "")
  const esitoMessaggi = estraiMessaggi(esito?.messaggio)
  const categoria = categorizzaCodice(esitoCodice)

  if (categoria) {
    const iutRespinto = output.IUT ? String(output.IUT) : undefined
    return {
      ok: false,
      categoria,
      messaggio: esitoMessaggi.length > 0 ? esitoMessaggi.join(" — ") : `Codice esito ADM: ${esitoCodice}`,
      // Include sempre il corpo grezzo, non solo il codice: quando ADM non
      // valorizza <esito><messaggio> (es. codice 16) è l'unico modo per
      // scoprire se la risposta contiene altri dettagli utili non ancora
      // mappati dal parser.
      dettaglioTecnico: `Codice ADM: ${esitoCodice}\n\n${httpBody.slice(0, 2000)}`,
      // ADM può assegnare uno IUT anche a un esito respinto (es. codice 16):
      // il messaggio è comunque stato accolto/registrato, solo bocciato in
      // un controllo successivo. Utile per il controllo stato manuale.
      ...(iutRespinto ? { iut: iutRespinto } : {}),
    }
  }

  return {
    ok: true,
    iut: String(output.IUT ?? ""),
    esitoCodice,
    esitoMessaggi,
    dataRegistrazione: output.dataRegistrazione ? String(output.dataRegistrazione) : null,
  }
}

// --- InteropService.recuperaEsito -------------------------------------
// Struttura verificata sul WSDL reale (InteropService.wsdl, fornito
// dall'utente): richiesta { iut }, risposta Risposta { IUT, esito?, data?
// (base64Binary), dataRegistrazione }. `data` contiene il documento ESITO
// vero e proprio, sigillato da ADM con firma XAdES-BES enveloped — non
// verifichiamo quella firma (serve solo ai controlli legali di ADM, non a
// mostrare il contenuto all'operatore), leggiamo solo gli elementi
// <Segnalazione> al suo interno. Struttura del documento ESITO (namespace
// rendicontazioni.depositifiscali.monopoli.finanze.it) verificata su un
// esempio reale scaricato da MONET (ambiente di addestramento, non da un
// XSD ufficiale): il "numero di registrazione" (es. "2026/A/1733") sta nel
// campo DatoInviato della segnalazione con Sezione="PROTOCOLLAZIONE".

export type SegnalazioneEsito = {
  sezione: string
  gravita: string
  descrizione: string
  datoAtteso: string
  datoInviato: string
  progressivo: number
}

export type EsitoRecuperoEsito =
  | {
      ok: true
      iut: string
      codice: string | null
      messaggi: string[]
      dataRegistrazione: string | null
      numeroRegistrazione: string | null
      segnalazioni: SegnalazioneEsito[]
    }
  | { ok: false; categoria: CategoriaErroreAdm; messaggio: string; dettaglioTecnico?: string }

export function costruisciBustaRecuperaEsito(iut: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <recuperaEsito xmlns="http://service.ws.sogei.it">
      <iut>${escapeXml(iut)}</iut>
    </recuperaEsito>
  </soapenv:Body>
</soapenv:Envelope>`
}

const parserEsito = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  trimValues: true,
  isArray: (name) => name === "Segnalazione",
})

function estraiSegnalazioni(xmlEsitoDecodificato: string): SegnalazioneEsito[] {
  let parsed: Record<string, unknown>
  try {
    parsed = parserEsito.parse(xmlEsitoDecodificato)
  } catch {
    return []
  }
  const segnalazioni = (parsed?.Esito as Record<string, unknown> | undefined)?.Segnalazione as
    | Record<string, unknown>[]
    | undefined
  if (!segnalazioni) return []
  return segnalazioni.map((s) => ({
    sezione: String(s.Sezione ?? ""),
    gravita: String(s.Gravita ?? ""),
    descrizione: String(s.Descrizione ?? ""),
    datoAtteso: String(s.DatoAtteso ?? ""),
    datoInviato: String(s.DatoInviato ?? ""),
    progressivo: Number(s.Progressivo ?? 0),
  }))
}

export function numeroRegistrazione(segnalazioni: SegnalazioneEsito[]): string | null {
  const protocollazione = segnalazioni.find((s) => s.sezione === "PROTOCOLLAZIONE")
  return protocollazione?.datoInviato || null
}

export function interpretaRispostaRecuperaEsito(httpBody: string): EsitoRecuperoEsito {
  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(httpBody)
  } catch {
    return {
      ok: false,
      categoria: "altro",
      messaggio: "La risposta di ADM non è un XML valido.",
      dettaglioTecnico: httpBody.slice(0, 2000),
    }
  }

  const envelope = parsed?.Envelope as Record<string, unknown> | undefined
  const body = envelope?.Body as Record<string, unknown> | undefined
  const fault = body?.Fault as Record<string, unknown> | undefined
  if (fault) {
    return {
      ok: false,
      categoria: "altro",
      messaggio: String(fault.faultstring ?? "Errore SOAP restituito da ADM (senza dettaglio)."),
      dettaglioTecnico: JSON.stringify(fault),
    }
  }

  const risposta = (body?.recuperaEsitoResponse as Record<string, unknown> | undefined)
    ?.recuperaEsitoReturn as Record<string, unknown> | undefined
  if (!risposta) {
    return {
      ok: false,
      categoria: "altro",
      messaggio: "Risposta di ADM in un formato non riconosciuto.",
      dettaglioTecnico: httpBody.slice(0, 2000),
    }
  }

  const esito = risposta.esito as Record<string, unknown> | undefined
  const dataBase64 = risposta.data ? String(risposta.data) : null
  const segnalazioni = dataBase64
    ? estraiSegnalazioni(Buffer.from(dataBase64, "base64").toString("utf-8"))
    : []

  return {
    ok: true,
    iut: String(risposta.IUT ?? ""),
    codice: esito?.codice ? String(esito.codice) : null,
    messaggi: estraiMessaggi(esito?.messaggio),
    dataRegistrazione: risposta.dataRegistrazione ? String(risposta.dataRegistrazione) : null,
    numeroRegistrazione: numeroRegistrazione(segnalazioni),
    segnalazioni,
  }
}

export function interpretaCodiceStato(codiceGrezzo: string): EsitoControlloStato {
  const codice = codiceGrezzo.trim().replace(/"/g, "")
  const descrizione = DESCRIZIONE_CODICE[codice] ?? `Codice non riconosciuto: ${codice}`
  const categoria = categorizzaCodice(codice)
  if (categoria) {
    return { ok: false, categoria, messaggio: descrizione, dettaglioTecnico: `Codice ADM: ${codice}` }
  }
  return { ok: true, codice, descrizione }
}
