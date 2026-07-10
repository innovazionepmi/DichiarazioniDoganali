"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArchiveButton } from "@/components/shared/archive-button"
import { ContatoreForm } from "@/components/impianti/contatore-form"
import {
  archiviaContatore,
  createContatore,
  updateContatore,
} from "@/lib/actions/contatori"
import type { ContatoreInput } from "@/lib/validation/contatore.schema"

export type ContatoreRow = {
  id: string
  matricola: string
  pod: string
  tipo: "produzione" | "immissione"
  costante_k: number | null
  data_attivazione: string
  data_cessazione: string | null
  modello: string | null
  attivo: boolean
}

export function ContatoriList({
  impiantoId,
  contatori,
}: {
  impiantoId: string
  contatori: ContatoreRow[]
}) {
  const [nuovoOpen, setNuovoOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const editing = contatori.find((c) => c.id === editId) ?? null

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contatori</h2>
        <Button size="sm" onClick={() => setNuovoOpen(true)}>
          Nuovo contatore
        </Button>
      </div>

      {contatori.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POD</TableHead>
                <TableHead>Matricola</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>K</TableHead>
                <TableHead>Attivazione</TableHead>
                <TableHead>Cessazione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatori.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.pod}</TableCell>
                  <TableCell>{c.matricola}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {c.tipo === "produzione" ? "Produzione" : "Immissione"}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.costante_k ?? "—"}</TableCell>
                  <TableCell>{c.data_attivazione}</TableCell>
                  <TableCell>{c.data_cessazione ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.attivo ? "default" : "secondary"}>
                      {c.attivo ? "Attivo" : "Archiviato"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditId(c.id)}
                    >
                      Modifica
                    </Button>
                    <ArchiveButton
                      attivo={c.attivo}
                      onToggle={(next) =>
                        archiviaContatore(impiantoId, c.id, next)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun contatore registrato per questo impianto.
        </p>
      )}

      <Dialog open={nuovoOpen} onOpenChange={setNuovoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo contatore</DialogTitle>
          </DialogHeader>
          <ContatoreForm
            onSubmit={(formData) => createContatore(impiantoId, formData)}
            onSuccess={() => setNuovoOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica contatore</DialogTitle>
          </DialogHeader>
          {editing && (
            <ContatoreForm
              defaultValues={toFormValues(editing)}
              onSubmit={(formData) =>
                updateContatore(impiantoId, editing.id, formData)
              }
              onSuccess={() => setEditId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function toFormValues(c: ContatoreRow): Partial<ContatoreInput> {
  return {
    matricola: c.matricola,
    pod: c.pod,
    tipo: c.tipo,
    costante_k: c.costante_k?.toString() ?? "",
    data_attivazione: c.data_attivazione,
    data_cessazione: c.data_cessazione ?? "",
    modello: c.modello ?? "",
  }
}
