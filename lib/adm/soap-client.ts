import "server-only"
import https from "node:https"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import {
  categorizzaErroreConnessione,
  costruisciBustaInvio,
  costruisciBustaRecuperaEsito,
  interpretaCodiceStato,
  interpretaRispostaInvio,
  interpretaRispostaRecuperaEsito,
  type EsitoControlloStato,
  type EsitoInvioAdm,
  type EsitoRecuperoEsito,
} from "./soap-envelope"

export type {
  CategoriaErroreAdm,
  EsitoControlloStato,
  EsitoInvioAdm,
  EsitoRecuperoEsito,
  SegnalazioneEsito,
} from "./soap-envelope"

// Client SOAP per il servizio di invio dichiarazioni EE semestrale di ADM
// (Fase 4). Node `https` diretto invece di `fetch`: serve il controllo
// esplicito sul certificato client per la mutua TLS (pfx/passphrase/ca), che
// `fetch`/undici non espone comodamente. Nessuna libreria SOAP: la busta è
// abbastanza semplice da costruire/interpretare a mano (lib/adm/soap-envelope.ts,
// logica pura e testata separatamente), coerente con l'approccio minimalista
// del resto del progetto.
//
// Endpoint di produzione confermati (2026-07-30) dal manuale operativo
// ufficiale "ambiente reale" fornito dall'utente
// (MANUALE_OPERATIVO_DICHIARAZIONI_EE_SEMESTRALI_REALE.pdf +
// ManualeRecuperaEsito.pdf): il dominio corretto per tutti e tre i servizi
// è **platform.adm.gov.it** (non interop.adm.gov.it, che pure risponde per
// controlloStato/recuperoEsito ma non è quello documentato per l'invio —
// probabilmente un dominio "interoperabilità" aggiuntivo, non quello
// canonico). Verificato via openssl s_client + il certificato di
// produzione reale: invio → 302 verso il WSDL, controlloStato → 406 "Dati
// input non validi" con un IUT fittizio (endpoint vivo, solo dato di
// esempio invalido), recuperoEsito → 302 verso il WSDL. Vedi
// PROJECT_STATUS.md e memoria project-xml-dogane-ricerca per il dettaglio.
//
// Verificato con openssl s_client (2026-07-14): il certificato TLS del
// server ADM è emesso da Let's Encrypt, una CA pubblica già fidata di
// default da Node — **non** serve passare un `ca` custom per verificarlo
// (anzi, farlo rompe la verifica: `ca` sostituisce l'elenco di default
// invece di aggiungersi). I file in lib/adm/certificati/ (CA root di ADM)
// non servono a questo scopo: sono verosimilmente la CA che ha emesso il
// *nostro* certificato client (confermato: l'issuer del .p12 caricato
// combacia esattamente con ca-test.pem), tenuti nel repo per riferimento ma
// non usati qui. Il server richiede comunque il certificato client
// (verificato: TLS alert "certificate required" senza `pfx`), quindi quello
// resta necessario.
type Ambiente = "test" | "produzione"

type ConfigurazioneAmbiente = {
  invio: string | null
  controlloStato: string
  soapAction: string
  recuperoEsito: string
}

const CONFIGURAZIONE_AMBIENTE: Record<Ambiente, ConfigurazioneAmbiente> = {
  test: {
    invio:
      "https://platformtest.adm.gov.it/EEsemestraliM24ServiceWeb/services/EEsemestraliM24Service",
    controlloStato:
      "https://platformtest.adm.gov.it/InteropRServiceWeb/services/InteropRService/selezionaStato",
    soapAction: "http://process.eesemestralim24.domest.sogei.it/wsdl/EEsemestraliM24Service",
    // Endpoint InteropService.recuperaEsito — verificato sul WSDL reale
    // (InteropService.wsdl, fornito dall'utente): SOAPAction vuoto
    // (soapAction="" nel binding), stile document/literal.
    recuperoEsito: "https://platformtest.adm.gov.it/InteropServiceWEB/services/InteropService",
  },
  produzione: {
    // Invio: platform.adm.gov.it, confermato sia dal manuale ufficiale che
    // dallo screenshot del pannello "Servizio" dell'account ADM di Paolo.
    invio:
      "https://platform.adm.gov.it/EEsemestraliM24ServiceWeb/services/EEsemestraliM24Service",
    // Controllo stato e recupero esito: interop.adm.gov.it — il pannello
    // "Servizi per Stato/Esito" del *proprio* account ADM (più autorevole
    // del manuale generico, che indicava invece platform.adm.gov.it per
    // questi due) mostra esplicitamente questo dominio per entrambi.
    // Entrambi i domini rispondono dal vivo (verificato con openssl
    // s_client), ma questo è quello assegnato esplicitamente all'account.
    controlloStato:
      "https://interop.adm.gov.it/InteropRServiceWeb/services/InteropRService/selezionaStato",
    soapAction: "http://process.eesemestralim24.domest.sogei.it/wsdl/EEsemestraliM24Service",
    recuperoEsito: "https://interop.adm.gov.it/InteropServiceWEB/services/InteropService",
  },
}

// Il certificato (JSON {certificatoBase64, password} cifrato in Vault) è lo
// stesso caricato da /impostazioni — vedi lib/actions/certificati-adm.ts e
// 20260714140001_certificati_adm.sql. Mai una query diretta: solo la RPC
// service-role, stesso schema di sicurezza del resto del progetto.
async function caricaCertificatoPerAmbiente(
  ambiente: Ambiente
): Promise<{ pfx: Buffer; passphrase: string } | { errore: string }> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .rpc("get_certificato_adm", { p_ambiente: ambiente })
    .maybeSingle()

  if (error) return { errore: error.message }
  if (!data || !(data as { contenuto: string | null }).contenuto) {
    return {
      errore: `Nessun certificato di autenticazione ADM caricato per l'ambiente "${ambiente}". Caricalo da Impostazioni prima di inviare.`,
    }
  }

  try {
    const parsed = JSON.parse((data as { contenuto: string }).contenuto) as {
      certificatoBase64: string
      password: string
    }
    return { pfx: Buffer.from(parsed.certificatoBase64, "base64"), passphrase: parsed.password }
  } catch {
    return { errore: "Il certificato salvato è illeggibile: ricaricalo da Impostazioni." }
  }
}

function eseguiPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  agentOptions: https.AgentOptions
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const agent = new https.Agent(agentOptions)
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        agent,
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let responseBody = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => (responseBody += chunk))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: responseBody }))
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// Invia una dichiarazione già firmata (XAdES-BES, firmata fuori dall'app —
// vedi memoria project-xml-dogane-ricerca) al servizio SOAP di ADM. Non fa
// nessuna validazione di contenuto: si fida di quello che le viene passato,
// la validazione dei dati avviene prima (generazione XML, vedi
// lib/xml/dichiarazione-ee-semestrale.ts).
export async function inviaDichiarazioneSoap({
  ambiente,
  xmlFirmato,
  dichiarante,
}: {
  ambiente: Ambiente
  xmlFirmato: Buffer
  dichiarante: string
}): Promise<EsitoInvioAdm> {
  const config = CONFIGURAZIONE_AMBIENTE[ambiente]
  if (!config.invio) {
    return {
      ok: false,
      categoria: "altro",
      messaggio: `L'endpoint di invio per l'ambiente "${ambiente}" non è ancora disponibile.`,
    }
  }

  const certificato = await caricaCertificatoPerAmbiente(ambiente)
  if ("errore" in certificato) {
    return { ok: false, categoria: "certificato", messaggio: certificato.errore }
  }

  const busta = costruisciBustaInvio(xmlFirmato.toString("base64"), dichiarante)

  try {
    const risposta = await eseguiPost(
      config.invio,
      busta,
      {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${config.soapAction}"`,
      },
      {
        pfx: certificato.pfx,
        passphrase: certificato.passphrase,
      }
    )
    return interpretaRispostaInvio(risposta.body)
  } catch (err) {
    const { categoria, messaggio } = categorizzaErroreConnessione(err)
    return { ok: false, categoria, messaggio, dettaglioTecnico: err instanceof Error ? err.message : String(err) }
  }
}

// Controllo stato via REST (InteropRService/selezionaStato/{iut}) — a
// differenza del recupero esito completo (SOAP, InteropService.recuperaEsito,
// struttura non ancora confermata su un caso reale), questo endpoint è
// documentato in modo inequivocabile nel manuale ADM (esempio curl incluso):
// GET .../selezionaStato/{iut} → corpo risposta = solo il codice numerico di
// stato. Più semplice e meno rischioso da implementare per primo; il
// recupero della busta ESITO completa (per generare il nostro PDF/protocollo)
// resta un incremento successivo.
export async function controllaStatoSoap({
  ambiente,
  iut,
}: {
  ambiente: Ambiente
  iut: string
}): Promise<EsitoControlloStato> {
  const config = CONFIGURAZIONE_AMBIENTE[ambiente]

  const certificato = await caricaCertificatoPerAmbiente(ambiente)
  if ("errore" in certificato) {
    return { ok: false, categoria: "certificato", messaggio: certificato.errore }
  }

  return new Promise((resolve) => {
    const target = new URL(`${config.controlloStato}/${encodeURIComponent(iut)}`)
    const agent = new https.Agent({
      pfx: certificato.pfx,
      passphrase: certificato.passphrase,
    })
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: "GET",
        agent,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => resolve(interpretaCodiceStato(body)))
      }
    )
    req.on("error", (err) => {
      const { categoria, messaggio } = categorizzaErroreConnessione(err)
      resolve({ ok: false, categoria, messaggio, dettaglioTecnico: err instanceof Error ? err.message : String(err) })
    })
    req.end()
  })
}

// Recupero esito completo (SOAP, InteropService.recuperaEsito) — a
// differenza del controllo stato REST (bare codice), restituisce il
// documento ESITO firmato da ADM con il numero di registrazione e i
// dettagli dei controlli sostanziali (vedi soap-envelope.ts per la
// struttura, verificata sul WSDL reale + un esempio scaricato da MONET).
export async function recuperaEsitoSoap({
  ambiente,
  iut,
}: {
  ambiente: Ambiente
  iut: string
}): Promise<EsitoRecuperoEsito> {
  const config = CONFIGURAZIONE_AMBIENTE[ambiente]

  const certificato = await caricaCertificatoPerAmbiente(ambiente)
  if ("errore" in certificato) {
    return { ok: false, categoria: "certificato", messaggio: certificato.errore }
  }

  const busta = costruisciBustaRecuperaEsito(iut)

  try {
    const risposta = await eseguiPost(
      config.recuperoEsito,
      busta,
      {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `""`,
      },
      {
        pfx: certificato.pfx,
        passphrase: certificato.passphrase,
      }
    )
    return interpretaRispostaRecuperaEsito(risposta.body)
  } catch (err) {
    const { categoria, messaggio } = categorizzaErroreConnessione(err)
    return { ok: false, categoria, messaggio, dettaglioTecnico: err instanceof Error ? err.message : String(err) }
  }
}
