import { z } from "zod"

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""))

export const clienteSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Campo obbligatorio").max(255),
  codice_fiscale: optionalText(32),
  partita_iva: optionalText(32),
  codice_licenza: optionalText(64),
  referente_nome: optionalText(255),
  referente_cognome: optionalText(255),
  referente_telefono: optionalText(64),
  referente_email: z
    .string()
    .trim()
    .email("Email non valida")
    .max(255)
    .optional()
    .or(z.literal("")),
  referente_data_nascita: optionalText(10),
  // Dati necessari per compilare l'F24 (sezione DATI ANAGRAFICI): il
  // rappresentante legale è una persona fisica, distinta dalla ditta.
  referente_codice_fiscale: optionalText(16),
  referente_sesso: z.enum(["M", "F"]).optional().or(z.literal("")),
  referente_comune_nascita: optionalText(128),
  referente_provincia_nascita: optionalText(4),
  referente_domicilio_via: optionalText(255),
  referente_domicilio_cap: optionalText(10),
  referente_domicilio_citta: optionalText(128),
  referente_domicilio_provincia: optionalText(4),
  indirizzo_via: optionalText(255),
  indirizzo_cap: optionalText(10),
  indirizzo_citta: optionalText(128),
  indirizzo_provincia: optionalText(4),
  partner_id: z.string().uuid().optional().or(z.literal("")),
  note: optionalText(2000),
})

export type ClienteInput = z.infer<typeof clienteSchema>

export const credenzialeSchema = z.object({
  campo: z.enum(["edistribuzione", "gse"]),
  username: z.string().trim().min(1, "Campo obbligatorio").max(255),
  password: z.string().min(1, "Campo obbligatorio").max(255),
})

export type CredenzialeInput = z.infer<typeof credenzialeSchema>
