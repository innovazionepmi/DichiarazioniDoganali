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

// Tetto prudenziale: ogni file è una chiamata di analisi separata (e un
// documento archiviato su Storage), meglio non partire con decine di file
// per sbaglio.
const MAX_FILE_PER_IMPORT = 10;

type AnalisiOk = Extract<AnalisiPdfResult, { righe: RigaDiffPdf[] }>;

type FileAnalizzato = {
  nome: string;
  origine: AnalisiOk["origine"];
  documentoId: string;
  pod: string | null;
  clienteRagioneSociale: string | null;
  avvisi: string[];
};

// Una riga del diff tiene traccia del file di provenienza (serve a scrivere
// con l'origine e il documento sorgente giusti) e se la stessa
// contatore/mese/anno compare già in un file precedente.
type RigaMulti = RigaDiffPdf & {
  fileIndex: number;
  duplicataDi: string | null;
};

type AnalisiMulti = {
  file: FileAnalizzato[];
  errori: { nome: string; errore: string }[];
  righe: RigaMulti[];
};

function chiaveRiga(riga: RigaDiffPdf): string {
  return `${riga.contatoreId}-${riga.periodoAnno}-${riga.periodoMese}`;
}

function isExcel(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

// Anteprima prima di scrivere (decisione esplicita dell'utente): il parsing
// non tocca mai `letture` — solo dopo che Paolo conferma riga per riga,
// tramite upsertLetture riusata con l'origine di ciascun file. Le righe già
// corrette a mano (modificataManualmente) partono deselezionate ed
// evidenziate, per non farle sovrascrivere per sbaglio.
//
// Più file in un colpo (es. un impianto con più contatori, un PDF ciascuno):
// ogni file viene analizzato con una chiamata separata alla stessa azione di
// prima (limite di dimensione del body per chiamata invariato) e i risultati
// vengono uniti in un'unica anteprima. Un file che fallisce non blocca gli
// altri: l'errore compare nell'anteprima accanto al suo nome.
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
  const [progresso, setProgresso] = useState<string | null>(null);
  const [analisi, setAnalisi] = useState<AnalisiMulti | null>(null);
  const [selezionate, setSelezionate] = useState<Set<number>>(new Set());

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAnalisi(null);
      setSelezionate(new Set());
      setProgresso(null);
    }
  }

  function handleAnalizza(formData: FormData) {
    const files = formData
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      toast.error("Nessun file selezionato");
      return;
    }
    if (files.length > MAX_FILE_PER_IMPORT) {
      toast.error(
        `Puoi importare al massimo ${MAX_FILE_PER_IMPORT} file alla volta`,
      );
      return;
    }

    startTransition(async () => {
      const fileOk: FileAnalizzato[] = [];
      const errori: AnalisiMulti["errori"] = [];
      const righe: RigaMulti[] = [];
      const primaOccorrenza = new Map<string, string>();

      for (const [index, file] of files.entries()) {
        setProgresso(`Analisi file ${index + 1} di ${files.length}…`);

        const singolo = new FormData();
        singolo.set("file", file);
        const risultato = isExcel(file)
          ? await analizzaExcelLetture(impiantoId, singolo)
          : await analizzaPdfLetture(impiantoId, singolo);

        if ("error" in risultato) {
          errori.push({ nome: file.name, errore: risultato.error });
          continue;
        }

        const fileIndex = fileOk.length;
        fileOk.push({
          nome: file.name,
          origine: risultato.origine,
          documentoId: risultato.documentoId,
          pod: risultato.pod,
          clienteRagioneSociale: risultato.clienteRagioneSociale,
          avvisi: risultato.avvisi,
        });
        for (const riga of risultato.righe) {
          const chiave = chiaveRiga(riga);
          const duplicataDi = primaOccorrenza.get(chiave) ?? null;
          if (duplicataDi === null) primaOccorrenza.set(chiave, file.name);
          righe.push({ ...riga, fileIndex, duplicataDi });
        }
      }
      setProgresso(null);

      if (fileOk.length === 0) {
        // Nessun file utilizzabile: restiamo sul form con il motivo di ogni
        // file, senza passare a un'anteprima vuota.
        toast.error(
          errori.length === 1
            ? errori[0].errore
            : errori.map((e) => `${e.nome}: ${e.errore}`).join("\n"),
        );
        return;
      }

      setAnalisi({ file: fileOk, errori, righe });
      const daSelezionare = new Set<number>();
      righe.forEach((riga, index) => {
        if (!riga.modificataManualmente && riga.duplicataDi === null) {
          daSelezionare.add(index);
        }
      });
      setSelezionate(daSelezionare);
    });
  }

  function toggleRiga(index: number) {
    if (!analisi) return;
    const chiave = chiaveRiga(analisi.righe[index]);
    setSelezionate((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        // Lo stesso contatore/mese può essere scritto da un solo file per
        // volta: selezionare la riga di un file deseleziona le omologhe
        // degli altri, altrimenti vincerebbe l'ultimo in silenzio.
        analisi.righe.forEach((altra, i) => {
          if (i !== index && chiaveRiga(altra) === chiave) next.delete(i);
        });
        next.add(index);
      }
      return next;
    });
  }

  function handleConferma() {
    if (!analisi) return;
    const selezionateIndici = analisi.righe
      .map((riga, index) => ({ riga, index }))
      .filter(({ index }) => selezionate.has(index));

    if (selezionateIndici.length === 0) {
      toast.error("Nessuna riga selezionata");
      return;
    }

    startTransition(async () => {
      let importate = 0;
      let annoMax = 0;

      // Una scrittura per file: l'origine e il documento sorgente sono
      // attributi del file, non della singola riga.
      for (const [fileIndex, file] of analisi.file.entries()) {
        const righeFile = selezionateIndici
          .filter(({ riga }) => riga.fileIndex === fileIndex)
          .map(({ riga }) => ({
            contatore_id: riga.contatoreId,
            periodo_mese: riga.periodoMese,
            periodo_anno: riga.periodoAnno,
            valore_f1: riga.pdfF1,
            valore_f2: riga.pdfF2,
            valore_f3: riga.pdfF3,
          }));
        if (righeFile.length === 0) continue;

        const result = await upsertLetture(impiantoId, righeFile, {
          origine: file.origine,
          documentoSorgenteId: file.documentoId,
        });
        if (result?.error) {
          toast.error(
            `${file.nome}: ${result.error}` +
              (importate > 0
                ? ` (${importate} lettura/e di file precedenti già importate/e)`
                : ""),
          );
          if (importate > 0) router.refresh();
          return;
        }
        importate += righeFile.length;
        annoMax = Math.max(annoMax, ...righeFile.map((r) => r.periodo_anno));
      }

      // Il file può contenere dati per anni diversi da quello visualizzato in
      // tabella in questo momento (l'anno scritto è quello indicato nel file
      // stesso, non quello del menu a tendina — l'import Excel può portare
      // più anni in un colpo solo): portiamo l'utente sull'anno più recente
      // tra quelli importati, altrimenti l'import "sparisce" agli occhi di
      // chi sta guardando un anno diverso.
      toast.success(`${importate} lettura/e importata/e`);
      handleOpenChange(false);
      if (annoMax && annoMax !== annoSelezionato) {
        router.push(`${pathname}?anno=${annoMax}`);
      } else {
        router.refresh();
      }
    });
  }

  const piuFile = (analisi?.file.length ?? 0) > 1;

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
        <DialogContent className="sm:max-w-3xl">
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
                  multiple
                  accept="application/pdf,image/png,image/jpeg,image/webp,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Puoi selezionare più file insieme (fino a{" "}
                  {MAX_FILE_PER_IMPORT}), anche di tipo diverso: ad esempio un
                  PDF per ciascun contatore dell&apos;impianto. PDF ed Excel
                  vengono letti in modo esatto; uno screenshot viene letto con
                  un&apos;intelligenza artificiale — controlla sempre i valori
                  prima di confermare. Il file Excel può essere lo stesso
                  registro letture già in uso per il cliente: viene abbinato ai
                  contatori di questo impianto per tipo
                  (produzione/immissione).
                </p>
              </div>
              <Button type="submit" disabled={pending} className="w-fit">
                {pending ? (progresso ?? "Analisi in corso…") : "Analizza"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {analisi.file.map((file, fileIndex) => (
                  <li key={file.documentoId}>
                    {piuFile && <strong>{file.nome}</strong>}
                    {piuFile && " — "}
                    {file.pod && <>POD {file.pod} — </>}
                    {file.clienteRagioneSociale && (
                      <>Cliente nel file: {file.clienteRagioneSociale} — </>
                    )}
                    contatori:{" "}
                    {Array.from(
                      new Set(
                        analisi.righe
                          .filter((r) => r.fileIndex === fileIndex)
                          .map((r) => r.contatoreMatricola),
                      ),
                    ).join(", ")}
                  </li>
                ))}
              </ul>

              {analisi.errori.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium">
                    {analisi.errori.length === 1
                      ? "1 file non è stato letto e non verrà importato:"
                      : `${analisi.errori.length} file non sono stati letti e non verranno importati:`}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {analisi.errori.map((e) => (
                      <li key={e.nome}>
                        <strong>{e.nome}</strong>: {e.errore}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(() => {
                const anniNelPdf = Array.from(
                  new Set(analisi.righe.map((r) => r.periodoAnno)),
                ).sort();
                const annoDiverso =
                  anniNelPdf.length > 0 &&
                  (anniNelPdf.length > 1 || anniNelPdf[0] !== annoSelezionato);
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    {piuFile ? "I file contengono" : "Il file contiene"} dati
                    per l&apos;anno{anniNelPdf.length > 1 ? "i" : ""}{" "}
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

              {analisi.file.some((f) => f.avvisi.length > 0) && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {analisi.file.flatMap((file) =>
                    file.avvisi.map((avviso) => (
                      <li key={`${file.documentoId}-${avviso}`}>
                        {piuFile && <strong>{file.nome}: </strong>}
                        {avviso}
                      </li>
                    )),
                  )}
                </ul>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead />
                      {piuFile && <TableHead>File</TableHead>}
                      <TableHead>Contatore</TableHead>
                      <TableHead>Mese</TableHead>
                      <TableHead>Valori dal file</TableHead>
                      <TableHead>Valori attuali</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analisi.righe.map((riga, index) => {
                      const origine = analisi.file[riga.fileIndex].origine;
                      return (
                        <TableRow
                          key={`${riga.fileIndex}-${chiaveRiga(riga)}`}
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
                          {piuFile && (
                            <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                              {analisi.file[riga.fileIndex].nome}
                            </TableCell>
                          )}
                          <TableCell className="text-xs text-muted-foreground">
                            {riga.contatoreMatricola}
                            <br />
                            {riga.contatoreTipo === "produzione"
                              ? "Produzione"
                              : "Immissione"}
                          </TableCell>
                          <TableCell>
                            {MESI_LABEL[riga.periodoMese - 1]}{" "}
                            {riga.periodoAnno}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {origine === "excel"
                              ? `${riga.pdfF1.toLocaleString("it-IT")} kWh`
                              : `${riga.pdfF1} / ${riga.pdfF2} / ${riga.pdfF3}`}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {riga.dbF1 === null
                              ? "—"
                              : origine === "excel"
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
                            {riga.duplicataDi && (
                              <Badge variant="warning" className="ml-1">
                                già in {riga.duplicataDi}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                  Analizza altri file
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
