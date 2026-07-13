import { z } from "zod"

const indirizzoEstrattoSchema = z
  .object({
    via: z.string().nullable().optional(),
    cap: z.string().nullable().optional(),
    citta: z.string().nullable().optional(),
    provincia: z.string().nullable().optional(),
  })
  .nullable()
  .optional()

// Forma del JSON atteso dal modello vision: tutti i campi nullable/opzionali
// perché l'estrazione da un documento scansionato non è mai certa al 100% —
// la UI di revisione mostra "non rilevato" e lascia correggere a mano.
export const licenzaEstrattaSchema = z.object({
  ragioneSociale: z.string().nullable().optional(),
  codiceFiscaleDitta: z.string().nullable().optional(),
  partitaIvaDitta: z.string().nullable().optional(),
  codiceLicenza: z.string().nullable().optional(),
  referenteNome: z.string().nullable().optional(),
  referenteCognome: z.string().nullable().optional(),
  referenteCodiceFiscale: z.string().nullable().optional(),
  indirizzoDitta: indirizzoEstrattoSchema,
  indirizzoImpianto: indirizzoEstrattoSchema,
  codiceImpiantoF24: z.string().nullable().optional(),
  dirittoLicenzaImporto: z.number().nullable().optional(),
  protocollo: z.string().nullable().optional(),
  dataRilascio: z.string().nullable().optional(),
  ufficioDogane: z.string().nullable().optional(),
})

export type LicenzaEstratta = z.infer<typeof licenzaEstrattaSchema>

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""))

const optionalNumeric = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || !Number.isNaN(Number(value)), {
    message: "Deve essere un numero",
  })

// Stessi nomi/vincoli snelli di cliente.schema.ts/impianto.schema.ts
// (nessuna regex nuova per CAP/provincia, non esistono altrove nel
// progetto). Esportati separati così il form di revisione può usarli
// ciascuno con il proprio react-hook-form invece di un unico form
// combinato con validazione condizionale.
export const clienteOnboardingSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Campo obbligatorio").max(255),
  codice_fiscale: optionalText(32),
  partita_iva: optionalText(32),
  codice_licenza: optionalText(64),
  referente_nome: optionalText(255),
  referente_cognome: optionalText(255),
  referente_codice_fiscale: optionalText(16),
  indirizzo_via: optionalText(255),
  indirizzo_cap: optionalText(10),
  indirizzo_citta: optionalText(128),
  indirizzo_provincia: optionalText(4),
})

export type ClienteOnboardingInput = z.infer<typeof clienteOnboardingSchema>

export const impiantoOnboardingSchema = z.object({
  nome_impianto: z.string().trim().min(1, "Campo obbligatorio").max(255),
  tipo_soggetto: z.enum(["con_licenza", "con_autorizzazione"]),
  tipologia: z.enum(["fotovoltaico", "eolico"]),
  diritto_licenza_dovuto: z.boolean(),
  diritto_licenza_importo: optionalNumeric,
  indirizzo_via: optionalText(255),
  indirizzo_cap: optionalText(10),
  indirizzo_citta: optionalText(128),
  indirizzo_provincia: optionalText(4),
  codice_impianto_f24: optionalText(64),
  protocollo: optionalText(64),
  data_rilascio: optionalText(32),
  ufficio_dogane: optionalText(255),
})

export type ImpiantoOnboardingInput = z.infer<typeof impiantoOnboardingSchema>

// Payload completo inviato a confermaOnboardingLicenza.
export const confermaOnboardingSchema = z
  .object({
    clienteEsistenteId: z.string().uuid().optional().or(z.literal("")),
    cliente: clienteOnboardingSchema.optional(),
    impianto: impiantoOnboardingSchema,
  })
  // Serve o un cliente esistente da riusare, o i dati per crearne uno nuovo
  // — mai nessuno dei due (il form deve sempre esprimere una scelta esplicita).
  .refine((data) => Boolean(data.clienteEsistenteId) || Boolean(data.cliente), {
    message: "Seleziona un cliente esistente oppure compila i dati del nuovo cliente",
    path: ["cliente"],
  })

export type ConfermaOnboardingInput = z.infer<typeof confermaOnboardingSchema>
