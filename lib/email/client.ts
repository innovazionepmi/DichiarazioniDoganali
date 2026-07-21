import "server-only"
import nodemailer from "nodemailer"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

// Wrapper generico via SMTP (compatibile con qualunque provider — l'utente
// userà Brevo, ma nulla qui è specifico a un fornitore). Riusato per F24 e,
// in futuro, registro letture e protocollo dichiarazione.

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  )
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
}

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
}

export interface InviaEmailContesto {
  tipo: "f24" | "ricevuta_dichiarazione" | "registro_letture_vuoto" | "altro"
  clienteId?: string
  impiantoId?: string
}

export interface InviaEmailInput {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
  // Facoltativo: se presente, la chiamata viene registrata in `email_log`
  // (esito + eventuale errore) per poter fare troubleshooting dopo il fatto
  // — prima non c'era nessuna traccia di un invio riuscito/fallito una volta
  // chiusa la sessione dell'operatore.
  contesto?: InviaEmailContesto
}

// Registra sempre l'esito (mai bloccante: se il logging stesso fallisce,
// non deve mascherare il vero risultato dell'invio email). Nota importante
// per il troubleshooting: "inviata" significa solo che il server SMTP l'ha
// accettata — non garantisce la consegna finale (bounce/spam vanno
// verificati sul pannello del provider, es. Brevo → Statistiche).
async function registraLogEmail(
  input: InviaEmailInput,
  esito: "inviata" | "errore",
  messaggioErrore?: string
) {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from("email_log").insert({
      tipo: input.contesto?.tipo ?? "altro",
      destinatario: input.to,
      oggetto: input.subject,
      allegati: input.attachments?.map((a) => a.filename).join(", ") || null,
      esito,
      messaggio_errore: messaggioErrore ?? null,
      cliente_id: input.contesto?.clienteId ?? null,
      impianto_id: input.contesto?.impiantoId ?? null,
    })
  } catch (e) {
    console.error("Impossibile registrare il log email:", e)
  }
}

// Lancia un errore chiaro se le credenziali SMTP non sono ancora configurate
// su Vercel, invece di un crash generico: così generazione/download restano
// utilizzabili anche prima che l'invio email sia attivo (brief: nessuna
// automazione con impatto esterno senza conferma umana esplicita).
export async function inviaEmail(input: InviaEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    const messaggio =
      "Servizio email non configurato: imposta SMTP_HOST, SMTP_USER, SMTP_PASSWORD (e opzionalmente SMTP_PORT, EMAIL_FROM) nelle variabili d'ambiente di Vercel."
    await registraLogEmail(input, "errore", messaggio)
    throw new Error(messaggio)
  }

  const transport = createTransport()
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    })
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore SMTP sconosciuto"
    await registraLogEmail(input, "errore", messaggio)
    throw e
  }

  await registraLogEmail(input, "inviata")
}
