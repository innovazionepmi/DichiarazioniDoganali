# Project status — Dichiarazione energia dogane

Ultimo aggiornamento: sessione Fase 2 (parte 2, import PDF). Scritto per
riprendere il lavoro in una sessione futura senza dover rileggere tutta la
conversazione.

## Cos'è questo progetto

App per Paolo Rinaldin (cliente: Jule Tech / tramite Emilio Zucca Web
Strategies) per gestire gli adempimenti fiscali di ~86 impianti fotovoltaici:
anagrafiche, letture, dichiarazioni doganali (Quadri A/G/L), F24, email
automatiche, tracking. Il brief funzionale completo è stato fornito in chat
il 10/07/2026 (riunione cliente del 02/07/2026) — se serve consultarlo di
nuovo, chiedilo all'utente o cerca nella cronologia della conversazione, non
è salvato come file nel repo.

Governance/workflow Git (branch `main`/`staging`, naming commit, ecc.):
[`CLAUDE.md`](./CLAUDE.md).

## Infrastruttura (attiva)

- **Repo GitHub**: `innovazionepmi/DichiarazioniDoganali`, branch `staging` collegato e pushato.
  Branch `main` **non ha ancora nessun commit** — verrà creato al primo merge da `staging`, dopo validazione esplicita dell'utente (vedi CLAUDE.md).
- **Vercel**: deploy attivo su `dichiarazioni-doganali.vercel.app` (branch `staging`). Env vars configurate su Vercel (Supabase URL/anon/service-role). `VERCEL_ENV` NON va mai impostata manualmente (è automatica).
- **Supabase**: progetto creato e collegato, migration applicate manualmente dall'utente via SQL Editor (non tramite `supabase db push` — l'ambiente Claude Code non ha login CLI Supabase). Migration `20260714090001`→`20260714090006` (Fase 2 parte 1: indirizzi strutturati, letture, documenti) **applicate e verificate end-to-end in staging**. Le migration successive vanno applicate quando arrivano (nessuna nuova migration nella parte 2, riusa lo schema esistente).
- **Materiali cliente reali**: ricevuti e letti (cartella locale `File-reali-esempio`, OneDrive di Emilio) — PDF E-distribuzione, licenza, F24 facsimile, dichiarazione doganale esempio, esito protocollo TXT, Excel storico calcoli. **Non copiare mai dati/nomi reali del cliente finale in file committati** (vedi "Bug importanti" più sotto — è già successo una volta con i test).

## Cosa è stato costruito — Fase 1 (completa)

Schema DB (`supabase/migrations/`, in ordine):
- `partner`, `clienti`, `impianti`, `contatori`, `contatori_relazioni` (M:N produzione↔immissione con trigger di integrità)
- Credenziali portali (E-distribuzione, GSE) cifrate in Supabase Vault — mai testo in chiaro (`set_cliente_credential`/`get_cliente_credential`, RPC service-role only)
- RLS: qualunque utente autenticato ha accesso pieno (nessuna segmentazione per ruolo ancora)
- Soft-delete ovunque (`attivo boolean`), nessun DELETE fisico esposto in UI
- `impianti.attributi_extra` (jsonb): cassetto per attributi futuri senza migrazioni distruttive
- Indirizzo **strutturato** (via/CAP/città/provincia) sia su `clienti` che su `impianti`

App Next.js 16 (App Router) + Supabase Auth + shadcn/ui (stile `base-nova`,
primitive **Base UI**, non Radix — attenzione alle differenze API):
- Login/logout, route protette da `proxy.ts` (ex `middleware.ts`, rinominato per Next.js 16)
- CRUD completo: Partner, Clienti (+ form credenziali separato via Vault), Impianti, Contatori + gestione relazioni produzione/immissione dentro il dettaglio impianto
- Liste con filtro per ditta committente/partner (`components/shared/partner-filter.tsx`), ricerca testuale, tabelle `@tanstack/react-table`
- Pattern CRUD di riferimento: `lib/actions/partner.ts` + `components/partner/partner-form.tsx` (replicato per le altre entità)

## Cosa è stato costruito — Fase 2, parte 1 (completa e verificata in staging)

Dopo aver ricevuto ed esaminato i materiali reali del cliente:

- **Schema esteso**: `contatori.lettura_iniziale` (baseline per onboarding contatori già in uso), campi `clienti.referente_*` per F24 (cognome, codice fiscale personale, sesso, comune/prov. nascita, domicilio fiscale via/CAP/città/prov — dati richiesti dal facsimile F24 reale ma assenti dal brief originale), tabella `documenti` (+ bucket Storage privato `documenti`), tabella `letture` (F1/F2/F3, `valore_periodo` generato, unique per contatore+mese+anno)
- **Motore di calcolo** (`lib/calc/registro.ts`): lettura progressiva di registro (÷K), autoconsumo mensile (produzione−immissione), riconciliazione, alert ordine di grandezza — validato con test (`lib/calc/registro.test.ts`, `npm run test`) contro numeri reali del cliente (fonte anonimizzata nei commenti)
- **Nuova sezione "Letture"** (`/letture`): lista impianti → tabella editabile stile Excel (mesi × contatori × F1/F2/F3) con salvataggio bulk (`lib/actions/letture.ts`) e alert non bloccanti (autoconsumo negativo, riconciliazione, ordine di grandezza)
- **Test end-to-end in staging** (con l'utente): creato contatore immissione + relazione produzione↔immissione, inserite letture reali via UI, verificato calcolo autoconsumo (incluso caso negativo con badge di alert), verificata persistenza dopo reload.

## Cosa è stato costruito — Fase 2, parte 2 (completa, da testare in staging)

- **Parser PDF E-distribuzione** (`lib/parsers/edistribuzione-pdf.ts`, libreria `pdf-parse` v2): deterministico, testo+regex, nessun OCR/Claude vision necessario. Estrae POD, matricola, K, indirizzo, valori mensili F1/F2/F3 (solo riga "immessa", non "prelevata" — vedi punto aperto sotto). **Verificato due volte contro i 2 PDF reali del cliente** (testo mai committato, solo passato attraverso la funzione in uno script scratchpad): trovato e corretto un bug reale — la tabella "Valori di picco di potenza" (kW) veniva scambiata per ulteriori letture mensili; ora c'è un test di regressione su fixture sintetica che lo copre.
- **Import con anteprima obbligatoria** (`analizzaPdfLetture` in `lib/actions/letture.ts` + `components/letture/importa-pdf-dialog.tsx`): il parsing NON scrive mai direttamente su `letture` — calcola un diff contro i dati già a DB e Paolo conferma riga per riga in UI. Le righe già corrette a mano (`modificata_manualmente=true`) partono deselezionate ed evidenziate in rosso, per non farle sovrascrivere per sbaglio da un reimport.
- **Anti-duplicati**: ereditato gratis dal vincolo `unique(contatore_id, periodo_anno, periodo_mese)` già esistente su `letture` — stessa funzione `upsertLetture` di prima, ora con parametri opzionali `origine`/`documentoSorgenteId`.
- **Rilevamento sostituzione contatore (parziale)**: se la matricola nel PDF non corrisponde a quella a DB per lo stesso POD, banner di avviso nell'anteprima (nessuna creazione automatica del nuovo contatore, resta manuale).
- **Archiviazione**: il PDF caricato finisce sempre su Storage + riga `documenti` (tipo `pdf_letture`), a prescindere da cosa Paolo conferma di importare.
- **Non ancora testato end-to-end in browser**: l'upload di file da input nativo non è guidabile in modo affidabile dagli strumenti di automazione browser disponibili in sessione (vedi "Bug importanti" più sotto) — il parser è verificato via script, ma il flusso completo (upload reale → anteprima → conferma → dati a DB) va provato in staging dall'utente con uno dei PDF reali.

**Deliberatamente rimandato al prossimo incremento** (non ancora costruito):
- Import screenshot (serve Claude vision/OCR, lo screenshot non ha testo — a differenza del PDF)
- Import CSV (esplicitamente rimandato dal brief)
- Onboarding cliente da licenza PDF, generazione F24/registro PDF, XML Dogane, tracking — Fase 3/4/5 del brief, non ancora iniziate
- **Punto aperto**: il PDF E-distribuzione riporta sia "immessa" che "prelevata" per lo stesso contatore/POD; l'ipotesi è che "prelevata" sia fuori scope (rilevante solo per GSE/fatturazione, non per la dichiarazione doganale) — importata solo "immessa", da confermare
- **Punto aperto**: non ho un PDF reale di esempio per un contatore di tipo **produzione** (i 2 file ricevuti erano entrambi per lo stesso POD di tipo immissione) — il parser gestisce anche quel caso in modo ragionevole ma va validato al primo import reale
- **Punto aperto**: regola "autoconsumo >70% → nessuna accisa dovuta" vista nell'Excel storico del cliente, non nel brief — rimandata su richiesta esplicita dell'utente, da chiarire prima di Fase 4 (dichiarazione)

## Bug importanti risolti in questa sessione (da ricordare)

1. **Closure non serializzabile Server→Client**: passare `onSubmit={(formData) => updateX(id, formData)}` da una pagina Server Component a un form Client Component causava un crash in produzione (build locale non lo intercetta, solo runtime). Fix: usare sempre `updateX.bind(null, id)`. **Se aggiungi nuove pagine di dettaglio, usa questo pattern fin da subito.**
2. `create-next-app` aveva sovrascritto `CLAUDE.md` di root durante lo scaffold iniziale — ripristinato.
3. Next.js 16 rinomina `middleware.ts`→`proxy.ts` e la funzione `middleware()`→`proxy()`.
4. Lo stile shadcn `base-nova` (Base UI) non ha il componente `form` nel registry ufficiale (files vuoti) — `components/ui/form.tsx` è stato scritto a mano adattando la versione Radix (usa `@radix-ui/react-slot` solo per questo file).
5. Base UI `Button` con `render={<Link ... />}` richiede `nativeButton={false}` altrimenti warning in console.
6. `VERCEL_ENV` non va mai in `.env.example`/Project Settings: Vercel la rifiuta, è automatica.
7. **Non committare mai dati reali del cliente finale nei file sorgente** (nomi ditta, matricole, cifre di produzione) — successo due volte in questa sessione: prima nei test del motore di calcolo (nome ditta nei commenti), poi evitato di proposito per il parser PDF (verificato solo via script scratchpad, mai committato). Bloccato dal classificatore la prima volta prima del commit. I numeri "nudi" nei test/fixture sintetiche vanno bene, i riferimenti a nomi/ditte/indirizzi reali no. **Prima di scrivere qualsiasi test o fixture basata su materiali reali del cliente, anonimizzare sempre prima di salvare su file.**
8. **pdf-parse v2** ha un'API diversa dalla v1 (`new PDFParse({ data: buffer }).getText()`, non più `pdf(buffer)`), e i tipi sono inclusi nel pacchetto stesso — non installare `@types/pdf-parse` (è per la v1, conflittuale).

## Prossimi passi immediati (da fare tu)

1. **Testa l'import PDF end-to-end in staging**: vai su un impianto con contatori collegati (es. quello di test "Pannelloni1"), apri Letture → "Importa da PDF E-distribuzione", carica uno dei PDF reali del cliente. Verifica: l'anteprima mostra i valori giusti, il banner di sostituzione contatore non appare a torto, la conferma scrive le letture corrette, un secondo import dello stesso file non duplica righe (upsert) e non sovrascrive eventuali correzioni manuali fatte nel frattempo.
2. Se il parser fallisce o estrae valori sbagliati su un PDF reale diverso dai 2 già verificati, dimmelo: molto probabilmente serve solo aggiustare le regex in `lib/parsers/edistribuzione-pdf.ts` (già successo una volta con la tabella "picco di potenza").
3. Quando tutto funziona: dammi conferma esplicita e ti guido nel merge `staging` → `main` (primo deploy di produzione) — oppure procediamo con il prossimo incremento a tua scelta.
4. (Opzionale) elimina l'utente di test `claude-test@example.com` da Supabase Auth Dashboard.

## File utili per orientarsi

- Schema: `supabase/migrations/` (leggere in ordine di timestamp)
- Pattern CRUD di riferimento: `lib/actions/partner.ts`, `components/partner/partner-form.tsx`
- Vault/credenziali: `lib/actions/clienti-credenziali.ts`, `lib/supabase/service-role.ts`
- Auth: `lib/actions/auth.ts`, `proxy.ts`, `lib/supabase/middleware.ts`
- Motore di calcolo: `lib/calc/registro.ts` (+ `registro.test.ts`, `npm run test`)
- Sezione Letture: `app/(app)/letture/`, `components/letture/`, `lib/actions/letture.ts`
- Parser PDF: `lib/parsers/edistribuzione-pdf.ts` (+ `.test.ts`), upload: `lib/actions/documenti.ts`
- Setup locale: [`README.md`](./README.md)
