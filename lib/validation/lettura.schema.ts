import { z } from "zod"

const numeroOpzionale = z
  .union([z.number(), z.null()])
  .refine((value) => value === null || Number.isFinite(value), {
    message: "Deve essere un numero",
  })

export const letturaCellaSchema = z.object({
  contatore_id: z.string().uuid(),
  periodo_mese: z.number().int().min(1).max(12),
  periodo_anno: z.number().int().min(2000).max(2100),
  valore_f1: numeroOpzionale,
  valore_f2: numeroOpzionale,
  valore_f3: numeroOpzionale,
})

export type LetturaCellaInput = z.infer<typeof letturaCellaSchema>

export const upsertLettureSchema = z.array(letturaCellaSchema).max(200)
