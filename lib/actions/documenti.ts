"use server"

import { createClient } from "@/lib/supabase/server"

export type CaricaDocumentoResult =
  | { error: string }
  | { documentoId: string; storagePath: string }

const TIPI_CONSENTITI = ["application/pdf"]
const DIMENSIONE_MASSIMA_BYTES = 10 * 1024 * 1024 // 10MB

// Carica un file su Storage (bucket privato 'documenti', RLS solo
// authenticated — vedi 20260714090005_documenti.sql) e crea la riga di
// metadati corrispondente. Il documento viene archiviato subito al
// caricamento, indipendentemente da cosa viene poi importato nelle letture
// (traccia d'archivio sempre presente, brief §5.4).
export async function caricaDocumento(
  impiantoId: string,
  tipo: "pdf_letture" | "screenshot_letture" | "altro",
  file: File
): Promise<CaricaDocumentoResult> {
  if (!TIPI_CONSENTITI.includes(file.type)) {
    return { error: "Formato file non supportato: solo PDF." }
  }
  if (file.size > DIMENSIONE_MASSIMA_BYTES) {
    return { error: "File troppo grande (max 10MB)." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non autenticato" }

  const percorso = `impianti/${impiantoId}/letture/${Date.now()}-${file.name}`
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
