import { z } from "zod"

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""))

export const contatoreSchema = z.object({
  matricola: z.string().trim().min(1, "Campo obbligatorio").max(64),
  pod: z.string().trim().min(1, "Campo obbligatorio").max(32),
  tipo: z.enum(["produzione", "immissione"]),
  costante_k: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || !Number.isNaN(Number(value)), {
      message: "Deve essere un numero",
    }),
  data_attivazione: z.string().trim().min(1, "Campo obbligatorio"),
  data_cessazione: optionalText(10),
  modello: optionalText(128),
  note: optionalText(2000),
})

export type ContatoreInput = z.infer<typeof contatoreSchema>
