import { z } from "zod"

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

export const impiantoSchema = z.object({
  cliente_id: z.string().uuid("Cliente obbligatorio"),
  nome_impianto: z.string().trim().min(1, "Campo obbligatorio").max(255),
  tipo_soggetto: z.enum(["con_licenza", "con_autorizzazione"]),
  tipologia: z.enum(["fotovoltaico", "eolico"]),
  diritto_licenza_dovuto: z.boolean(),
  diritto_licenza_importo: optionalNumeric,
  ha_registro_letture: z.boolean(),
  indirizzo_impianto: optionalText(500),
  potenza_kw: optionalNumeric,
  codice_distributore_zona: optionalText(64),
  codice_catastale_comune: optionalText(16),
  ufficio_amministrativo: optionalText(255),
  codice_impianto_f24: optionalText(64),
  note: optionalText(2000),
})

export type ImpiantoInput = z.infer<typeof impiantoSchema>
