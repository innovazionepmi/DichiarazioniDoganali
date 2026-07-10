"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/data-table"
import { ArchiveButton } from "@/components/shared/archive-button"
import { Badge } from "@/components/ui/badge"
import { archiviaPartner } from "@/lib/actions/partner"

type PartnerRow = {
  id: string
  ragione_sociale: string
  note: string | null
  attivo: boolean
}

const columns: ColumnDef<PartnerRow>[] = [
  {
    accessorKey: "ragione_sociale",
    header: "Ragione sociale",
    cell: ({ row }) => (
      <Link
        href={`/anagrafiche/partner/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.ragione_sociale}
      </Link>
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
        onToggle={(next) => archiviaPartner(row.original.id, next)}
      />
    ),
  },
]

export function PartnerTable({ data }: { data: PartnerRow[] }) {
  return (
    <DataTable columns={columns} data={data} filterPlaceholder="Cerca partner…" />
  )
}
