import "server-only"
import { licenzaEstrattaSchema, type LicenzaEstratta } from "@/lib/validation/licenza.schema"
import type { PaginaRasterizzata } from "@/lib/pdf/rasterizza-pagine"

// Wrapper diretto sull'API Messages di Anthropic (nessuna dipendenza SDK
// aggiuntiva, stesso principio di leggerezza di lib/email/client.ts):
// le licenze ADM sono spesso scansioni, senza layer di testo (verificato su
// un documento reale), quindi l'estrazione richiede un modello vision
// invece del parsing regex già usato per i PDF E-distribuzione.

export function isVisionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

const MODELLO_DEFAULT = "claude-sonnet-5"

const PROMPT = `Questo documento è una "LICENZA" (o la lettera di accompagnamento) rilasciata dall'Agenzia delle Dogane e dei Monopoli (ADM) italiana per l'esercizio di un'officina di produzione di energia elettrica. Può essere composto da più pagine (lettera di accompagnamento + certificato): i dati richiesti possono trovarsi su pagine diverse, considerale tutte insieme.

Estrai i seguenti dati ESATTAMENTE come scritti nel documento (non correggere, non inventare, non normalizzare maiuscole/minuscole) e rispondi SOLO con un oggetto JSON valido, senza markdown e senza testo aggiuntivo, con questa struttura:

{
  "ragioneSociale": string | null,
  "codiceFiscaleDitta": string | null,
  "partitaIvaDitta": string | null,
  "codiceLicenza": string | null,
  "referenteNome": string | null,
  "referenteCognome": string | null,
  "referenteCodiceFiscale": string | null,
  "indirizzoDitta": { "via": string, "cap": string, "citta": string, "provincia": string } | null,
  "indirizzoImpianto": { "via": string, "cap": string, "citta": string, "provincia": string } | null,
  "codiceImpiantoF24": string | null,
  "dirittoLicenzaImporto": number | null,
  "protocollo": string | null,
  "dataRilascio": string | null,
  "ufficioDogane": string | null
}

Se un campo non è presente nel documento, usa null. Il "codice fiscale ditta" e la "partita iva ditta" spesso coincidono nello stesso numero per le società: se il documento riporta "P.I./C.F. NNNNNNNNNNN" usa lo stesso valore per entrambi i campi. "codiceLicenza" e "codiceImpiantoF24" sono spesso lo stesso "Codice Ditta" attribuito nel documento (formato tipico: due lettere paese, due cifre, tre lettere provincia/ufficio, cinque cifre, una lettera di controllo — es. "IT12ABC34567Z").`

function estraiJson(testo: string): unknown {
  const pulito = testo
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  return JSON.parse(pulito)
}

export type EstraiLicenzaResult = { data: LicenzaEstratta } | { error: string }

export async function estraiDatiLicenza(
  pagine: PaginaRasterizzata[]
): Promise<EstraiLicenzaResult> {
  if (!isVisionConfigured()) {
    return {
      error:
        "Estrazione automatica non configurata: imposta ANTHROPIC_API_KEY nelle variabili d'ambiente di Vercel.",
    }
  }
  if (pagine.length === 0) {
    return { error: "Nessuna pagina da analizzare." }
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || MODELLO_DEFAULT,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            ...pagine.map((p) => ({
              type: "image",
              source: { type: "base64", media_type: p.mediaType, data: p.base64 },
            })),
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    return { error: `Errore nella chiamata al servizio di estrazione (${response.status}).` }
  }

  const json = await response.json()
  const testo: string | undefined = json?.content?.[0]?.text
  if (!testo) {
    return { error: "Risposta del servizio di estrazione vuota o inattesa." }
  }

  let grezzo: unknown
  try {
    grezzo = estraiJson(testo)
  } catch {
    return { error: "Non sono riuscito a leggere il documento: risposta non in formato JSON valido." }
  }

  const parsed = licenzaEstrattaSchema.safeParse(grezzo)
  if (!parsed.success) {
    return { error: "Non sono riuscito a leggere correttamente i dati del documento." }
  }

  return { data: parsed.data }
}
