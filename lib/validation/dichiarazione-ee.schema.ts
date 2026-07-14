import { z } from "zod"

// Vincoli ricalcati da EE_SimpleTypes_Semestrale.xsd / EEGN_SimpleTypes_Semestrale.xsd
// (Struttura XSD dei messaggi EE, dichiarazione semestrale 2026) — validazione
// dei dati calcolati prima della serializzazione XML, al posto di un
// validatore XSD generico (le librerie XSD per Node hanno quasi tutte binding
// nativi, rischiosi su Vercel serverless — vedi bug #9 in PROJECT_STATUS.md).

const codiceDittaSchema = z
  .string()
  .regex(/^[A-Z]{3}[0-9]{5}[A-Z]$/, "Codice ditta non valido (formato atteso: AAA00000A)")

const matricolaSchema = z
  .string()
  .min(1, "Matricola mancante")
  .regex(/^[A-Za-z0-9.,\-/]{1,15}$/, "Matricola non valida (max 15 caratteri alfanumerici)")

// Id destinatario/cedente (Quadro G): codice ditta, CF, P.IVA, sigla stato
// estero, o alfanumerico generico fino a 20 caratteri (codIdGenericoStatoEsteroType).
const idDestinatarioSchema = z
  .string()
  .min(1, "Codice identificativo del distributore mancante")
  .regex(
    /^([A-Z]{3}[0-9]{5}[A-Z]|[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]|[0-9]{11}|[A-Z]{2}|[A-Za-z0-9._\-/]{1,20})$/,
    "Codice identificativo del distributore non valido"
  )

// letturaType: fino a 8 cifre intere, fino a 4 decimali.
const letturaSchema = z.number().min(0).max(99999999.9999)
// decimal7_4Type (costante K): 7 cifre intere, 4 decimali, positiva.
const costLettSchema = z.number().positive("La costante K deve essere maggiore di zero")
// nonNegativeInteger13Type (kWh): intero non negativo nell'XML — qui accettiamo
// anche decimali (es. somma F1+F2+F3 di `letture`) perché l'arrotondamento
// all'intero avviene in fase di serializzazione (lib/xml/dichiarazione-ee-semestrale.ts),
// non qui: un solo punto responsabile della regola, evita disallineamenti.
const kwhSchema = z.number().min(0).max(9999999999999)

export const contatoreRigaSchema = z.object({
  matricola: matricolaSchema,
  lettA: letturaSchema,
  lettP: letturaSchema,
  diffLett: z.number(),
  costLett: costLettSchema,
  kwh: kwhSchema,
})

const contatoreCedutaRigaSchema = contatoreRigaSchema.extend({
  tipo: z.literal("B"), // vettoriamento — unico caso coperto (immissione in rete)
  id: idDestinatarioSchema,
})

const meseQuadroASchema = z.object({
  numMese: z.number().int().min(1).max(12),
  contatori: z.array(contatoreRigaSchema).min(1),
})

const meseQuadroGSchema = z.object({
  numMese: z.number().int().min(1).max(12),
  contatori: z.array(contatoreCedutaRigaSchema).min(1),
})

export const dichiarazioneEeSemestraleSchema = z.object({
  codDitta: codiceDittaSchema,
  codAtt: z.literal(1), // officina produzione fonti rinnovabili uso proprio esente
  anno: z.number().int().min(2026),
  periodoRiferimento: z.union([z.literal(1), z.literal(2)]),
  quadroA: z.array(meseQuadroASchema).length(6, "Il Quadro A deve avere esattamente 6 mesi"),
  quadroG: z
    .array(meseQuadroGSchema)
    .length(6, "Il Quadro G deve avere esattamente 6 mesi")
    .nullable(),
})

export type DichiarazioneEeSemestraleInput = z.infer<typeof dichiarazioneEeSemestraleSchema>
