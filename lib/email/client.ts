import "server-only"
import nodemailer from "nodemailer"

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

export interface InviaEmailInput {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

// Lancia un errore chiaro se le credenziali SMTP non sono ancora configurate
// su Vercel, invece di un crash generico: così generazione/download restano
// utilizzabili anche prima che l'invio email sia attivo (brief: nessuna
// automazione con impatto esterno senza conferma umana esplicita).
export async function inviaEmail(input: InviaEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      "Servizio email non configurato: imposta SMTP_HOST, SMTP_USER, SMTP_PASSWORD (e opzionalmente SMTP_PORT, EMAIL_FROM) nelle variabili d'ambiente di Vercel."
    )
  }

  const transport = createTransport()
  await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  })
}
