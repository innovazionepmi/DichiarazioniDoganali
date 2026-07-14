# Project status — Dichiarazione energia dogane

Ultimo aggiornamento: Fase 4 (dichiarazione doganale) — dopo aver scoperto che
la generazione XML da sola non basta (serve invio S2S vero, vedi sezione
dedicata), aggiunta la prima parte dell'infrastruttura di invio: gestione del
certificato di autenticazione ADM (`/impostazioni`). Non ancora committato su
`staging`. Scritto per riprendere il lavoro in una sessione futura senza
dover rileggere tutta la conversazione.

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

**Bug UX corretti dopo il primo test utente**: import PDF senza refresh
automatico della tabella (mancava `router.refresh()`), e anno di riferimento
poco chiaro nella sezione Letture (ora c'è un header esplicito "Anno {anno}"
e un `key` sul componente tabella che forza il remount quando cambiano anno
o dati, invece di un `useEffect`+`setState` — pattern flaggato come
anti-pattern dal React Compiler del progetto).

**Punto aperto**: il PDF E-distribuzione riporta sia "immessa" che
"prelevata" per lo stesso contatore/POD; l'ipotesi è che "prelevata" sia
fuori scope (rilevante solo per GSE/fatturazione, non per la dichiarazione
doganale) — importata solo "immessa", da confermare.
**Punto aperto**: non ho un PDF reale di esempio per un contatore di tipo
**produzione** (i 2 file ricevuti erano entrambi per lo stesso POD di tipo
immissione) — il parser gestisce anche quel caso in modo ragionevole ma va
validato al primo import reale.
**Punto aperto**: regola "autoconsumo >70% → nessuna accisa dovuta" vista
nell'Excel storico del cliente, non nel brief — rimandata su richiesta
esplicita dell'utente, da chiarire prima di Fase 4 (dichiarazione).

## Cosa è stato costruito — Fase 3, F24 diritto di licenza (completa, da testare in staging)

- **Generatore PDF F24** (`lib/pdf/f24-generator.ts` + `lib/pdf/f24-coordinates.ts`,
  libreria `pdf-lib`): il modulo ufficiale "Mod. F24 Accise" (scaricato dal
  sito dell'Agenzia delle Entrate, asset pubblico in
  `lib/pdf/templates/f24-accise-vuoto.pdf` — **non** in `public/`, per lo
  stesso motivo del punto 9 sotto) non ha campi AcroForm: il testo viene
  sovrapposto a coordinate esatte (misurate da un facsimile reale via
  `pdfjs-dist`, mai committate come dati ma solo come geometria di un modulo
  pubblico). Una riga per impianto nella sezione Accise/Monopoli, TOTALE
  O/SALDO O/SALDO FINALE calcolati automaticamente. **Punto aperto**: la
  sezione Accise ha una capacità stimata di 6 righe (`numeroRigheMassimo` in
  `f24-coordinates.ts`); se un cliente ha più impianti con diritto di
  licenza, le righe in eccesso vengono **troncate silenziosamente** — va
  validato con un cliente reale che superi quel numero, ed eventualmente
  implementare la generazione multi-pagina.
- **Verifica visiva**: generato un F24 di prova con dati sintetici,
  convertito in immagine (script scratchpad, non nel repo) e controllato a
  occhio — ogni campo cade nella casella giusta.
- **Server actions** (`lib/actions/f24.ts`): `generaF24` valida i dati del
  referente (con errore esplicito se mancano campi obbligatori in
  anagrafica), genera il PDF, lo archivia su Storage + tabella `documenti`
  (tipo `f24`), crea `f24_generazioni`/`f24_righe` e ritorna il PDF in
  base64 per il download immediato. `inviaEmailF24` invia il PDF come
  allegato all'email del referente e segna lo stato `inviato` — **mai
  automatico**, sempre dietro un click esplicito "OK invio" in UI.
  `scaricaF24` riscarica uno storico già generato.
- **Email transazionali** (`lib/email/client.ts`, `nodemailer`): wrapper SMTP
  generico (compatibile Brevo, che l'utente configurerà separatamente). Se
  `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` non sono impostate su Vercel,
  l'invio fallisce con un errore chiaro in UI invece di un crash —
  generazione e download restano utilizzabili anche prima che Brevo sia
  attivo.
- **UI** (`components/clienti/f24-section.tsx` + `f24-genera-dialog.tsx`):
  nuova sezione "Diritto di licenza" nella scheda cliente, visibile solo se
  il cliente ha almeno un impianto con `diritto_licenza_dovuto=true`.
  Dialog di generazione con importi precompilati da
  `diritto_licenza_importo` ma modificabili riga per riga. Storico
  generazioni con bottoni "Scarica" e, se non ancora inviato, "OK invio".
- **Non ancora testato end-to-end in staging**: generazione/download provati
  solo con dati sintetici in locale — va provato dall'utente con un cliente
  di test reale (dati anagrafici completi in scheda cliente, altrimenti
  `generaF24` risponde con l'elenco dei campi mancanti). L'invio email resta
  bloccato finché l'utente non configura Brevo su Vercel.

**Deliberatamente non ancora costruito**: generazione registro letture PDF —
Fase 4/5 del brief. XML Dogane e tracking dashboard: vedi sezioni dedicate più
sotto, ora in costruzione.

## Cosa è stato costruito — Onboarding cliente/impianto da licenza PDF (completo, da testare in staging)

- **Motivazione**: con ~86 impianti previsti, l'inserimento manuale di ogni
  cliente/impianto è il collo di bottiglia maggiore. Il PDF di licenza
  fiscale (Agenzia Dogane e Monopoli) contiene quasi tutti i dati anagrafici
  necessari — ma è quasi sempre una **scansione**: `pdf-parse` estrae ~0
  caratteri di testo (verificato su un documento reale), quindi qui non è
  possibile il parsing regex già usato per i PDF E-distribuzione. Serve
  visione/OCR.
- **Estrazione vision** (`lib/ai/estrai-licenza.ts`): le pagine del PDF
  vengono rasterizzate in immagini (`lib/pdf/rasterizza-pagine.ts`, stesso
  meccanismo `pdf-parse`/`getScreenshot` già usato per la verifica visiva
  dell'F24) e inviate all'API Messages di Anthropic (`fetch` diretto, nessuna
  dipendenza SDK) con un prompt che richiede JSON stretto. **Verificato una
  volta con autorizzazione esplicita dell'utente** su un documento reale
  (script scratchpad, mai committato, cancellato subito dopo): estrazione
  quasi perfetta di ragione sociale, CF/PIVA, codice ditta/licenza,
  nome+cognome+CF del legale rappresentante, indirizzi strutturati (ditta e
  impianto), protocollo, data, ufficio doganale. **Importante**: alcuni dati
  (es. l'importo del diritto di licenza) possono stare sulla lettera di
  accompagnamento invece che sul certificato — per questo vengono inviate
  **tutte** le pagine del PDF insieme (max 6, oltre si tronca con avviso).
- **Flusso** (`lib/actions/onboarding.ts` + `components/clienti/
  onboarding-licenza-dialog.tsx`, bottone "Importa da licenza PDF" in
  `/anagrafiche/clienti`): upload → analisi (nessuna scrittura DB, solo
  estrazione) → revisione con **tutti i campi precompilati ed editabili**
  (mai automatico) → conferma, che crea cliente (o riusa uno esistente se il
  CF estratto corrisponde già a un cliente attivo — sempre sovrascrivibile)
  + impianto + archivia il PDF in `documenti` (tipo `licenza`), tutto in un
  solo passaggio atomico (stesso pattern di `generaF24`, non due fasi).
  Campi non estraibili dal documento (nome impianto, potenza kW, registro
  letture) restano da compilare a mano, prima o dopo la conferma.
- **Non ancora testato end-to-end in staging**: l'estrazione vision non è
  mai stata chiamata dall'app vera (solo dallo script di verifica una
  tantum) — va provata dall'utente con un documento reale. Richiede
  `ANTHROPIC_API_KEY` configurata su Vercel (l'utente ne ha già una in
  `.env.local`, va replicata su Vercel Project Settings). Il modello di
  default è `claude-sonnet-5` (sovrascrivibile con `ANTHROPIC_MODEL`).

## Cosa è stato costruito — Recupero credenziali portali (completo)

La RPC `get_cliente_credential` esisteva già dalla Fase 1 ma non era mai
stata collegata a nessuna azione/UI: si potevano solo **scrivere** le
credenziali E-distribuzione/GSE, mai recuperarle per usarle davvero.
Aggiunto `getCredenzialeCliente` (`lib/actions/clienti-credenziali.ts`) +
bottone "Mostra credenziali salvate" nella scheda cliente
(`components/clienti/cliente-credenziali-form.tsx`): decifra on-demand
(mai caricate insieme al resto della pagina) e offre un'icona per copiare
utente/password negli appunti.

## Cosa è stato costruito — Documenti scaricabili (completo)

Sezione "Documenti" generica (`components/shared/documenti-section.tsx`,
azione `scaricaDocumento` in `lib/actions/documenti.ts`), aggiunta sia alla
scheda cliente che alla scheda impianto: elenca tutti i file archiviati
(licenze, PDF letture, screenshot, ecc.) con bottone "Scarica" — prima
erano archiviati su Storage ma non recuperabili da nessuna UI. Nella scheda
cliente i documenti di tipo `f24` sono esclusi dall'elenco perché hanno già
una vista dedicata più ricca nella sezione "Diritto di licenza".

## Cosa è stato costruito — Design system "Jouletec" (completo, da vedere in staging)

L'utente ha fornito un progetto Claude Design ("Jouletec Design System",
brand del cliente finale) con token colore/tipografia/spaziatura, 13
componenti-specifica (stile inline, pensati come riferimento visivo — non
per essere incollati come codice) e due mockup di riferimento. Applicato
**ritematizzando i componenti shadcn/Base UI esistenti** tramite i token
(non sostituendoli con i `.jsx` del design system, che avrebbe fatto perdere
l'accessibilità/comportamento già funzionante su ~20 pagine).

- **Colori** (`app/globals.css`): navy (`#2E3A46`) primario, olive
  (`#A6B94A`/`#7C8A34`) come accento, nuovi token `--brand-accent`/
  `--status-success`/`-warning`/`-info` (assenti nel set shadcn di default).
  I pulsanti primari usano **olive-700** (non olive-500, l'accento "chiaro"
  del logo) perché con testo bianco sopra serve più contrasto (~4:1 contro
  ~2.9:1) — scelta esplicita dopo feedback dell'utente ("i pulsanti troppo
  chiari").
- **Font**: Space Grotesk (titoli)/Public Sans (corpo)/IBM Plex Mono
  (codici) al posto di Geist, mai personalizzato prima.
- **Sidebar**: sfondo navy scuro, icona quadrata del marchio (ritagliata a
  mano dal logo originale via scan pixel dei bordi, `app/icon.png`) + testo
  "Jouletec" — **non** l'immagine wordmark intera: usarla scalata piccola la
  rendeva illeggibile/tagliata, il design system stesso nei suoi mockup usa
  testo, non l'immagine, per la sidebar/topnav.
- **Input** (`components/ui/input.tsx`): sfondo `bg-muted` invece di
  trasparente — prima si confondevano col bianco della pagina.
- **Badge**: nuove varianti `success`/`warning`/`info`, applicate a F24
  stato "Inviato" e letture stato "Nuovo"/"Differente".
- **Verifica dati reali → servizio esterno**: nota, non specifica a questa
  fase — questo stesso punto è già coperto dal bug #11 sotto (test unico
  autorizzato dall'utente su un documento reale del cliente, verso l'API
  vision di Anthropic, per validare l'estrazione della Fase "Onboarding
  licenza").
- **Verifica senza screenshot**: il tool di cattura schermo del Browser pane
  era bloccato per un problema infrastrutturale della sessione (non del
  codice). Verificato comunque a fondo leggendo i valori CSS calcolati via
  JavaScript nel browser (colori, font, dimensioni logo, contrasto
  pulsanti) — se ricapita, questo è un fallback valido.

## Cosa è stato costruito — Tabellone tracking + fix letture (completo, da applicare la migration e testare in staging)

Dopo il primo giro di test utente in staging, quattro richieste di verifica/modifica:

- **Verificato (nessun bug)**: i valori mensili F1/F2/F3 inseriti (manuale, PDF,
  screenshot) sono già delta mensili (kWh del mese), non letture cumulative
  di registro — il "registro" cumulativo viene calcolato a partire da questi
  (`lib/calc/registro.ts`), non il contrario. L'autoconsumo mensile
  (produzione−immissione) non richiede quindi nessuna sottrazione rispetto al
  mese precedente.
- **Sostituzione contatore ora bloccante**: `analizzaPdfLetture`
  (`lib/actions/letture.ts`) prima mostrava solo un avviso quando la
  matricola nel PDF non corrispondeva a quella a DB per lo stesso POD, ma
  continuava comunque a scrivere le letture sul contatore vecchio — avrebbe
  rotto la lettura progressiva di registro (che riparte da 0 su un contatore
  nuovo). Ora **blocca l'import** con un messaggio che istruisce l'operatore
  a censire il nuovo contatore a mano dalla scheda impianto (nuova matricola,
  stesso POD/tipo, `lettura_iniziale=0`) e cessare il vecchio prima di
  ripetere l'import — scelta esplicita dell'utente rispetto
  all'auto-creazione con conferma.
- **Fix vista annuale Letture**: la pagina `/letture/[impiantoId]`
  filtrava i contatori con `attivo=true`, quindi un contatore cessato a metà
  anno (dopo una sostituzione) faceva sparire dalla vista i mesi già letti su
  quel contatore. Ora il filtro è per range di date (`data_attivazione` /
  `data_cessazione` vs. l'anno selezionato), indipendente dal flag `attivo`
  corrente.
- **Nuovo tabellone `/tracking`** (`app/(app)/tracking/`,
  `components/tracking/tracking-table.tsx`, `lib/actions/tracking.ts`):
  vista cliente espandibile → impianti, con spunte per dichiarazione inviata
  (2 spunte per impianto se `diritto_licenza_dovuto=true`, 1° e 2° semestre;
  1 spunta annuale altrimenti) e una spunta fattura emessa **per cliente per
  anno** (non per impianto — scelta esplicita dell'utente: un cliente con più
  impianti riceve un'unica fattura annuale). Nuove tabelle
  `tracking_dichiarazioni` / `tracking_fatture`
  (`supabase/migrations/20260714120001_tracking.sql`, **non ancora applicata
  in staging** — va eseguita a mano via SQL Editor come le precedenti).
  Regola di periodicità salvata anche in memoria per riuso nella Fase 4 (XML
  dichiarazione doganale).
- **Non ancora testato in staging**: build/lint/test passano e il dev server
  parte senza errori, ma la verifica end-to-end nel browser richiede login
  (nessuna credenziale disponibile in sessione) — va provato dall'utente
  dopo aver applicato la migration.

## Cosa è stato costruito — Fase 4, dichiarazione XML semestrale (Quadro A+G, da testare in staging)

Prima parte della Fase 4 (dichiarazione doganale). Ricerca approfondita della
documentazione ADM (XSD, tracciati Excel, istruzioni ufficiali scaricate dal
sito) salvata in memoria — vedi `project_xml_dogane_ricerca.md`. Punto chiave
emerso: per il profilo "officina di produzione da fonti rinnovabili uso
proprio esente" (autoconsumo + eccedenza immessa in rete, **senza** vendita a
consumatori finali/consorziati/consociati — il caso tipico dei clienti di
Paolo), le istruzioni ADM dicono esplicitamente che i quadri di liquidazione
dell'accisa (J/L/M/Q/S) **non vanno compilati**: bastano **Quadro A
(produzione) + Quadro G (cessione alla rete)**. Se un domani un cliente
vendesse a terzi, andrà esteso (fuori scope per ora — vedi piano salvato in
`C:\Users\Emilio\.claude\plans\foamy-jumping-manatee.md`).

- **Scope iniziale (superato, vedi sotto)**: si era deciso "solo generazione
  XML, Paolo lo carica a mano sul portale ADM (U2S)" — **rivelatosi
  impraticabile**: la modalità U2S di ADM è un form web per compilazione
  manuale campo-per-campo (non accetta l'upload di un XML pronto) ed è
  esplicitamente sconsigliata da ADM oltre 2 dichiarazioni. Con l'utente si è
  quindi deciso di costruire l'**invio S2S vero e proprio** dentro l'app —
  vedi sezione "Fase 4, invio S2S" più sotto per il piano completo. Solo la
  **dichiarazione semestrale** per ora (annuale rimandata esplicitamente:
  l'utente si aspetta possibili aggiornamenti documentali prima della
  prossima scadenza annuale).
- **Schema già pronto dalla Fase 1** (nessuna migration su `clienti`/`impianti`
  necessaria): `impianti.codice_impianto_f24` = CodDitta del frontespizio
  (per licenza/impianto, non per cliente), `impianti.codice_distributore_zona`
  = Id del Quadro G (codice del distributore, es. E-Distribuzione — da
  popolare per impianto), `contatori`+`letture`+`lib/calc/registro.ts`
  (`letturaRegistro`, `mesePrecedente`) già bastano per calcolare
  LettA/LettP/DiffLett/CostLett/kWh per contatore per mese.
- **Validazione dati** (`lib/validation/dichiarazione-ee.schema.ts`): zod al
  posto di un validatore XSD generico — le librerie XSD per Node hanno quasi
  tutte binding nativi, rischiose su Vercel serverless (stesso tipo di
  problema già avuto con `pdf-parse`, vedi bug #9 sotto).
- **Generatore XML** (`lib/xml/dichiarazione-ee-semestrale.ts` + `.test.ts`):
  costruisce l'`EnergiaElettricaSemestrale` XML (Dich, Periodo, Quadro A,
  Quadro G con Tipo="B" vettoriamento) da template string, nessuna libreria
  XML esterna. Testato con dati sintetici (mai reali, coerente col bug #7).
- **Server actions** (`lib/actions/dichiarazioni.ts`):
  `generaDichiarazioneSemestrale` valida la completezza dei dati (errore
  esplicito con l'elenco dei campi/letture mancanti, stesso pattern di
  `generaF24`), genera l'XML, lo archivia (tipo documento `dichiarazione_xml`,
  nuovo valore enum), crea/aggiorna la riga in `dichiarazioni_ee_semestrali`
  e ritorna l'XML in base64 per il download immediato.
  `caricaEsitoDichiarazione` archivia il PDF/protocollo che ADM restituisce
  dopo il caricamento manuale (riusa `caricaDocumento`, ora esteso per
  accettare anche `text/plain` per il protocollo `.txt`) e segna la
  dichiarazione come `inviata`.
- **Nuova tabella** `dichiarazioni_ee_semestrali`
  (`supabase/migrations/20260714130001_dichiarazioni_ee_semestrali.sql`,
  **non ancora applicata in staging**): una riga per impianto+anno+semestre,
  con riferimenti ai 3 documenti (XML generato, PDF e protocollo ricevuti).
- **UI**: nuova sezione "Dichiarazione energia elettrica (semestrale)" nella
  scheda impianto (`components/impianti/dichiarazione-section.tsx`):
  selettore anno+semestre, bottone "Genera dichiarazione" (scarica l'XML o
  mostra l'errore di completezza dati), storico con "Scarica XML" e upload
  PDF/protocollo.
- **Fuori scope per questo incremento** (vedi piano per i dettagli): Quadro
  C/J/L/M/Q/S/N/T/Allegati (solo se un cliente vende a terzi), logica
  multi-ambito (non serve per Quadro A/G, che non hanno raggruppamento per
  ambito — entra in gioco solo con J/L/M/Q/S), collegamento automatico col
  tabellone `/tracking`.
- **Non ancora testato in staging**: build/lint/test passano (33 test
  totali), ma la verifica end-to-end nel browser richiede login (nessuna
  credenziale disponibile in sessione) — va provato dall'utente dopo aver
  applicato la migration, popolato `codice_impianto_f24`/
  `codice_distributore_zona` su un impianto di test e inserito letture per un
  semestre completo.
- **Dettagli da verificare con un caso reale, non bloccanti** (fallback
  ragionevole già applicato): numerazione esatta di `NumMese` nel semestre
  (assunto mese di calendario reale, 1-6 per il 1° semestre) — se Paolo ha un
  XML di esempio reale da ADM, confrontarlo prima di dare per buona
  l'assunzione.

## Cosa è stato costruito — Fase 4, invio S2S: gestione certificato ADM (primo pezzo, da testare in staging)

Dopo aver scoperto che la generazione XML da sola non basta (vedi sopra),
piano completo per l'invio S2S concordato con l'utente — **solo il primo
pezzo è stato costruito finora** (gestione del certificato), il client SOAP
vero e proprio è ancora da fare.

**Flusso concordato** (dettagli completi solo in conversazione, non ancora
in un piano scritto — se serve rileggerlo, cerca nella cronologia la parte
dopo "ho un dubbio atroce"):
1. L'app genera l'XML (già fatto, Quadro A+G)
2. Paolo lo firma **fuori dall'app**, con Aruba Sign (ha firma remota OTP) —
   scelta esplicita dell'utente: così l'app non tocca mai il certificato di
   firma di Paolo, e se cambia fornitore di firma non siamo impattati
3. Paolo ricarica il file firmato nell'app
4. L'app lo invia via SOAP all'endpoint ADM, autenticandosi con il
   **certificato di autenticazione ADM** (diverso dalla firma — questo
   autentica la connessione tecnica, non firma il contenuto) — **questo è il
   pezzo costruito ora**
5. L'app recupera lo IUT e poi l'esito (asincrono)
6. **Scoperta importante**: a differenza di U2S, l'invio S2S **non restituisce
   un PDF/protocollo pronti da ADM** — solo messaggi XML (OUTPUT + ESITO).
   Il PDF/protocollo "belli" da dare al cliente finale li dovremo generare
   **noi** (riuso di `pdf-lib`, stesso approccio di `f24-generator.ts`) — non
   ancora costruito.

**Endpoint verificati sugli XSD/WSDL ufficiali** (solo ambiente di test
documentato finora — **l'endpoint di produzione non è ancora pubblicato da
ADM**, normale per un sistema appena lanciato):
- Invio: `https://platformtest.adm.gov.it/EEsemestraliM24ServiceWeb/services/EEsemestraliM24Service`, SOAP action `http://process.eesemestralim24.domest.sogei.it/wsdl/EEsemestraliM24Service`, `serviceId="invioEnergiaElettricaSemestrale"`
- Recupero esito: `https://platformtest.adm.gov.it/InteropServiceWEB/services/InteropService` (`recuperaEsito(IUT)`)
- Controllo stato: `https://platformtest.adm.gov.it/InteropRServiceWeb/services/InteropRService/selezionaStato/{iut}` (REST)

**Costruito in questa sessione — gestione certificato di autenticazione ADM**:
- Nuova tabella `certificati_adm` (`supabase/migrations/20260714140001_certificati_adm.sql`,
  **non ancora applicata in staging**): un certificato per ambiente
  (`test`/`produzione`), il contenuto (certificato + password opzionale, in
  JSON) vive **cifrato in Supabase Vault**, mai in chiaro nel DB — stesso
  meccanismo già usato per le credenziali E-distribuzione/GSE
  (`set_cliente_credential`/`get_cliente_credential`), qui generalizzato con
  `set_certificato_adm`/`get_certificato_adm`/`delete_certificato_adm`
  (nuove RPC, security-definer, solo `service_role`).
- **Un solo certificato attivo per ambiente**: ricaricare sostituisce quello
  precedente — così si gestisce anche il rinnovo alla scadenza, come
  richiesto esplicitamente dall'utente.
- **UI**: nuova pagina `/impostazioni` (`components/impostazioni/certificato-adm-section.tsx`),
  due riquadri (test/produzione) con stato attuale (nome file, data
  caricamento, scadenza con badge — rosso se scaduto, giallo se entro 30
  giorni) e form di caricamento/sostituzione. Il formato esatto del
  certificato di Paolo (p12/pfx con password? altro?) non è ancora noto: il
  contenuto viene conservato opaco (base64 + password libera) apposta, per
  non dover ridisegnare lo schema quando arriva quello vero.
- **Non ancora costruito**: il client SOAP che userà questo certificato
  (upload XML firmato, invio test/reale, recupero esito, generazione
  PDF/protocollo nostri) — prossimo pezzo, quando Paolo avrà ottenuto almeno
  il certificato di test da ADM.

## Bug importanti risolti in questa sessione (da ricordare)

1. **Closure non serializzabile Server→Client**: passare `onSubmit={(formData) => updateX(id, formData)}` da una pagina Server Component a un form Client Component causava un crash in produzione (build locale non lo intercetta, solo runtime). Fix: usare sempre `updateX.bind(null, id)`. **Se aggiungi nuove pagine di dettaglio, usa questo pattern fin da subito.**
2. `create-next-app` aveva sovrascritto `CLAUDE.md` di root durante lo scaffold iniziale — ripristinato.
3. Next.js 16 rinomina `middleware.ts`→`proxy.ts` e la funzione `middleware()`→`proxy()`.
4. Lo stile shadcn `base-nova` (Base UI) non ha il componente `form` nel registry ufficiale (files vuoti) — `components/ui/form.tsx` è stato scritto a mano adattando la versione Radix (usa `@radix-ui/react-slot` solo per questo file).
5. Base UI `Button` con `render={<Link ... />}` richiede `nativeButton={false}` altrimenti warning in console.
6. `VERCEL_ENV` non va mai in `.env.example`/Project Settings: Vercel la rifiuta, è automatica.
7. **Non committare mai dati reali del cliente finale nei file sorgente** (nomi ditta, matricole, cifre di produzione) — successo due volte in questa sessione: prima nei test del motore di calcolo (nome ditta nei commenti), poi evitato di proposito per il parser PDF (verificato solo via script scratchpad, mai committato). Bloccato dal classificatore la prima volta prima del commit. I numeri "nudi" nei test/fixture sintetiche vanno bene, i riferimenti a nomi/ditte/indirizzi reali no. **Prima di scrivere qualsiasi test o fixture basata su materiali reali del cliente, anonimizzare sempre prima di salvare su file.**
8. **pdf-parse v2** ha un'API diversa dalla v1 (`new PDFParse({ data: buffer }).getText()`, non più `pdf(buffer)`), e i tipi sono inclusi nel pacchetto stesso — non installare `@types/pdf-parse` (è per la v1, conflittuale).
9. **pdf-parse crashava su Vercel serverless** ("server error" generico, funzionava in locale): serve `serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"]` in `next.config.ts` **più** `import "pdf-parse/worker"` prima di istanziare `PDFParse` nel codice server. Per lo stesso motivo, asset statici letti da codice server (es. il template F24) vanno messi in una cartella sorgente normale (`lib/pdf/templates/`), **mai in `public/`** — non è garantito che `public/` sia incluso nel bundle della funzione serverless.
10. **`.maybeSingle()` di supabase-js nasconde l'errore "più righe trovate"**: se una query che ti aspetti restituisca 0 o 1 riga ne trova invece 2+, `.maybeSingle()` ritorna silenziosamente `data: null` senza propagare l'errore reale — se lo confondi con "nessun risultato" ottieni un messaggio fuorviante. Con dati che possono avere duplicati (es. POD duplicati in fase di test), meglio una query esplicita su array con `.length` per distinguere 0/1/molti.
11. **Inviare dati reali del cliente a un servizio esterno (API Anthropic) è diverso da committarli nel repo**: bloccato dal classificatore come "Data Exfiltration" anche dopo autorizzazione esplicita dell'utente su un primo tentativo — la seconda chiamata con gli stessi dati è stata bloccata come hard-block non aggirabile. **Non ritentare mai in modi diversi un'azione così bloccata**: un singolo test autorizzato è bastato per validare l'approccio, il resto della verifica end-to-end spetta all'utente in staging. Anche negli **esempi nei prompt** (es. formato di un codice) va usato un valore fittizio, mai il valore reale visto in un documento del cliente — successo una volta con il codice ditta reale usato come esempio di formato, corretto prima del commit.
12. **Cache Turbopack (`.next/`) può servire CSS/palette stantii**: dopo aver modificato `app/globals.css`, se i colori calcolati nel browser non corrispondono al file sorgente, cancellare `.next/` e riavviare il dev server prima di sospettare bug nel codice.
13. **Immagini in flex container si stirano/appiattiscono senza `self-start`**: un `<Image>` con `w-auto` dentro un `flex flex-col` (default `align-items: stretch`) viene forzata a riempire la larghezza del container, distorcendo l'aspect ratio — serve `self-start` (o `items-start` sul contenitore).

## Prossimi passi immediati (da fare tu)

L'utente ha completato in questa sessione tutti i test della Fase 2/3/onboarding
già segnalati in precedenza. Quello che resta:

1. **Applica le nuove migration** via SQL Editor di Supabase (come le
   precedenti, in ordine): `20260714120001_tracking.sql`,
   `20260714130001_dichiarazioni_ee_semestrali.sql` e
   `20260714140001_certificati_adm.sql` — senza queste il tabellone
   `/tracking`, la sezione "Dichiarazione energia elettrica" e la pagina
   `/impostazioni` rispondono con un errore.
2. **Chiedi a Paolo il certificato di autenticazione ADM (ambiente di
   test)**: gli hai già mandato le istruzioni (accesso PUDM con SPID/CNS,
   profili `dlr_enelettr` + `dlr_gestione_certificati_aut`, generazione da
   Gestione Certificati) — appena arriva, caricalo da `/impostazioni` in
   staging. Senza questo non si può ancora testare l'invio vero e proprio
   (il client SOAP non è ancora stato costruito, sarà il prossimo pezzo).
3. **Testa il tabellone `/tracking` in staging**: spunta dichiarazione per un
   impianto (1 o 2 semestri a seconda di "Diritto di licenza dovuto") e
   fattura per un cliente, ricarica la pagina e verifica che le spunte
   restino salvate. Cambia anno dal selettore e verifica che il filtro
   partner resti applicato (fix di questa sessione).
4. **Ri-testa l'import PDF letture con una matricola diversa da quella a DB**
   (sostituzione contatore): ora l'import deve **bloccarsi** con un
   messaggio che chiede di creare il nuovo contatore a mano e cessare il
   vecchio, non più solo avvisare e importare comunque.
5. **Testa la generazione della dichiarazione XML in staging**: su un impianto
   di test, compila `codice_impianto_f24` (formato AAA00000A) e
   `codice_distributore_zona` (codice ditta/accisa del distributore, es.
   E-Distribuzione — va reperito, ogni distributore lo pubblica sul proprio
   sito), inserisci letture complete per un semestre su almeno un contatore
   di produzione (e uno di immissione se vuoi testare anche il Quadro G),
   poi vai sulla scheda impianto → "Genera dichiarazione". Se mancano dati,
   vedrai un errore esplicito con l'elenco di cosa manca. Apri l'XML
   scaricato e controlla a occhio che i valori tornino. **Non inviarlo
   ancora da nessuna parte**: l'unico canale di invio (S2S) non è ancora
   collegato all'app — il generatore XML per ora produce solo il file, la
   parte "invio" è in costruzione (vedi sezione Fase 4/invio S2S sopra).
6. **Configura `ANTHROPIC_API_KEY` su Vercel Project Settings** (già presente
   in `.env.local` ma non ancora replicata in produzione) — senza questa, il
   bottone "Importa da licenza PDF" mostra un errore chiaro invece di un
   crash, ma non è utilizzabile.
7. Se un cliente ha più impianti con diritto di licenza di quanti ne entrano
   nel modulo F24 (stimato 6 righe), dimmelo: il codice al momento tronca le
   righe in eccesso, va deciso se passare alla generazione multi-pagina.
8. Quando tutto funziona: dammi conferma esplicita e ti guido nel merge
   `staging` → `main` (primo deploy di produzione) — oppure procediamo col
   prossimo incremento della Fase 4 (client SOAP per l'invio vero, appena
   Paolo ha il certificato di test) a tua scelta.
9. (Opzionale) elimina l'utente di test `claude-test@example.com` da
   Supabase Auth Dashboard.

## File utili per orientarsi

- Schema: `supabase/migrations/` (leggere in ordine di timestamp)
- Pattern CRUD di riferimento: `lib/actions/partner.ts`, `components/partner/partner-form.tsx`
- Vault/credenziali: `lib/actions/clienti-credenziali.ts` (scrittura + `getCredenzialeCliente` per il recupero), `lib/supabase/service-role.ts`
- Auth: `lib/actions/auth.ts`, `proxy.ts`, `lib/supabase/middleware.ts`
- Motore di calcolo: `lib/calc/registro.ts` (+ `registro.test.ts`, `npm run test`)
- Sezione Letture: `app/(app)/letture/`, `components/letture/`, `lib/actions/letture.ts`
- Parser PDF: `lib/parsers/edistribuzione-pdf.ts` (+ `.test.ts`), upload: `lib/actions/documenti.ts` (+ `scaricaDocumento`, `components/shared/documenti-section.tsx`)
- Dichiarazione XML EE semestrale: `lib/xml/dichiarazione-ee-semestrale.ts` (+ `.test.ts`), `lib/validation/dichiarazione-ee.schema.ts`, `lib/actions/dichiarazioni.ts`, UI: `components/impianti/dichiarazione-section.tsx`. Piano di implementazione salvato in `C:\Users\Emilio\.claude\plans\foamy-jumping-manatee.md`, ricerca documentazione ADM in memoria (`project_xml_dogane_ricerca.md`)
- F24: `lib/pdf/f24-generator.ts` (+ `.test.ts`, coordinate in `f24-coordinates.ts`), `lib/actions/f24.ts`, email: `lib/email/client.ts`, UI: `components/clienti/f24-section.tsx`
- Onboarding licenza: `lib/pdf/rasterizza-pagine.ts` (+ `.test.ts`), `lib/ai/estrai-licenza.ts`, `lib/actions/onboarding.ts`, `lib/validation/licenza.schema.ts`, UI: `components/clienti/onboarding-licenza-dialog.tsx`
- Design system Jouletec: token in `app/globals.css`, font in `app/layout.tsx`, sidebar in `app/(app)/layout.tsx`, progetto Claude Design originale (per rivedere componenti/guideline non ancora applicati): `projectId 3b848f67-8e2f-48b0-bdbc-8d52f62d1fbb` via `DesignSync`
- Tracking dichiarazioni/fatture: `app/(app)/tracking/`, `components/tracking/tracking-table.tsx`, `lib/actions/tracking.ts`, migration `supabase/migrations/20260714120001_tracking.sql`
- Certificato autenticazione ADM (invio S2S): `app/(app)/impostazioni/`, `components/impostazioni/certificato-adm-section.tsx`, `lib/actions/certificati-adm.ts`, migration `supabase/migrations/20260714140001_certificati_adm.sql`
- Setup locale: [`README.md`](./README.md)
