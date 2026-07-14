import { z } from "zod"

export const certificatoAdmSchema = z.object({
  ambiente: z.enum(["test", "produzione"]),
  password: z.string().optional(),
  dataScadenza: z.string().optional(), // YYYY-MM-DD, opzionale
})

export type CertificatoAdmInput = z.infer<typeof certificatoAdmSchema>
