import { generaDichiarazioneEeSemestraleXml } from "./dichiarazione-ee-semestrale"
import type { DichiarazioneEeSemestraleInput } from "../validation/dichiarazione-ee.schema"

// Genera un XML di dichiarazione con dati interamente fittizi (nessun dato
// reale, nessun accesso al DB) — serve solo per verificare l'intera catena
// di invio S2S (firma esterna Aruba, client SOAP, esito ADM) prima di
// collegarla alla dichiarazione reale. Riusa lo stesso generatore di
// produzione (lib/xml/dichiarazione-ee-semestrale.ts): valida così anche
// che il generatore stesso sia compatibile con ADM, non solo con lo schema.
function progressione(valoriMensili: number[]): { lettP: number; lettA: number }[] {
  let cursore = 0
  return valoriMensili.map((kwh) => {
    const lettP = cursore
    cursore += kwh
    return { lettP, lettA: cursore }
  })
}

export function generaXmlDichiarazioneTestFittizia({
  anno = new Date().getFullYear(),
  periodoRiferimento = 1,
}: {
  anno?: number
  periodoRiferimento?: 1 | 2
} = {}): string {
  const meseIniziale = periodoRiferimento === 1 ? 1 : 7
  const kwhProduzione = [10, 20, 30, 40, 50, 60]
  const kwhCessione = [4, 8, 12, 16, 20, 24]
  const progressioneProduzione = progressione(kwhProduzione)
  const progressioneCessione = progressione(kwhCessione)

  const input: DichiarazioneEeSemestraleInput = {
    codDitta: "TST00001T", // codice ditta palesemente fittizio (formato valido, mai reale)
    codAtt: 1,
    anno,
    periodoRiferimento,
    quadroA: kwhProduzione.map((kwh, i) => ({
      numMese: meseIniziale + i,
      contatori: [
        {
          matricola: "TESTPROD01",
          lettP: progressioneProduzione[i].lettP,
          lettA: progressioneProduzione[i].lettA,
          diffLett: kwh,
          costLett: 1,
          kwh,
        },
      ],
    })),
    quadroC: kwhProduzione.map((kwh, i) => ({
      numMese: meseIniziale + i,
      kwh: kwh - kwhCessione[i], // autoconsumo = produzione − cessione alla rete
    })),
    quadroG: kwhCessione.map((kwh, i) => ({
      numMese: meseIniziale + i,
      contatori: [
        {
          tipo: "B",
          id: "TESTDISTRIBUTORE01",
          matricola: "TESTIMM01",
          lettP: progressioneCessione[i].lettP,
          lettA: progressioneCessione[i].lettA,
          diffLett: kwh,
          costLett: 1,
          kwh,
        },
      ],
    })),
  }

  return generaDichiarazioneEeSemestraleXml(input)
}
