import { z } from "zod";

const numeroOpzionale = z
  .union([z.number(), z.null()])
  .refine((value) => value === null || Number.isFinite(value), {
    message: "Deve essere un numero",
  });

export const letturaCellaSchema = z.object({
  contatore_id: z.string().uuid(),
  periodo_mese: z.number().int().min(1).max(12),
  periodo_anno: z.number().int().min(2000).max(2100),
  valore_f1: numeroOpzionale,
  valore_f2: numeroOpzionale,
  valore_f3: numeroOpzionale,
});

export type LetturaCellaInput = z.infer<typeof letturaCellaSchema>;

// 200 bastava per un salvataggio manuale (12 mesi × pochi contatori), ma
// l'import da Excel (lib/actions/letture.ts, analizzaExcelLetture) può
// portare anni di storico in un colpo solo — es. 10 anni × 12 mesi × 2
// contatori (produzione+immissione) = ~230 righe, osservato su un caso
// reale. Alzato con margine.
export const upsertLettureSchema = z.array(letturaCellaSchema).max(1000);
