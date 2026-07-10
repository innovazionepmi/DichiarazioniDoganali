"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/data-table"
import { ArchiveButton } from "@/components/shared/archive-button"
import { Badge } from "@/components/ui/badge"
import { archiviaCliente } from "@/lib/actions/clienti"

type ClienteRow = {
  id: string
  ragione_sociale: string
  codice_fiscale: string | null
  partita_iva: string | null
  attivo: boolean
  partner: { ragione_sociale: string } | null
}

const columns: ColumnDef<ClienteRow>[] = [
  {
    accessorKey: "ragione_sociale",
    header: "Ragione sociale",
    cell: ({ row }) => (
      <Link
        href={`/anagrafiche/clienti/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.ragione_sociale}
      </Link>
    ),
  },
  {
    id: "cf_piva",
    header: "CF / P.IVA",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {[row.original.codice_fiscale, row.original.partita_iva]
          .filter(Boolean)
          .join(" · ") || "—"}
      </span>
    ),
  },
  {
    id: "partner",
    header: "Ditta committente",
    cell: ({ row }) =>
      row.original.partner ? (
        <Badge variant="outline">{row.original.partner.ragione_sociale}</Badge>
      ) : (
        <span className="text-muted-foreground">Diretto</span>
      ),
  },
  {
    accessorKey: "attivo",
    header: "Stato",
    cell: ({ row }) => (
      <Badge variant={row.original.attivo ? "default" : "secondary"}>
        {row.original.attivo ? "Attivo" : "Archiviato"}
      </Badge>
    ),
  },
  {
    id: "azioni",
    header: "",
    cell: ({ row }) => (
      <ArchiveButton
        attivo={row.original.attivo}
        onToggle={(next) => archiviaCliente(row.original.id, next)}
      />
    ),
  },
]

export function ClienteTable({ data }: { data: ClienteRow[] }) {
  return (
    <DataTable columns={columns} data={data} filterPlaceholder="Cerca cliente…" />
  )
}
