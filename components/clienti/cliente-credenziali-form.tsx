"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CopyIcon, EyeOffIcon } from "lucide-react"
import {
  setCredenzialeCliente,
  getCredenzialeCliente,
} from "@/lib/actions/clienti-credenziali"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

async function copiaTesto(testo: string, etichetta: string) {
  await navigator.clipboard.writeText(testo)
  toast.success(`${etichetta} copiata negli appunti`)
}

// Recupero on-demand: le credenziali in chiaro non arrivano mai con la
// pagina, solo quando l'operatore clicca esplicitamente "Mostra" per
// copiarle e incollarle nel portale E-distribuzione/GSE.
function CredenzialiRivelate({
  clienteId,
  campo,
}: {
  clienteId: string
  campo: "edistribuzione" | "gse"
}) {
  const [pending, startTransition] = useTransition()
  const [rivelate, setRivelate] = useState<{
    username: string | null
    password: string | null
  } | null>(null)

  function handleMostra() {
    startTransition(async () => {
      const result = await getCredenzialeCliente(clienteId, campo)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setRivelate(result)
    })
  }

  if (!rivelate) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleMostra}
        disabled={pending}
      >
        {pending ? "Recupero…" : "Mostra credenziali salvate"}
      </Button>
    )
  }

  return (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>
          Utente: <strong>{rivelate.username}</strong>
        </span>
        {rivelate.username && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => copiaTesto(rivelate.username!, "Utente")}
          >
            <CopyIcon />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          Password: <strong>{rivelate.password}</strong>
        </span>
        {rivelate.password && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => copiaTesto(rivelate.password!, "Password")}
          >
            <CopyIcon />
          </Button>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setRivelate(null)}
      >
        <EyeOffIcon /> Nascondi
      </Button>
    </div>
  )
}

// Form separato dall'anagrafica principale: le password non transitano mai
// per updateCliente(). Ogni submit passa da setCredenzialeCliente, che scrive
// la password in Supabase Vault tramite RPC service-role.
function CredenzialeCard({
  clienteId,
  campo,
  titolo,
  username,
}: {
  clienteId: string
  campo: "edistribuzione" | "gse"
  titolo: string
  username: string | null
}) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    formData.set("campo", campo)
    startTransition(async () => {
      const result = await setCredenzialeCliente(clienteId, formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Credenziali aggiornate")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titolo}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {username && (
          <CredenzialiRivelate clienteId={clienteId} campo={campo} />
        )}
        <form action={handleSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${campo}-username`}>Utente</Label>
            <Input
              id={`${campo}-username`}
              name="username"
              defaultValue={username ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${campo}-password`}>Password</Label>
            <Input
              id={`${campo}-password`}
              name="password"
              type="password"
              placeholder={username ? "••••••••" : ""}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Cifrata in Supabase Vault. Obbligatoria ad ogni salvataggio
              (utente e password vengono sempre aggiornati insieme).
            </p>
          </div>
          <Button type="submit" disabled={pending} size="sm" className="w-fit">
            {pending ? "Salvataggio…" : "Salva credenziali"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function ClienteCredenzialiForm({
  clienteId,
  edistribuzioneUser,
  gseUser,
}: {
  clienteId: string
  edistribuzioneUser: string | null
  gseUser: string | null
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CredenzialeCard
        clienteId={clienteId}
        campo="edistribuzione"
        titolo="Credenziali E-distribuzione"
        username={edistribuzioneUser}
      />
      <CredenzialeCard
        clienteId={clienteId}
        campo="gse"
        titolo="Credenziali GSE"
        username={gseUser}
      />
    </div>
  )
}
