"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analizzaExcelLetture,
  analizzaPdfLetture,
  upsertLetture,
  type AnalisiPdfResult,
  type RigaDiffPdf,
} from "@/lib/actions/letture";

const MESI_LABEL = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const STATO_LABEL: Record<RigaDiffPdf["stato"], string> = {
  nuovo: "Nuovo",
  invariato: "Invariato",
  differente: "Differente",
};

type AnalisiOk = Extract<AnalisiPdfResult, { righe: RigaDiffPdf[] }>;

// Anteprima prima di scrivere (decisione esplicita dell'utente): il parsing
// non tocca mai `letture` — solo dopo che Paolo conferma riga per riga,
// tramite upsertLetture riusata con origine='pdf_stampa'. Le righe già
// corrette a mano (modificataManualmente) partono deselezionate ed
// evidenziate, per non farle sovrascrivere per sbaglio.
export function ImportaPdfDialog({
  impiantoId,
  annoSelezionato,
}: {
  impiantoId: string;
  annoSelezionato: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [analisi, setAnalisi] = useState<AnalisiOk | null>(null);
  const [selezionate, setSelezionate] = useState<Set<number>>(new Set());

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAnalisi(null);
      setSelezionate(new Set());
    }
  }

  function handleAnalizza(formData: FormData) {
    const file = formData.get("file");
    const isExcel =
      file instanceof File &&
      (file.name.toLowerCase().endsWith(".xlsx") ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    startTransition(async () => {
      const risultato = isExcel
        ? await analizzaExcelLetture(impiantoId, formData)
        : await analizzaPdfLetture(impiantoId, formData);
      if ("error" in risultato) {
        toast.error(risultato.error);
        return;
      }
      setAnalisi(risultato);
      const daSelezionare = new Set<number>();
      risultato.righe.forEach((riga, index) => {
        if (!riga.modificataManualmente) daSelezionare.add(index);
      });
      setSelezionate(daSelezionare);
    });
  }

  function toggleRiga(index: number) {
    setSelezionate((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleConferma() {
    if (!analisi) return;
    const righeSelezionate = analisi.righe
      .filter((_, index) => selezionate.has(index))
      .map((riga) => ({
        contatore_id: riga.contatoreId,
        periodo_mese: riga.periodoMese,
        periodo_anno: riga.periodoAnno,
        valore_f1: riga.pdfF1,
        valore_f2: riga.pdfF2,
        valore_f3: riga.pdfF3,
      }));

    if (righeSelezionate.length === 0) {
      toast.error("Nessuna riga selezionata");
      return;
    }

    startTransition(async () => {
      const result = await upsertLetture(impiantoId, righeSelezionate, {
        origine: analisi.origine,
        documentoSorgenteId: analisi.documentoId,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      // Il file può contenere dati per anni diversi da quello visualizzato in
      // tabella in questo momento (l'anno scritto è quello indicato nel file
      // stesso, non quello del menu a tendina — l'import Excel può portare
      // più anni in un colpo solo): portiamo l'utente sull'anno più recente
      // tra quelli importati, altrimenti l'import "sparisce" agli occhi di
      // chi sta guardando un anno diverso.
      const annoImportato = Math.max(
        ...righeSelezionate.map((r) => r.periodo_anno),
      );
      toast.success(`${righeSelezionate.length} lettura/e importata/e`);
      handleOpenChange(false);
      if (annoImportato && annoImportato !== annoSelezionato) {
        router.push(`${pathname}?anno=${annoImportato}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Importa da PDF, screenshot o Excel
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Importa letture da PDF, screenshot o Excel
            </DialogTitle>
          </DialogHeader>

          {!analisi ? (
            <form action={handleAnalizza} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="file">
                  File PDF (stampa pagina E-distribuzione), screenshot
                  (PNG/JPEG) o registro letture Excel (.xlsx)
                </Label>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  PDF ed Excel vengono letti in modo esatto; uno screenshot
                  viene letto con un&apos;intelligenza artificiale — controlla
                  sempre i valori prima di confermare. Il file Excel può essere
                  lo stesso registro letture già in uso per il cliente: viene
                  abbinato ai contatori di questo impianto per tipo
                  (produzione/immissione).
                </p>
              </div>
              <Button type="submit" disabled={pending} className="w-fit">
                {pending ? "Analisi in corso…" : "Analizza"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {analisi.pod && <>POD {analisi.pod} — </>}
                {analisi.clienteRagioneSociale && (
                  <>Cliente nel file: {analisi.clienteRagioneSociale} — </>
                )}
                contatori:{" "}
                {Array.from(
                  new Set(analisi.righe.map((r) => r.contatoreMatricola)),
                ).join(", ")}
              </p>

              {(() => {
                const anniNelPdf = Array.from(
                  new Set(analisi.righe.map((r) => r.periodoAnno)),
                ).sort();
                const annoDiverso =
                  anniNelPdf.length > 0 &&
                  (anniNelPdf.length > 1 || anniNelPdf[0] !== annoSelezionato);
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    Il file contiene dati per l&apos;anno{" "}
                    {anniNelPdf.length > 1 ? "i" : ""}{" "}
                    <strong>{anniNelPdf.join(", ")}</strong>.
                    {annoDiverso && (
                      <>
                        {" "}
                        Stai visualizzando l&apos;anno {annoSelezionato}: dopo
                        la conferma verrai spostato automaticamente
                        sull&apos;anno corretto per vedere i dati importati.
                      </>
                    )}
                  </div>
                );
              })()}

              {analisi.avvisi.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {analisi.avvisi.map((avviso) => (
                    <li key={avviso}>{avviso}</li>
                  ))}
                </ul>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead />
                      <TableHead>Contatore</TableHead>
                      <TableHead>Mese</TableHead>
                      <TableHead>
                        {analisi.origine === "excel"
                          ? "kWh dal file"
                          : "Valori dal file (F1/F2/F3)"}
                      </TableHead>
                      <TableHead>Valori attuali</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analisi.righe.map((riga, index) => (
                      <TableRow
                        key={`${riga.contatoreId}-${riga.periodoAnno}-${riga.periodoMese}`}
                        className={
                          riga.modificataManualmente
                            ? "bg-destructive/5"
                            : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            checked={selezionate.has(index)}
                            onCheckedChange={() => toggleRiga(index)}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {riga.contatoreMatricola}
                          <br />
                          {riga.contatoreTipo === "produzione"
                            ? "Produzione"
                            : "Immissione"}
                        </TableCell>
                        <TableCell>
                          {MESI_LABEL[riga.periodoMese - 1]} {riga.periodoAnno}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {analisi.origine === "excel"
                            ? riga.pdfF1.toLocaleString("it-IT")
                            : `${riga.pdfF1} / ${riga.pdfF2} / ${riga.pdfF3}`}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {riga.dbF1 === null
                            ? "—"
                            : analisi.origine === "excel"
                              ? riga.dbF1.toLocaleString("it-IT")
                              : `${riga.dbF1} / ${riga.dbF2} / ${riga.dbF3}`}
                          {riga.modificataManualmente && (
                            <Badge variant="destructive" className="ml-1">
                              corretta a mano
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              riga.stato === "nuovo"
                                ? "info"
                                : riga.stato === "differente"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {STATO_LABEL[riga.stato]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleConferma} disabled={pending}>
                  {pending
                    ? "Importazione…"
                    : `Importa selezionate (${selezionate.size})`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAnalisi(null)}
                  disabled={pending}
                >
                  Analizza un altro file
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
