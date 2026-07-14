"use server"

import { createClient } from "@/lib/supabase/server"

export type CaricaDocumentoResult =
  | { error: string }
  | { documentoId: string; storagePath: string }

const TIPI_CONSENTITI = ["application/pdf", "text/plain"]
const DIMENSIONE_MASSIMA_BYTES = 10 * 1024 * 1024 // 10MB

// Carica un file su Storage (bucket privato 'documenti', RLS solo
// authenticated — vedi 20260714090005_documenti.sql) e crea la riga di
// metadati corrispondente. Il documento viene archiviato subito al
// caricamento, indipendentemente da cosa viene poi importato nelle letture
// (traccia d'archivio sempre presente, brief §5.4).
//
// 'dichiarazione'/'protocollo': il PDF e il file txt che ADM restituisce dopo
// il caricamento manuale di una dichiarazione sul portale — il protocollo è
// sempre un .txt, per questo text/plain è ammesso oltre al PDF.
export async function caricaDocumento(
  impiantoId: string,
  tipo: "pdf_letture" | "screenshot_letture" | "dichiarazione" | "protocollo" | "altro",
  file: File
): Promise<CaricaDocumentoResult> {
  if (!TIPI_CONSENTITI.includes(file.type)) {
    return { error: "Formato file non supportato: solo PDF o TXT." }
  }
  if (file.size > DIMENSIONE_MASSIMA_BYTES) {
    return { error: "File troppo grande (max 10MB)." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const percorso = `impianti/${impiantoId}/${tipo}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from("documenti")
    .upload(percorso, file, { contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data, error: insertError } = await supabase
    .from("documenti")
    .insert({
      tipo,
      storage_path: percorso,
      nome_file: file.name,
      mime_type: file.type,
      dimensione_bytes: file.size,
      impianto_id: impiantoId,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (insertError) {
    // Il file resta su Storage ma senza riga di metadati collegata: non è
    // orfano dal punto di vista dei costi/spazio, ma non sarà referenziabile.
    // Accettabile per un fallimento raro; da ripulire manualmente se capita.
    return { error: insertError.message }
  }

  return { documentoId: data.id, storagePath: percorso }
}

export type ScaricaDocumentoResult =
  | { error: string }
  | { base64: string; nomeFile: string; mimeType: string }

// Download generico per qualunque riga di `documenti` (licenze, PDF letture,
// screenshot, ecc.) — stesso meccanismo già usato per l'F24
// (lib/actions/f24.ts, scaricaF24), qui riutilizzabile per ogni tipo.
export async function scaricaDocumento(documentoId: string): Promise<ScaricaDocumentoResult> {
  const supabase = await createClient()
  const { data: documento, error } = await supabase
    .from("documenti")
    .select("storage_path, nome_file, mime_type")
    .eq("id", documentoId)
    .single()

  if (error || !documento) return { error: error?.message ?? "Documento non trovato" }

  const { data: file, error: downloadError } = await supabase.storage
    .from("documenti")
    .download(documento.storage_path)
  if (downloadError || !file) {
    return { error: downloadError?.message ?? "Impossibile scaricare il file" }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    base64: buffer.toString("base64"),
    nomeFile: documento.nome_file,
    mimeType: documento.mime_type || "application/octet-stream",
  }
}
