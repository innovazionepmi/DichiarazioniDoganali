"use server"

import { createClient } from "@/lib/supabase/server"
import { generaXmlDichiarazioneTestFittizia } from "@/lib/xml/dichiarazione-test-fittizia"
import { inviaDichiarazioneSoap, controllaStatoSoap, type EsitoInvioAdm, type EsitoControlloStato } from "@/lib/adm/soap-client"

// Sandbox di test per validare l'intera catena di invio S2S ADM (firma
// esterna Aruba, client SOAP, esito) con dati palesemente fittizi — nessun
// impianto/cliente reale coinvolto, nessuna scrittura su
// `dichiarazioni_ee_semestrali`. Vedi piano Fase 4 (invio S2S) e memoria
// project-xml-dogane-ricerca / project-gestione-errori-invio-adm.

async function richiedeUtenteAutenticato(): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? null : { error: "Non autenticato" }
}

export type GeneraXmlTestResult = { error: string } | { xmlBase64: string; nomeFile: string }

export async function generaXmlTestAdm(
  periodoRiferimento: 1 | 2
): Promise<GeneraXmlTestResult> {
  const authError = await richiedeUtenteAutenticato()
  if (authError) return authError

  const xml = generaXmlDichiarazioneTestFittizia({ periodoRiferimento })
  const anno = new Date().getFullYear()
  return {
    xmlBase64: Buffer.from(xml, "utf-8").toString("base64"),
    nomeFile: `TEST_EE_Semestrale_${anno}_S${periodoRiferimento}.xml`,
  }
}

export async function inviaXmlTestAdm(formData: FormData): Promise<EsitoInvioAdm | { error: string }> {
  const authError = await richiedeUtenteAutenticato()
  if (authError) return authError

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nessun file selezionato" }
  }

  const dichiarante = String(formData.get("dichiarante") ?? "").trim()
  if (!dichiarante) {
    return { error: "Inserisci il codice fiscale del sottoscrittore" }
  }

  const xmlFirmato = Buffer.from(await file.arrayBuffer())
  return inviaDichiarazioneSoap({ ambiente: "test", xmlFirmato, dichiarante })
}

export async function controllaStatoTestAdm(iut: string): Promise<EsitoControlloStato | { error: string }> {
  const authError = await richiedeUtenteAutenticato()
  if (authError) return authError

  if (!iut.trim()) return { error: "IUT mancante" }
  return controllaStatoSoap({ ambiente: "test", iut: iut.trim() })
}
