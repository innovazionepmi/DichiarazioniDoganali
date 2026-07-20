import "server-only"
import {
  screenshotLettureEstratteSchema,
  type ScreenshotLettureEstratte,
} from "@/lib/validation/screenshot-letture.schema"

// Wrapper diretto sull'API Messages di Anthropic, stesso pattern di
// lib/ai/estrai-licenza.ts (nessuna dipendenza SDK aggiuntiva) — richiesta
// esplicita dell'utente: oltre al PDF "stampa pagina" di E-distribuzione
// (parsing regex deterministico, lib/parsers/edistribuzione-pdf.ts), Paolo
// deve poter caricare uno screenshot (es. dal telefono, dal portale senza
// passare dalla stampa PDF) — un'immagine non ha testo estraibile, serve
// un modello vision.

export { isVisionConfigured } from "@/lib/ai/estrai-licenza"

const MODELLO_DEFAULT = "claude-sonnet-5"

const PROMPT = `Questo è uno screenshot (foto o cattura di schermo) di una pagina del portale E-distribuzione, o di un documento simile, con le letture mensili di un contatore di energia elettrica italiano.

Estrai i dati ESATTAMENTE come mostrati nell'immagine (non correggere, non inventare, non normalizzare) e rispondi SOLO con un oggetto JSON valido, senza markdown e senza testo aggiuntivo, con questa struttura:

{
  "pod": string | null,
  "matricola": string | null,
  "costanteK": number | null,
  "letture": [
    { "mese": number (1-12), "anno": number, "f1": number, "f2": number, "f3": number }
  ]
}

Estrai SOLO i valori di energia "immessa" in rete (espressi in kWh, fasce F1/F2/F3) — se nello screenshot compaiono anche valori "prelevata", ignorali. Se il POD, la matricola o la costante K non sono visibili nello screenshot, usa null per quei campi (non inventarli). Se non trovi valori mensili chiaramente identificabili, ritorna "letture": [].`

function estraiJson(testo: string): unknown {
  const pulito = testo
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  return JSON.parse(pulito)
}

export type EstraiLettureScreenshotResult = { data: ScreenshotLettureEstratte } | { error: string }

export async function estraiLettureDaScreenshot(
  base64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp"
): Promise<EstraiLettureScreenshotResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error:
        "Estrazione automatica non configurata: imposta ANTHROPIC_API_KEY nelle variabili d'ambiente di Vercel.",
    }
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
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
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
    return { error: "Non sono riuscito a leggere lo screenshot: risposta non in formato JSON valido." }
  }

  const parsed = screenshotLettureEstratteSchema.safeParse(grezzo)
  if (!parsed.success) {
    return { error: "Non sono riuscito a leggere correttamente i dati dallo screenshot." }
  }

  return { data: parsed.data }
}
