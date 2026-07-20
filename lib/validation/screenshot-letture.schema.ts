import { z } from "zod"

// Forma dell'output atteso dal modello vision per uno screenshot di letture
// (es. portale E-distribuzione) — stessa filosofia di licenza.schema.ts:
// campi nullable perché l'estrazione da un'immagine non è mai certa al 100%,
// la UI di revisione (stesso diff di importa-pdf-dialog.tsx) lascia
// confermare/correggere riga per riga prima di scrivere su `letture`.

export const letturaMensileEstrattaSchema = z.object({
  mese: z.number().int().min(1).max(12),
  anno: z.number().int().min(2000),
  f1: z.number().nullable(),
  f2: z.number().nullable(),
  f3: z.number().nullable(),
})

export const screenshotLettureEstratteSchema = z.object({
  pod: z.string().nullable(),
  matricola: z.string().nullable(),
  costanteK: z.number().nullable(),
  letture: z.array(letturaMensileEstrattaSchema),
})

export type ScreenshotLettureEstratte = z.infer<typeof screenshotLettureEstratteSchema>
