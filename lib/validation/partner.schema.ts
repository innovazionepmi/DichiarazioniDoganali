import { z } from "zod"

export const partnerSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Campo obbligatorio").max(255),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
})

export type PartnerInput = z.infer<typeof partnerSchema>
