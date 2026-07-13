import { z } from "zod"

export const f24RigaSchema = z.object({
  impiantoId: z.string().uuid(),
  importo: z.number().positive("L'importo deve essere maggiore di zero"),
})

export const f24GenerazioneSchema = z.object({
  clienteId: z.string().uuid(),
  annoRiferimento: z.number().int().min(2000).max(2100),
  dataScadenza: z.string().min(1, "Campo obbligatorio"), // YYYY-MM-DD
  righe: z.array(f24RigaSchema).min(1, "Seleziona almeno un impianto"),
})

export type F24GenerazioneInput = z.infer<typeof f24GenerazioneSchema>
