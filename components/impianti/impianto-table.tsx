"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/data-table"
import { ArchiveButton } from "@/components/shared/archive-button"
import { Badge } from "@/components/ui/badge"
import { archiviaImpianto } from "@/lib/actions/impianti"

type ImpiantoRow = {
  id: string
  nome_impianto: string
  tipo_soggetto: string
  potenza_kw: number | null
  attivo: boolean
  cliente: { ragione_sociale: string } | null
}

const columns: ColumnDef<ImpiantoRow>[] = [
  {
    accessorKey: "nome_impianto",
    header: "Impianto",
    cell: ({ row }) => (
      <Link
        href={`/anagrafiche/impianti/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.nome_impianto}
      </Link>
    ),
  },
  {
    id: "cliente",
    header: "Cliente",
    cell: ({ row }) => row.original.cliente?.ragione_sociale ?? "—",
  },
  {
    accessorKey: "tipo_soggetto",
    header: "Tipo soggetto",
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.original.tipo_soggetto === "con_licenza"
          ? "Con licenza"
          : "Con autorizzazione"}
      </Badge>
    ),
  },
  {
    accessorKey: "potenza_kw",
    header: "Potenza (kW)",
    cell: ({ row }) => row.original.potenza_kw ?? "—",
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
        onToggle={(next) => archiviaImpianto(row.original.id, next)}
      />
    ),
  },
]

export function ImpiantoTable({ data }: { data: ImpiantoRow[] }) {
  return (
    <DataTable columns={columns} data={data} filterPlaceholder="Cerca impianto…" />
  )
}
