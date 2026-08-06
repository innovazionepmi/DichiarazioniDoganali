# Project status — Dichiarazione energia dogane

Ultimo aggiornamento: Fase 4 (dichiarazione doganale) — 🎉🎉 **catena S2S
validata al 100% in ambiente di addestramento, fino all'accettazione
sostanziale definitiva**: certificato di autenticazione (CSR), firma
XAdES-BES, invio SOAP, accoglienza (**codice 20**), elaborazione sostanziale
asincrona (**codice 200, "Elaborazione OK: completata con esito finale"**
— il miglior esito possibile). Ottenuto usando il **CodDitta reale di un
cliente vero** (Giorik SPA, `BLE00981R`, da licenza + verifica su Excel di
Paolo) con numeri di produzione/contatori inventati (autorizzato
esplicitamente dall'utente, rischio nullo: ambiente di addestramento) — la
prova che serviva un'identità realmente registrata presso ADM, non dati
completamente fittizi (che si fermavano al codice 198, KO sostanziale).
Nessun pezzo tecnico rimasto da validare per l'invio S2S in sé. Certificato
di **produzione** anche generato e verificato, pronto in locale ma non
ancora caricato su `/impostazioni` (non urgente: l'endpoint di produzione
non è ancora pubblicato da ADM).

Subito dopo, stessa sessione: **generatore PDF registro letture** (Mod.
M-bis 36, nuova sezione sulla scheda impianto) e **ricevuta invio S2S in
PDF** (frontespizio + Quadro A/G + IUT/esito, al posto del semplice `.txt`
— vedi sezione dedicata più sotto).

**Fatto subito dopo, stessa sessione**: il client SOAP validato è ora
**collegato al flusso reale** (`dichiarazioni_ee_semestrali`) — schermata di
riepilogo pre-invio (dati completi, non un riassunto), invio verso
l'ambiente **produzione** (endpoint non ancora pubblicato da ADM: l'azione
è pronta, ritorna l'errore friendly già previsto finché non lo pubblicano),
controllo stato, e un bottone "Scarica ricevuta" che genera un file di
testo simile a quello che ADM restituiva con l'invio manuale U2S (esempio
reale fornito dall'utente: `IUT ...` / `RICEVUTO ...` / riga di esito) — S2S
non lo fornisce nativamente, va costruito da noi. Dettagli tecnici e
limiti noti nella sezione dedicata più sotto. **Non ancora testato in
staging** (richiede login, nessuna credenziale disponibile in sessione) —
build/typecheck/lint/test (55 totali) puliti.

**⚠️ Urgenza scadenza**: verificato via fonte esterna (Energix) che la
finestra di presentazione del I semestre 2026 è **1 luglio – 30 settembre
2026** — quindi già aperta ora. Motivo in più per sbloccare il certificato
di autenticazione appena possibile. Vedi anche punto aperto sulla regola di
periodicità più sotto.

Scritto per riprendere il lavoro in una sessione futura senza dover
rileggere tutta la conversazione.

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

- **Repo GitHub**: `innovazionepmi/DichiarazioniDoganali`, branch `staging` (lavoro quotidiano) e `main` (produzione, creato il 2026-07-30 dal primo merge/release — vedi sotto).
- **Vercel — 🎉 prima release in produzione (2026-07-30)**: `main` impostato come Production Branch (Project Settings → Environments → Production → Branch Tracking). Produzione live su dominio custom **`dichiarazioni.jouletec.it`** (configurato dall'utente). `staging` continua a generare un **Preview Deployment** separato, con alias stabile per branch:
  `https://dichiarazioni-doganali-git-staging-innovazionepmis-projects.vercel.app`
  (si aggiorna ad ogni push su `staging`, indipendente dalla produzione — utile per testare prima di mergiare). Flusso confermato: si lavora sempre su `staging`, si testa sul suo URL preview, poi solo dopo conferma esplicita dell'utente si mergia su `main` (deploy di produzione). Env vars configurate su Vercel (Supabase URL/anon/service-role, Anthropic, Brevo SMTP) — **da verificare che siano abilitate anche per l'ambiente "Preview"**, non solo "Production", altrimenti staging potrebbe non funzionare pur essendo online. `VERCEL_ENV` NON va mai impostata manualmente (è automatica).
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
  tantum) — va provata dall'utente con un documento reale.
  `ANTHROPIC_API_KEY` **è già configurata su Vercel** (confermato
  dall'utente il 2026-07-20 — non serve più configurarla, punto aperto
  precedente chiuso). Il modello di default è `claude-sonnet-5`
  (sovrascrivibile con `ANTHROPIC_MODEL`).

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
  prossima scadenza annuale). **Materiali già disponibili per quando si
  riprende** (verificato 2026-07-27, cartella locale dell'utente
  `OneDrive/.../Webservice2026/Dichiarazione-annuale-2026/`): XSD annuale
  (`EnergiaElettrica_2021.xsd`, schema "EnergiaElettrica", invariato dal
  2021 — root diverso dal semestrale: niente `Periodo`, ha `Anno` e in più
  i quadri di liquidazione C/E/I/J/M/K/P/Q/X/R/S/EC/EF) e un **WSDL reale
  del servizio annuale** (`EnergiaElettricaService.wsdl` — stesso schema di
  naming del semestrale, `{Nome}Web/services/{Nome}`, ma indirizzo
  placeholder `localhost`, quindi non rivela endpoint di test/produzione).
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
  ambito — entra in gioco solo con J/L/M/Q/S).
- **Collegamento tabellone `/tracking` ↔ invio reale — deciso di rimandare
  (2026-07-21)**: oggi `inviaDichiarazioneReale` non tocca mai
  `tracking_dichiarazioni` — sono due sistemi separati, la spunta sul
  tabellone resta manuale (`toggleDichiarazione`) anche dopo un invio S2S
  riuscito. **Decisione esplicita dell'utente**: collegare la spunta
  automatica (impostarla quando l'invio reale ha esito positivo) solo
  **quando l'invio in produzione sarà definitivamente operativo** (endpoint
  ADM pubblicato + primo invio reale riuscito), non prima — evita di
  costruire quel collegamento contro un flusso ancora bloccato
  dall'endpoint di produzione non pubblicato.
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

## Cosa è stato costruito — Fase 4, invio S2S: gestione certificato ADM (primo pezzo, verificato in staging)

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

**Endpoint verificati sugli XSD/WSDL ufficiali (ambiente di test)**:
- Invio: `https://platformtest.adm.gov.it/EEsemestraliM24ServiceWeb/services/EEsemestraliM24Service`, SOAP action `http://process.eesemestralim24.domest.sogei.it/wsdl/EEsemestraliM24Service`, `serviceId="invioEnergiaElettricaSemestrale"`
- Recupero esito: `https://platformtest.adm.gov.it/InteropServiceWEB/services/InteropService` (`recuperaEsito(IUT)`)
- Controllo stato: `https://platformtest.adm.gov.it/InteropRServiceWeb/services/InteropRService/selezionaStato/{iut}` (REST)

**Endpoint di produzione — tutti e tre confermati 🎉 (2026-07-30)**: Paolo
ha recuperato la documentazione ufficiale dell'ambiente reale (cartella
`Dichiarazione-semestrale-2026-ambiente-reale`, con manuali, WSDL, XSD **e 4
screenshot del pannello "Servizio"/"Servizi per Stato/Esito" del proprio
account ADM** — questi ultimi si sono rivelati la fonte più autorevole,
correggendo una prima lettura basata solo sul manuale generico):
- **Invio**: `https://platform.adm.gov.it/EEsemestraliM24ServiceWeb/services/EEsemestraliM24Service`
  — confermato sia dal manuale che dallo screenshot del pannello "Servizio"
  dell'account di Paolo, e verificato dal vivo (redirect 302 verso il WSDL
  reale). **Aggiornato in `lib/adm/soap-client.ts`** (`invio` non è più `null`).
- **Controllo stato**: `https://interop.adm.gov.it/InteropRServiceWeb/services/InteropRService/selezionaStato/{iut}`
  — il manuale generico indicava `platform.adm.gov.it` per questo, ma lo
  screenshot del pannello "Servizi per Stato/Esito" del *proprio* account
  ADM mostra esplicitamente `interop.adm.gov.it` — presa come fonte più
  autorevole (config specifica dell'account, non un manuale generico).
  Verificato dal vivo (406 "Dati input non validi" con un IUT fittizio:
  endpoint vivo).
- **Recupero esito**: `https://interop.adm.gov.it/InteropServiceWEB/services/InteropService`
  — stesso ragionamento (screenshot dell'account); `ManualeRecuperaEsito.pdf`
  conferma comunque che **entrambi** i domini (`interop.` e `platform.`)
  sono documentati come validi per questo servizio specifico, quindi non
  c'è contraddizione qui, solo per il controllo stato. Verificato dal vivo
  (redirect 302 verso il WSDL).

**Nota per il futuro**: se un domani uno di questi endpoint smettesse di
rispondere, ricontrollare prima lo screenshot del pannello account
(più specifico) che il manuale generico (può essere disallineato).

**L'invio S2S reale (`inviaDichiarazioneReale`) può ora davvero contattare
ADM** — non è più bloccato dall'errore "endpoint non disponibile". Prossimo
passo naturale: un vero test con un cliente reale (già in programma, vedi
azione di Paolo dalla trascrizione del meeting 27/07: "Test dichiarazione").

**Costruito in questa sessione — gestione certificato di autenticazione ADM**:
- Nuova tabella `certificati_adm` (`supabase/migrations/20260714140001_certificati_adm.sql`,
  **applicata in staging**): un certificato per ambiente
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
  giorni) e form di caricamento/sostituzione.
- **Verificato in staging dall'utente**: caricati file di prova su entrambi
  gli ambienti (test e produzione), confermato che compaiono correttamente
  come "caricato il..." nella UI — il meccanismo di salvataggio
  cifrato/sostituzione funziona end-to-end.
- **Certificati reali ricevuti da Paolo e verificati con OpenSSL**: format
  confermato — `AgenziaDoganeMonopoli.p12` (certificato client, **solo
  ambiente di test**, valido fino al 2027, password condivisa privatamente
  con l'utente e mai committata) va caricato in `/impostazioni` esattamente
  come progettato. I due CA root (`CADoganeTest.pem`/`CADoganeMonopoli.pem`)
  sono **pubblici** (non segreti, autofirmati, validi fino al 2038): copiati
  nel repo come asset statici in `lib/adm/certificati/ca-test.pem` e
  `ca-produzione.pem` (eccezione mirata in `.gitignore`, che ha una regola
  generale `*.pem` per sicurezza — servono come trust anchor TLS per il
  futuro client SOAP). **Manca ancora il certificato client per l'ambiente
  di produzione** (Paolo ha ricevuto solo il CA root per quell'ambiente): fino
  a quando non lo richiede, si può lavorare solo in ambiente di test — va
  benissimo per iniziare.
- **Prossimo pezzo**: il client SOAP vero e proprio (upload XML firmato,
  invio verso l'ambiente di test, recupero esito, generazione PDF/protocollo
  nostri) — ora sbloccato, abbiamo certificato di test + CA root reali.
  Dettagli completi in memoria `project_xml_dogane_ricerca.md`.

## Cosa è stato costruito — Fase 4, invio S2S: client SOAP + sandbox di test (da provare in staging)

Il pezzo che mancava: invio vero e proprio verso ADM. Costruito come
**sandbox isolata con dati fittizi** (nessun impianto/cliente reale
coinvolto, nessuna scrittura su `dichiarazioni_ee_semestrali`) apposta per
validare tutta la catena tecnica prima di collegarla alla dichiarazione
reale — l'utente aveva chiesto esplicitamente di poterla testare così.

- **Client SOAP** (`lib/adm/soap-client.ts` + `lib/adm/soap-envelope.ts`):
  costruisce la busta SOAP, invia via Node `https` con mutua TLS
  (`pfx`/`passphrase`/`ca` — non `fetch`/undici, che non espone comodamente
  il certificato client), interpreta la risposta (successo, SOAP Fault, o
  esito ADM negativo). Logica pura (costruzione busta, parsing, mappa codici
  → categoria) separata in `soap-envelope.ts` apposta per essere testabile
  senza mock di rete/Supabase (`soap-client.ts` ha `import "server-only"`,
  che rompe i test se non isolato). Nuova dipendenza `fast-xml-parser`
  (pura JS, nessun binding nativo).
- **Endpoint implementati**: invio (`EEsemestraliM24Service.process`) e
  controllo stato (`InteropRService/selezionaStato/{iut}`, REST — l'unico
  documentato con un esempio concreto nel manuale ADM). **Non implementato**:
  il recupero della busta ESITO completa via SOAP
  (`InteropService.recuperaEsito`) — la struttura esatta del messaggio non è
  confermata su nessun esempio reale, rischioso costruirla alla cieca;
  rimandato a quando avremo un IUT vero da verificare empiricamente.
- **Gestione errori categorizzata e persistente**, come richiesto
  esplicitamente dall'utente (memoria `project_gestione_errori_invio_adm.md`):
  nuovo componente riusabile `components/shared/errore-persistente-dialog.tsx`
  — un `Dialog` che ignora deliberatamente la chiusura da backdrop/ESC,
  chiudibile solo col bottone "OK, capito". Categorie: certificato, XML
  malformato, rete, esito negativo ADM, altro — mappate dai codici di
  stato/errore ADM documentati nel manuale operativo.
- **Sandbox UI** (`/impostazioni` → "Test invio ADM (dati fittizi)",
  `components/impostazioni/test-invio-adm-section.tsx`): tre passi — genera
  XML fittizio (Quadro A+G con matricole/codice ditta palesemente finti,
  riusa lo stesso generatore di produzione) e scaricalo; carica il file
  firmato con Aruba Sign + codice fiscale del sottoscrittore e invia
  (ambiente di test); controlla lo stato con il IUT ottenuto. Il campo
  "codice fiscale sottoscrittore" non è salvato da nessuna parte per ora
  (va reinserito ogni volta) — deliberato, promuoveremo a impostazione solo
  se si rivela scomodo nell'uso reale.
- **Test**: `lib/adm/soap-envelope.test.ts` (16 test — costruzione busta,
  parsing risposta successo/Fault/esito negativo, categorizzazione errori
  di connessione) e `lib/xml/dichiarazione-test-fittizia.test.ts` (3 test).
  52 test totali nel progetto, tutti verdi.
- **Primo tentativo reale dell'utente: trovato e corretto un bug** — errore
  "unable to get local issuer certificate" al primo invio. Causa: passavo
  esplicitamente il CA root di ADM (`ca-test.pem`) per verificare il
  certificato del server, ma **il server ADM usa un certificato Let's
  Encrypt** (CA pubblica, già fidata di default) — passare un `ca` custom a
  Node **sostituisce** l'elenco di default invece di aggiungersi,
  escludendo così Let's Encrypt. Verificato con `openssl s_client` (Verify
  return code: 0 usando il trust store di sistema) e corretto: rimosso `ca`
  dalle opzioni dell'Agent in `lib/adm/soap-client.ts`, si usa il trust
  store di default di Node. I CA root ADM in `lib/adm/certificati/` restano
  nel repo ma **non sono usati dal codice** (servono verosimilmente per
  altro, es. verificare i *nostri* certificati client — dettagli in memoria
  `project_xml_dogane_ricerca.md`). Confermato anche che il server richiede
  davvero il certificato client (comportamento atteso).
- **Secondo tentativo (dopo il fix sopra): trovato un problema di
  certificato, non di codice** — nuovo errore, TLS alert 43 "unsupported
  certificate" mandato dal server durante l'handshake. Verificato con
  `openssl x509 -noout -text` sul certificato dentro `AgenziaDoganeMonopoli.p12`:
  `Key Usage: critical, Non Repudiation` — questo è l'uso tipico di un
  certificato di **firma**, non di un certificato di **autenticazione TLS**
  (che servirebbe "Digital Signature" e/o Extended Key Usage clientAuth). Il
  server rifiuta correttamente il certificato, seguendo lo standard X.509.
  **Conclusione**: `AgenziaDoganeMonopoli.p12` è quasi certamente il
  "Certificato di Firma UNICO ADM" (menzionato nel manuale, per l'ambiente
  di addestramento) — **non** il "Certificato di autenticazione di
  addestramento" che serve per la mutua TLS. Sono due certificati distinti,
  generabili dalla stessa area PUDM (Gestione Certificati). **Bloccato in
  attesa che Paolo generi/scarichi specificamente il "Certificato di
  autenticazione"** (non quello di firma, che ha già) per l'ambiente di
  addestramento — nessuna modifica di codice necessaria per questo, solo un
  ricaricamento del file giusto da `/impostazioni` quando arriva.

## Fase 4, invio S2S: sandbox validata end-to-end in ambiente di test 🎉

**Traguardo raggiunto**: la sandbox "Test invio ADM" (`/impostazioni`) ha
completato con successo un invio reale verso l'ambiente di addestramento
ADM — **codice 20, "Acquisito a sistema"**, IUT assegnato
(`20260717M24014065490`). Tutta la catena tecnica funziona: certificato di
autenticazione (mTLS) + firma XAdES-BES del contenuto + invio SOAP +
interpretazione esito. Dettaglio di come ci si è arrivati (utile se serve
ripetere per rinnovi/altri operatori) nelle sottosezioni sotto.

### Procedura per il certificato di autenticazione (CSR)

Il "certificato di autenticazione" (distinto dal "certificato di firma" —
vedi sezione precedente) si ottiene sul portale ADM tramite un flusso **CSR
(Certificate Signing Request)**, non un semplice download come per la firma
di test. Trovato nel riquadro "OpenSSL Instructions" di "Certificate
Management" (Area Riservata ADM → Interattivi → Gestione certificati →
"Accedi al servizio in addestramento" per il test, "Accedi al servizio" per
la produzione — stesso identico procedimento in entrambi gli ambienti,
cambia solo il login):

1. Genera chiave privata + CSR in locale (**la chiave privata non va mai
   caricata da nessuna parte**):
   `openssl req -newkey rsa:2048 -nodes -keyout key.der -out req.der -outform DER -subj "/C=IT/O=..../CN=...."`
   (il subject che passiamo viene comunque sovrascritto da ADM con un
   proprio template — non è rilevante cosa mettiamo lì, tranne forse il CN)
2. Carica `req.der` su "Certificate Management", clic "Richiedi
   Certificato", attendi, scarica il `.cer` risultante
3. Converti in `.pem`: `openssl x509 -inform der -in xxxxx.cer -out xxxxx.pem`
4. Combina con la chiave privata locale in un `.p12` protetto da password:
   `openssl pkcs12 -export -inkey key.der -in xxxxx.pem -out certificato.p12 -passout pass:XXXX`
5. Carica il `.p12` su `/impostazioni` con quella password

**Fatto per entrambi gli ambienti**, file locali sul PC di Emilio (**non nel
repo, non committati**):
- Test: `C:\cert\certificato-autenticazione-test.p12` — **caricato su
  `/impostazioni`**
- Produzione: `C:\cert\produzione\certificato-autenticazione-produzione.p12`
  — generato e verificato con OpenSSL (Key Usage/EKU corretti,
  `TLS Web Client Authentication`), **non ancora caricato** su
  `/impostazioni` (nessuna fretta: l'endpoint SOAP di produzione non è
  ancora pubblicato da ADM)

Entrambi verificati con `openssl x509 -noout -ext keyUsage,extendedKeyUsage`
prima di caricarli: `Extended Key Usage: TLS Web Client Authentication` +
`Key Usage: Digital Signature, Key Encipherment` — profilo corretto, a
differenza del certificato di firma sbagliato usato inizialmente per errore
(Key Usage: Non Repudiation, causa del problema precedente).

### Cronologia degli errori superati (utile se ricompaiono su altri operatori/rinnovi)

1. **Codice ADM 16, "Certificato autenticazione non valido"**: comparso
   subito dopo il primo caricamento del certificato di test appena generato
   (handshake mTLS riuscito, IUT assegnato, ma esito negativo). **Si è
   risolto da solo entro qualche ora** (stesso giorno, non serviva aspettare
   fino al giorno dopo) — confermata l'ipotesi di un allineamento
   interno lato ADM tra il servizio "Gestione Certificati" e quello di
   validazione S2S. Nessuna azione nostra necessaria, solo attesa.
   **Escluso come causa** (verificato, non solo ipotizzato): non era un
   problema di come abbiamo costruito il `.p12` (Key Usage/EKU corretti,
   handshake TLS riuscito), né la stessa tabella codici di un altro file
   trovato dall'utente sul sito ADM (`20210715_TabellaErrori.xlsx` — quel
   file è di un servizio ADM completamente diverso, dichiarazioni doganali
   con LRN, non accise energia elettrica con IUT: stessi numeri di codice,
   significati totalmente diversi, coincidenza ininfluente).
2. **Codice ADM 18, "Firmatario non autorizzato"**: comparso subito dopo,
   una volta risolto il 16. Causa: l'XML di test era stato firmato con la
   firma Aruba **personale di Emilio**, non con il certificato di firma
   pensato per questa fase. Il manuale/portale ADM è esplicito: **in fase di
   addestramento va usato il "Certificato di Firma UNICO ADM"** condiviso
   (lo stesso `AgenziaDoganeMonopoli.p12` scambiato per errore come
   certificato di autenticazione all'inizio di questa fase — in realtà era
   corretto, andava solo usato per firmare, non per la connessione TLS).
   Solo più avanti (verso la produzione) serve una firma qualificata reale
   (Aruba). **Non serviva quindi far firmare a Paolo con Aruba per questo
   test** — serviva firmare con il certificato condiviso di addestramento.
3. **Fix pratico**: non avendo un client di firma XAdES-BES che accetti un
   `.p12` arbitrario (Aruba firma solo con la propria identità remota),
   l'utente ha usato **Namirial** (gratuito) per firmare l'XML con
   `AgenziaDoganeMonopoli.p12` — **funzionato al primo colpo**, invio
   accolto con codice 20.
4. **Codice ADM 198, "Elaborazione KO: con esito"** (esito sostanziale
   asincrono, via "Controlla stato"): atteso, dati completamente fittizi
   (CodDitta finto) non registrati presso ADM. **Risolto ripetendo il test
   con un CodDitta reale** (Giorik SPA, `BLE00981R` — da licenza ADM reale
   fornita dall'utente, confermato tramite un file Excel di Paolo: il
   codice sulla licenza scansionata riportava il prefisso "IT00" che va
   scartato) e numeri di produzione/contatori completamente inventati
   (autorizzato esplicitamente — rischio nullo in ambiente di
   addestramento). XML generato con lo script/generatore **vero**
   (`lib/xml/dichiarazione-ee-semestrale.ts`, non quello fittizio), fuori
   dal repo (dati reali del cliente, mai committati). Risultato: **codice
   200, "Elaborazione OK: completata con esito finale"** — il miglior esito
   possibile, catena S2S validata fino in fondo.

**Nota per l'invio reale** (quando si collegherà `dichiarazioni_ee_semestrali`
al client SOAP): il campo `<dichiarante>` della busta SOAP (sandbox: "codice
fiscale sottoscrittore") è distinto dal *richiedente* (titolare del
certificato di autenticazione, stabilito implicitamente dalla connessione
TLS — sempre Paolo). Il *dichiarante* andrà valorizzato con CF/P.IVA del
**cliente finale**, non di Paolo. E soprattutto: **per l'invio reale la
firma dovrà essere quella qualificata vera di Paolo su Aruba** (non più il
certificato condiviso di addestramento, valido solo in quell'ambiente).

**Miglioria di codice fatta durante la diagnosi** (utile a prescindere
dall'esito): il dialog di errore ora mostra sempre il **corpo XML grezzo
completo** della risposta ADM (non solo il codice numerico) e lo **IUT
anche su un invio respinto** (prima veniva scartato silenziosamente se
l'esito non era positivo, bloccando "Controlla stato" anche quando ADM
aveva comunque assegnato un IUT). `lib/adm/soap-envelope.ts`,
`components/shared/errore-persistente-dialog.tsx`,
`components/impostazioni/test-invio-adm-section.tsx`. Test aggiornati (17
su `soap-envelope.test.ts`, 53 totali nel progetto).

## Fase 4, invio S2S: collegamento al flusso reale (da testare in staging)

Costruito subito dopo aver validato la sandbox (sezione precedente): il
client SOAP ormai testato viene ora usato anche dalla dichiarazione reale,
non solo dalla sandbox con dati fittizi/di prova.

- **Migration** `20260720120001_dichiarazione_invio_reale.sql`: aggiunge
  `iut`, `esito_codice`, `esito_descrizione`, `esito_aggiornato_at` a
  `dichiarazioni_ee_semestrali` (testuali, non enum — i codici ADM possono
  cambiare, non vogliamo una migration per ognuno). **Non ancora applicata
  in staging** — va eseguita a mano via SQL Editor come le precedenti.
- **Parser XML inverso** (`parseDichiarazioneEeSemestraleXml` in
  `lib/xml/dichiarazione-ee-semestrale.ts`, + test di round-trip): ricostruisce
  i dati strutturati (Quadro A/G, CodDitta, periodo) rileggendo l'XML **già
  generato e archiviato**, invece di ricalcolarli da letture/contatori — la
  schermata di riepilogo mostra così esattamente ciò che è nel file che
  Paolo ha firmato, anche se nel frattempo qualcosa a DB fosse cambiato.
- **Server actions** (`lib/actions/dichiarazioni.ts`):
  `recuperaRiepilogoDichiarazione` (dati per la schermata di conferma),
  `inviaDichiarazioneReale` (upload XML firmato + dichiarante, invio verso
  ambiente **produzione** — mai addestramento, quello è solo per la
  sandbox), `controllaStatoDichiarazioneReale`, `scaricaRicevutaDichiarazione`.
- **UI**: nuovo componente `components/impianti/invio-dichiarazione-dialog.tsx`
  — schermata di riepilogo pre-invio (requisito raccolto in memoria
  `project_riepilogo_pre_invio_reale.md`, ora implementato): mostra
  impianto/cliente/CodDitta/periodo, campo dichiarante (CF/P.IVA cliente,
  precompilato da `clienti.partita_iva`/`codice_fiscale`), tabella completa
  Quadro A/G mese per mese, upload XML firmato, bottone "Conferma e invia"
  — solo da lì parte la chiamata SOAP vera. Errori mostrati con
  `ErrorePersistenteDialog` (stesso componente della sandbox). In
  `components/impianti/dichiarazione-section.tsx`: nuova colonna
  "IUT/Esito ADM" e bottoni "Invia dichiarazione" (se XML generato ma non
  ancora inviato), "Controlla stato" e "Scarica ricevuta" (se IUT presente).
- **Ricevuta testuale**: dato che S2S non restituisce PDF/protocollo pronti
  (solo XML OUTPUT/ESITO — vedi sezione precedente), la generiamo noi in
  formato simile a quello che ADM dava con l'invio manuale U2S. Formato
  reale fornito dall'utente da un caso storico:
  ```
  IUT EBLE00981R202500001
  RICEVUTO 30/03/2026 11:19
  BLE00981R 2025 BL: dichiarazione acquisita, UADM Veneto 4. Numero di registrazione 2026/A/10010
  ```
  La nostra versione riporta IUT, data/ora (ora quella **ufficiale di ADM**,
  campo `dataRegistrazione` della risposta di invio — prima usavamo l'ora
  locale nostra), CodDitta, periodo ed esito. **Manca il "Numero di
  registrazione"** — vedi punto successivo.

- **`InteropService.recuperaEsito` costruito e testato dal vivo, ma non
  funziona contro il server reale — problema lato ADM, non nostro**.
  Trovato il WSDL reale (fornito dall'utente): richiesta
  `<recuperaEsito xmlns="http://service.ws.sogei.it"><iut>...</iut></recuperaEsito>`,
  risposta `Risposta{IUT, esito?, data? (base64Binary), dataRegistrazione}`
  — implementato in `lib/adm/soap-envelope.ts`
  (`costruisciBustaRecuperaEsito`/`interpretaRispostaRecuperaEsito`,
  + test) e `lib/adm/soap-client.ts` (`recuperaEsitoSoap`). Il campo `data`
  contiene il documento ESITO vero e proprio (sigillato da ADM con firma
  XAdES-BES enveloped, non verificata — non serve per mostrare il contenuto
  all'operatore): struttura verificata scaricando **manualmente da MONET**
  (Area Riservata PUDM → Interattivi → MONET → cerca per IUT → dettaglio →
  icona ESITO) l'esito reale del test Giorik — namespace
  `rendicontazioni.depositifiscali.monopoli.finanze.it`, elenco di
  `<Segnalazione>` con Sezione/Gravità/Descrizione/DatoAtteso/DatoInviato.
  **Il numero di registrazione è lì** (`DatoInviato` della segnalazione con
  `Sezione=PROTOCOLLAZIONE`, es. `2026/A/1733`) — la funzione che lo estrae
  (`numeroRegistrazione` in `soap-envelope.ts`) è pronta e testata.
  **Testato dal vivo contro l'IUT reale di Giorik (ambiente addestramento):
  la chiamata SOAP a `recuperaEsito` viene rifiutata da ADM stessa** con
  `codice 10, "Verifica xsd: fallita"` (riprodotto identico due volte, non
  transitorio). Causa più probabile: il campo `iut` nel WSDL ha un pattern
  che si aspetta **19 caratteri**, ma i IUT reali attuali ne hanno **20** —
  sembra un disallineamento tra il servizio che genera lo IUT e quello che
  dovrebbe rileggerlo, lato ADM, non qualcosa risolvibile lato nostro.
  **Non collegato alla ricevuta reale** per questo motivo — il codice resta
  nel progetto, pronto per quando ADM risolve l'incongruenza (o se la loro
  assistenza confermasse un formato diverso).
- **Scoperta collaterale, poi corretta due volte**: il test con IUT reale ha
  prodotto un warning ADM autentico sul Quadro G (`[00027] Identificativo da
  11 caratteri: PARTITA IVA DISTRTEST01 non corretta`). Prima ipotesi
  (sbagliata): "serve la Partita IVA nazionale del distributore, non il
  codice ditta". **Verificato poi sulle istruzioni ufficiali** (Allegato
  4/Circolare 9/2026, sezione Quadro G): *"deve essere indicato il Codice
  identificativo officina destinataria (**codice accisa/ditta / partita
  IVA / codice fiscale / codice Stato / altro identificativo**)"* — sono
  **tutti formati validi**, "codice accisa/ditta" elencato per primo. Il
  warning si spiega più semplicemente: `DISTRTEST01` è casualmente lungo 11
  caratteri (la lunghezza di una PIVA), il validatore ADM ha probabilmente
  solo provato quel controllo specifico di lunghezza — non significa che
  PIVA sia l'unico formato accettato. **Conclusione corretta**: il "Codice
  Ditta" provinciale del distributore (es.
  `Elenco_Codici_Ditta_e_distribuzione_Spa.pdf` sul sito e-distribuzione.it,
  trovato dall'utente — es. `BLE00474N` per Belluno) resta probabilmente la
  scelta più naturale, non un errore da correggere. Lo schema
  (`idDestinatarioSchema`) accetta già entrambi i formati — nessuna
  modifica di codice necessaria in nessuno dei due casi. Dettaglio completo
  in memoria `project_xml_dogane_ricerca.md`.
- **Non ancora testato in staging**: richiede login (nessuna credenziale
  disponibile in sessione) — build/typecheck/lint/test puliti (60 test),
  verificato che il dev server compila senza errori. Va provato dall'utente
  dopo aver applicato la migration: generare una dichiarazione, cliccare
  "Invia dichiarazione", verificare che la schermata di riepilogo mostri i
  dati giusti, e che il tentativo di invio (verso produzione, endpoint non
  ancora pubblicato) dia l'errore friendly atteso invece di un crash.

## Import letture: supporto screenshot oltre a PDF (da testare in staging)

Richiesta di Paolo (tramite l'utente): oltre al PDF "stampa pagina" di
E-distribuzione, poter caricare anche uno screenshot (es. foto da telefono,
cattura di schermo) quando stampare il PDF non è comodo.

- **`lib/ai/estrai-letture-screenshot.ts`** (nuovo): stesso pattern già
  usato per l'onboarding licenza (`lib/ai/estrai-licenza.ts`) — fetch
  diretto all'API Messages di Anthropic (nessun SDK), prompt che chiede
  POD/matricola/costante K/letture mensili F1/F2/F3 (solo "immessa", stessa
  assunzione già documentata per il parser PDF), risposta validata con zod
  (`lib/validation/screenshot-letture.schema.ts`, campi nullable — l'
  estrazione da immagine non è mai certa al 100%). Riusa `isVisionConfigured`
  da `estrai-licenza.ts` invece di duplicarla.
- **`lib/actions/letture.ts`**: `analizzaPdfLetture` ora fa branch su
  `file.type` — immagine (`image/png|jpeg|webp`) → vision AI, altrimenti →
  parsing regex esistente (invariato). **Tutta la logica a valle è
  condivisa** (lookup contatore per POD, blocco su sostituzione contatore,
  costruzione diff riga per riga, upsert solo dopo conferma): serviva solo
  produrre la stessa forma intermedia (`RisultatoParsingEdistribuzione`) da
  entrambi i percorsi. Nuovo campo `origine: "pdf_stampa" | "screenshot"`
  nel risultato, usato dalla UI per passare l'origine corretta a
  `upsertLetture` (il valore `"screenshot"` esisteva già nel tipo, non
  ancora usato).
- **`lib/actions/documenti.ts`**: `TIPI_CONSENTITI` estesa con
  `image/png|jpeg|webp` (prima solo PDF/TXT) — `caricaDocumento` già
  accettava il tipo `"screenshot_letture"` a livello di parametro/enum SQL,
  semplicemente non era ancora usato da nessun chiamante.
- **UI** (`components/letture/importa-pdf-dialog.tsx`): input file accetta
  ora anche immagini, testo aggiornato per spiegare che uno screenshot è
  letto via IA (meno affidabile del PDF) e va comunque controllato riga per
  riga come già previsto per il PDF — stessa schermata di revisione, nessun
  componente nuovo.
- **Verificato**: typecheck/lint/test puliti (60 test, nessuno nuovo — la
  logica aggiunta è quasi tutta orchestrazione, senza logica pura
  isolabile da testare senza mock della chiamata Anthropic). Dev server
  compila senza errori. **Non testato end-to-end con una vera chiamata
  vision** (richiederebbe login + un impianto/contatore reale in staging —
  `ANTHROPIC_API_KEY` è già configurata su Vercel, non è un blocco) — da
  provare dall'utente con uno screenshot reale.

## Registro letture PDF + ricevuta invio S2S in PDF (da testare in staging)

Costruito nella stessa sessione dell'invio S2S reale, su richiesta
dell'utente che ha fornito due riferimenti reali: un registro letture Mod.
M-bis 36 già compilato (altro cliente, per capire il formato) e la vecchia
dichiarazione PDF U2S di Giorik (frontespizio + Quadro A/G — utile anche
per confermare in modo definitivo, con documento reale, che `BLE00474N` è
il codice giusto per il distributore nel Quadro G).

- **Registro letture** (`lib/pdf/registro-letture-generator.ts`,
  `lib/actions/registro-letture.ts`, UI
  `components/impianti/registro-letture-section.tsx`): PDF costruito da zero
  con `pdf-lib` (non c'era un modulo ufficiale vuoto da riusare come per
  l'F24) — intestazione (ditta, "Codice Ditta" con prefisso `IT00`
  ricostruito, ubicazione, ufficio dogane se disponibile) + tabella annuale
  RIPORTO/12 mesi × matricole contatori, con le letture di registro
  cumulative (`lib/calc/registro.ts`, stessa funzione già usata per la
  dichiarazione). È un libro **annuale**, indipendente dalla periodicità
  della dichiarazione (semestrale dal 2026) — contiene tutti i contatori
  dell'impianto insieme, non solo quelli di un singolo quadro. Visibile
  sulla scheda impianto solo se `ha_registro_letture=true` (stesso
  meccanismo già usato per "Diritto di licenza").
  **Bug reale trovato e corretto**: la prima versione aveva le colonne
  della tabella disallineate — le posizioni x per il testo di intestazione
  ("Mese"/matricole/"Annotazioni") erano calcolate con una logica diversa
  e inconsistente rispetto a quelle delle righe della griglia, e mancava il
  confine finale della colonna "Annotazioni" — risultato: l'etichetta
  "Annotazioni" si sovrapponeva all'ultima colonna dei contatori, e il
  testo di intestazione sforava nella riga "RIPORTO" sotto (moltiplicatore
  errato nel calcolo della baseline). **Trovato dall'utente visivamente**,
  non dai nostri controlli automatici (solo estrazione testo via
  `pdf-parse`, che non rileva disallineamenti). **Verificato dopo il fix
  con un metodo più solido**: rasterizzazione della pagina in PNG con lo
  stesso meccanismo già usato per l'estrazione vision della licenza
  (`lib/pdf/rasterizza-pagine.ts`, `pdf-parse`'s `getScreenshot` — non
  serve `poppler`/`pdftoppm`, utile da riusare per verificare visivamente
  qualunque PDF generato in futuro senza bisogno di aprirlo in staging).
- **Ricevuta invio S2S in PDF** (`lib/pdf/ricevuta-invio-generator.ts`):
  sostituisce il semplice `.txt` di prima. 3 pagine — frontespizio (ditta,
  ubicazione, periodo, IUT, data registrazione, esito ADM) + Quadro A +
  Quadro G (se presente), righe mese×contatore con totali. Stile ispirato
  al vecchio PDF U2S reale, non un modulo ufficiale. `tipo_documento_enum`
  aveva già il valore `'ricevuta'` (non serviva migration) — usato al posto
  di `'protocollo'` per questo caso, più corretto semanticamente.
  `scaricaRicevutaDichiarazione` (`lib/actions/dichiarazioni.ts`) ora
  costruisce questo PDF invece del testo, rileggendo l'XML già archiviato
  (`parseDichiarazioneEeSemestraleXml`) per i dati di Quadro A/G. Stesso
  limite di prima: niente "numero di registrazione" (serve
  `recuperaEsito`, bloccato lato ADM — vedi sezione dedicata).
- **Verificato**: `npm run test` (60 test, nessuno nuovo per i generatori
  PDF stessi — verificati manualmente via script + estrazione testo, non
  con vitest, per lo stesso motivo per cui l'F24 non ha assertion pixel-perfect),
  typecheck e lint puliti.
- **Non ancora testato in staging**: richiede login. Va provato generando
  un registro letture su un impianto con `ha_registro_letture=true` e
  scaricando una ricevuta dopo un invio S2S riuscito.

## Email finale al cliente (brief §5.8, da testare in staging)

Ultimo gap del brief funzionale rimasto aperto dopo il confronto punto-per-
punto con `PROMPT DI SVILUPPO Jouletec1.txt` (fatto su richiesta dell'utente:
"hai ancora il brief iniziale? ci sono aree che non abbiamo ancora
coperto?"). Il brief (§5.8) chiede un bottone che compone e invia al cliente
un'email con dichiarazione+ricevuta+tabellina letture del periodo, dopo che
Paolo ha caricato i file restituiti da ADM.

- **Migration** `20260721090001_dichiarazione_email_cliente.sql`: aggiunge
  `email_cliente_inviata_at timestamptz` a `dichiarazioni_ee_semestrali` —
  distinta da `data_invio` (che traccia l'invio S2S ad ADM): qui si traccia
  l'invio dell'email al cliente finale, un passaggio successivo e separato,
  che può avvenire anche più volte (reinvio). **Non ancora applicata in
  staging** — va eseguita a mano via SQL Editor come le precedenti.
- **`inviaRicevutaClienteEmail`** (`lib/actions/dichiarazioni.ts`): riusa
  `scaricaRicevutaDichiarazione` (genera la ricevuta PDF se non esiste
  ancora, altrimenti quella già archiviata — nessuna duplicazione di
  logica) e l'XML già archiviato (`parseDichiarazioneEeSemestraleXml`) per
  costruire una tabellina HTML con le letture di fine mese (Quadro A/G) da
  riportare sul registro cartaceo. Guard espliciti: niente IUT → errore
  "invia prima via S2S"; cliente senza `referente_email` in anagrafica →
  errore chiaro (stesso pattern di `inviaEmailF24`). Invio via
  `inviaEmail` (`lib/email/client.ts`, wrapper SMTP generico compatibile
  Brevo) con la ricevuta PDF in allegato. Su successo, aggiorna
  `email_cliente_inviata_at`.
- **UI** (`components/impianti/dichiarazione-section.tsx`): nuovo bottone
  "Invia email al cliente" (o "Reinvia..." se già inviata, con data
  visibile sotto), visibile solo quando lo IUT è presente (dichiarazione
  già inviata/accolta via S2S). Conferma esplicita via `window.confirm` con
  l'indirizzo email destinatario mostrato prima dell'invio — mai
  automatico, coerente con "Paolo preme un bottone" del brief e con lo
  stesso pattern di conferma esplicita usato altrove nell'app (F24 "OK
  invio"). L'email del referente (`clienti.referente_email`) è passata come
  prop `clienteEmail` dalla pagina impianto (nuovo campo nel `select` del
  join `cliente`).
- **Credenziali Brevo**: l'utente ha generato la **SMTP key** di Brevo
  (dashboard → SMTP & API → tab SMTP, non la API Key generica — le due non
  sono intercambiabili con `nodemailer`) e impostato le variabili
  `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM` direttamente su
  Vercel Project Settings (confermato dall'utente il 2026-07-21) — mai
  condivise in chat, come da policy di sicurezza del progetto (CLAUDE.md:
  "Mai salvare API key, token o credenziali nel repo").
- **Verificato**: `npx tsc --noEmit`, `npm run test` (60 test, nessuno
  nuovo — l'azione è orchestrazione senza logica pura isolabile, stesso
  motivo di `inviaEmailF24`) e `npm run lint` puliti.
- **Non ancora testato in staging**: richiede login + una dichiarazione con
  IUT valido + un cliente con `referente_email` compilata. Va provato
  dall'utente dopo aver applicato la migration e configurato Brevo (già
  fatto lato Vercel): generare/inviare una dichiarazione via S2S, poi
  cliccare "Invia email al cliente" e verificare che il cliente riceva
  l'email con la ricevuta PDF allegata e la tabellina letture corretta.

## Test invio email + registro letture vuoto via email (da testare in staging)

Due richieste dell'utente subito dopo aver applicato la migration email e
pushato su staging.

- **Test invio email al cliente da `/impostazioni`**
  (`components/impostazioni/test-email-cliente-section.tsx`, nuova azione
  `listaDichiarazioniInviate` in `lib/actions/dichiarazioni.ts`): a
  differenza della sandbox "Test invio ADM" sopra (dati completamente
  fittizi, nessuna riga a DB), questa sezione **usa dati reali** — un menu a
  tendina con tutte le dichiarazioni che hanno già un IUT (accolte da ADM),
  e un bottone che richiama il vero `inviaRicevutaClienteEmail` — utile per
  verificare che Brevo/SMTP funzioni davvero senza dover navigare fino alla
  scheda impianto specifica. Stessa conferma esplicita (`window.confirm` con
  l'indirizzo email mostrato) del bottone equivalente sulla scheda impianto.
  Chiesto esplicitamente all'utente quale delle due letture del requisito
  fosse corretta (email di test generica vs. collegamento al percorso
  reale) — ha scelto la seconda.
- **Registro letture vuoto via email** (brief §5.3: *"Il registro è in
  bianco... Invio via email ai clienti a inizio anno"* — gap identificato
  nell'analisi del brief, la versione già costruita in precedenza è invece
  precompilata con le letture esistenti, utile per uso interno ma diversa
  dal requisito originale): nuova azione
  `inviaRegistroLettureVuotoEmail(impiantoId, anno)` in
  `lib/actions/registro-letture.ts` — stessa intestazione/dati generali
  dell'impianto di `generaRegistroLetture`, ma le 12 celle mensili di ogni
  contatore sono **sempre vuote** (nessuna lettura precompilata, a
  prescindere da cosa c'è già a DB), poi invia il PDF come allegato
  all'email del referente cliente (`inviaEmail`, stesso wrapper Brevo).
  Nuovo bottone "Invia registro vuoto al cliente" in
  `components/impianti/registro-letture-section.tsx`, accanto a "Genera
  registro" (che resta invariato: scarica la versione con le letture già
  inserite, per uso interno di Paolo) — stessa conferma esplicita con
  indirizzo email mostrato. `clienteEmail` passato come nuova prop sia a
  `RegistroLettureSection` che a `DichiarazioneSection` dalla scheda
  impianto (`page.tsx`, nuovo campo `referente_email` nel `select` del join
  `cliente`).
- **Verificato**: `npx tsc --noEmit`, `npm run test` (60 test, nessuno
  nuovo — entrambe le funzioni sono orchestrazione, stesso motivo di
  `inviaEmailF24`/`inviaRicevutaClienteEmail`), `npm run lint` puliti (solo
  il warning noto pre-esistente su `data-table.tsx`).
- **Non ancora testato in staging**: richiede login. Va provato: (1) da
  `/impostazioni`, scegliere una dichiarazione con IUT e cliccare "Invia
  email al cliente"; (2) da una scheda impianto con
  `ha_registro_letture=true`, cliccare "Invia registro vuoto al cliente" e
  verificare che il cliente riceva un PDF con le caselle mensili
  effettivamente vuote (non le letture già inserite).

## Log invii email (da testare in staging)

L'utente ha segnalato che l'email del "registro letture vuoto" non è
arrivata (quella F24 sì), e ha chiesto — giustamente — una sezione per fare
troubleshooting: prima non c'era **nessuna traccia** di un invio
riuscito/fallito una volta chiusa la sessione dell'operatore, solo un toast
che spariva. **Non è stato possibile diagnosticare la causa esatta di
quell'episodio specifico** (nessun log da consultare per quell'invio) — il
codice di `inviaRegistroLettureVuotoEmail` è strutturalmente identico a
quello di `inviaEmailF24` (stesso `inviaEmail`, stesso pattern di
allegato), quindi non è un bug di sbaglio di codice evidente; più probabile
un rifiuto/bounce specifico lato Brevo per quell'indirizzo/invio (da
verificare sul pannello Brevo → Statistiche/Log per quell'orario), oppure
un errore avvenuto **prima** della chiamata email (es. dati mancanti
sull'impianto) il cui toast di errore è passato inosservato. Da ora in poi,
qualunque nuovo tentativo lascia una traccia verificabile.

- **Nuova tabella `email_log`**
  (`supabase/migrations/20260721100001_email_log.sql`, **non ancora
  applicata in staging**): una riga per ogni chiamata a `inviaEmail`, con
  tipo (`f24`/`ricevuta_dichiarazione`/`registro_letture_vuoto`/`altro`),
  destinatario, oggetto, allegati (nomi file), esito (`inviata`/`errore`),
  messaggio di errore se presente, riferimenti opzionali a cliente/impianto.
- **Logging centralizzato in `lib/email/client.ts`**: `inviaEmail` ora
  accetta un `contesto` opzionale (tipo + id cliente/impianto) e registra
  **sempre** l'esito (successo o eccezione SMTP) tramite il client
  service-role, prima di rilanciare l'errore al chiamante — il logging
  stesso non blocca mai né maschera il vero esito (se il logging fallisce,
  viene solo scritto in console). I tre punti di invio esistenti
  (`inviaEmailF24`, `inviaRicevutaClienteEmail`,
  `inviaRegistroLettureVuotoEmail`) passano ora il `contesto` appropriato —
  centralizzato in un solo posto invece di duplicare la scrittura del log in
  ogni azione, così un futuro quarto punto di invio lo eredita gratis.
- **Importante per il troubleshooting futuro**: "inviata" nel log significa
  solo che il server SMTP (Brevo) **ha accettato** il messaggio per la
  consegna — non garantisce che sia arrivato in casella. Se un'email risulta
  "inviata" qui ma il cliente non la riceve, il passo successivo è
  controllare il pannello Brevo (Statistiche → Email → cerca per
  destinatario/orario) per bounce, blocchi spam o problemi di
  autenticazione del dominio mittente (`EMAIL_FROM`).
- **UI**: nuova sezione "Log invii email"
  (`components/impostazioni/log-email-section.tsx`) sotto `/impostazioni`,
  tabella con le ultime 100 righe (data/ora, tipo, destinatario, oggetto,
  allegati, esito — badge rosso con messaggio di errore se fallito). Nuova
  azione `listaLogEmail` (`lib/actions/email-log.ts`).
- **Verificato**: `npx tsc --noEmit`, `npm run test` (60 test, nessuno
  nuovo), `npm run lint` puliti.
- **Verificato in staging dall'utente**: era solo un ritardo di consegna
  lato Brevo, non un errore — l'email del registro vuoto è arrivata poco
  dopo. Nessun bug da correggere. La sezione di log resta comunque utile
  per la prossima volta che càpita un dubbio simile.

## Prossimo tema: import dati storici (clienti/impianti/contatori/letture 2025) — in attesa di Paolo

Il brief (§Fase 1/§5.1) prevedeva esplicitamente *"import dagli Excel
esistenti"* per l'anagrafica (clienti/impianti/partner/contatori), oltre
all'onboarding da licenza PDF già costruito — un gap reale, mai chiuso,
perché finora l'inserimento è stato manuale/da licenza PDF impianto per
impianto. Con ~86 impianti da censire, l'import massivo resta necessario
prima di andare a regime.

**Nessun codice da scrivere ora**: l'utente vuole prima sentire Paolo
Rinaldin per capire cosa può fornire — che formato di file (Excel? CSV?
quanti fogli/file diversi?), quali dati sono già strutturati vs. da pulire
a mano, e se ha anche i **valori letture 2025** da riportare (non solo
anagrafica clienti/impianti/contatori). Il piano di importazione (mapping
colonne, gestione duplicati/aggiornamento vs. creazione, validazione,
UI di anteprima prima di scrivere — stesso pattern già usato per
l'onboarding da licenza PDF e l'import PDF/screenshot letture) si scrive
**dopo** aver visto un file di esempio reale, non prima.

**Prossimo passo**: quando l'utente ha sentito Paolo e ha un file di
esempio, riprendere da qui.

## Correzioni dal meeting Emilio↔Paolo del 27/07/2026 (fatte, da testare in staging)

Paolo ha condiviso l'endpoint di produzione ADM (`interop.adm.gov.it`,
sezione "Fase 4, invio S2S: collegamento al flusso reale" più sopra per il
dettaglio tecnico) e sei correzioni emerse da una sessione di revisione
dell'app insieme a Emilio (trascrizione Google Doc, letta per intero per
contesto aggiuntivo).

1. **Nascosto il campo "codice licenza" dall'anagrafica clienti**
   (`components/clienti/cliente-form.tsx`): era un doppione con
   `impianti.codice_impianto_f24` — un cliente può avere più impianti con
   codici diversi, quindi il dato ha senso solo a livello di impianto. Solo
   rimosso dal form (nessuna migration): il campo `clienti.codice_licenza`
   resta a schema per compatibilità coi dati già inseriti, semplicemente non
   più mostrato/editabile.
2. **Registro letture ricostruito per replicare esattamente il modello
   ufficiale** (`lib/pdf/registro-letture-generator.ts`, riscritto da zero):
   l'utente ha fornito un registro reale (cliente Giorik, Mod. M-bis-36,
   frontespizio + pagine annuali) — estratto il **logo ufficiale
   dell'Agenzia delle Dogane e dei Monopoli** direttamente dal file (un
   `.doc` legacy: niente `soffice`/Word COM disponibile in modo affidabile,
   risolto leggendo i JPEG grezzi dallo stream OLE `Data` con `olefile`
   Python — tecnica utile da ricordare se ricapita un `.doc` da cui estrarre
   immagini). Ora il PDF ha 2 pagine fedeli all'originale: frontespizio
   (logo, "Ufficio delle Dogane di {ufficio}", codice ditta, ubicazione,
   ditta, note legali numerate, protocollo) + pagina annuale (logo, "Serie
   M-bis-Mod.36", tabella misura/matricola/K/Riporto/12 mesi con colonna
   ANNOTAZIONI, firma "per la Ditta"). **Annuale, non triennale** come
   l'originale (richiesto esplicitamente). Il logo (immagine pubblica
   dell'ente) è salvato in `lib/pdf/templates/logo-agenzia-dogane.jpg`.
   "Ufficio delle Dogane di ..." ora legge `impianti.ufficio_amministrativo`
   (non più `attributi_extra.licenza_ufficio_dogane`) — nuovo campo
   obbligatorio richiesto con errore esplicito se mancante, stesso pattern
   di `codice_impianto_f24`. Verificato visivamente via rasterizzazione
   (stessa tecnica già usata per altri PDF generati) — nessun disallineamento.
3. **Riga "Lettura iniziale"** in `/letture/[impiantoId]`
   (`components/letture/letture-table.tsx`): mostra, per ciascun contatore,
   la lettura di registro calcolata al 31/12 dell'anno precedente
   (`letturaRegistro` con lo storico completo — se non c'è storico, ritorna
   semplicemente `lettura_iniziale` così com'è). **Editabile**: se
   l'operatore cambia il valore, al salvataggio aggiorna direttamente
   `contatori.lettura_iniziale` (nuova azione `aggiornaLetturaIniziale` in
   `lib/actions/letture.ts`) — pensato per i contatori nuovi subentrati ad
   anno iniziato, che non hanno storico da cui calcolare automaticamente il
   valore.
4. **Etichette mese con ultimo giorno** ("Gennaio 31", "Febbraio 28/29",
   ecc.): nuova funzione `ultimoGiornoMese` in `lib/calc/registro.ts`
   (gestisce gli anni bisestili), usata sia nella tabella letture in-app sia
   nel registro PDF (che già la usava, essendo stato riscritto per primo —
   estratta lì per essere condivisa invece di duplicata).
5. **Colonna "Tot." per contatore** nella tabella letture: accanto a
   F1/F2/F3 di ciascun contatore, il subtotale F1+F2+F3 di quel contatore
   (riusa `valorePeriodo`, già calcolato per il totale di riga — prima solo
   sommato su tutti i contatori insieme, ora visibile anche per il singolo
   contatore).
6. **Importo fattura nel tracking**: nuova colonna `tracking_fatture.importo`
   (`supabase/migrations/20260727120001_tracking_fatture_importo.sql`, **non
   ancora applicata in staging**), nuova azione `aggiornaImportoFattura`
   (upsert parziale, non tocca `emessa`), input numerico accanto alla
   checkbox "Fattura {anno}" in `components/tracking/tracking-table.tsx`
   (salva su blur). Gap già individuato nella gap-analysis del brief,
   chiuso ora su richiesta esplicita di Paolo.

**Verificato**: `npx tsc --noEmit`, `npm run test` (60 test, nessuno nuovo —
tutte le modifiche sono UI/orchestrazione senza logica pura aggiuntiva
isolabile, tranne `ultimoGiornoMese` che eredita la copertura indiretta
delle funzioni esistenti in `registro.ts`), `npm run lint` puliti (solo il
warning noto). Verificato **visivamente** il nuovo registro PDF (frontespizio
+ pagina annuale) con dati sintetici, rasterizzato a PNG.

**Non ancora testato in staging**: richiede login. Applica la migration
`20260727120001_tracking_fatture_importo.sql`, poi verifica: (1) il form
cliente non mostra più "codice licenza"; (2) un impianto con
`ufficio_amministrativo` compilato genera un registro letture con logo e
struttura corrette (frontespizio + 1 pagina annuale); (3) `/letture/[id]`
mostra la riga "Lettura iniziale" (editabile), le etichette mese con giorno,
e la colonna "Tot." per contatore; (4) `/tracking` permette di inserire un
importo fattura per cliente/anno.

**Punto aperto emerso dalla trascrizione — parzialmente chiarito
(2026-07-27)**: durante un test in ambiente di addestramento è comparso un
avviso relativo al "Quadro L". Controllato l'XSD semestrale reale
(`EnergiaElettricaSemestrale.xsd`, dai file forniti dall'utente in
`OneDrive/.../Webservice2026/Dichiarazione-semestrale-prova/Struttura XSD
dei messaggi EE.zip`): **il Quadro L esiste anche nello schema semestrale**
(`<xs:element name="L" type="UsiEsentiType" minOccurs="0" .../>` — "Usi
Esenti"), **opzionale**. Il nostro generatore (`lib/xml/
dichiarazione-ee-semestrale.ts`) non lo popola (solo Dich/Periodo/A/G,
coerente con la conclusione già in memoria che per il profilo "produzione
rinnovabili uso proprio esente" bastano A+G) — l'avviso è probabilmente solo
informativo, dato che lo stesso identico profilo di dichiarazione (senza L)
ha già raggiunto il miglior esito possibile (**codice 200**) nel test con
CodDitta reale. **Non ancora verificato**: il testo esatto dell'avviso e se
serve davvero compilare L in qualche caso specifico (es. se in futuro un
cliente vende energia a terzi) — il manuale operativo semestrale
(`MANUALE_OPERATIVO_DICHIARAZIONI_EE_SEMESTRALI__PROVA.pdf`, versione
addestramento) è solo procedurale/tecnico (endpoint, autenticazione, firma),
non descrive il contenuto sostanziale dei singoli quadri — quello sta
nell'Allegato 4/Circolare già consultati (`project_xml_dogane_ricerca.md`).
Resta anche da capire se il recupero di questo tipo di esiti/avvisi può
essere automatizzato via software o se debba restare manuale tramite MONET.
Nessuna azione di codice necessaria finché non si chiarisce con Paolo/ADM.

### Riepilogo: dove viene usata la costante K nei calcoli

Richiesto esplicitamente dall'utente. La costante K (`contatori.costante_k`)
è il rapporto di trasformazione del gruppo di misura (tipicamente quello dei
trasformatori di corrente/tensione) — converte tra il valore mostrato dal
contatore fisico ("lettura di registro") e l'energia reale in kWh. Punti
del codice dove entra in gioco:

1. **Anagrafica contatore**: campo editabile (`components/impianti/
   contatore-form.tsx`, validato in `lib/validation/contatore.schema.ts`,
   salvato da `lib/actions/contatori.ts`) — l'unico posto dove K viene
   impostato/modificato direttamente dall'operatore.
2. **Motore di calcolo del registro** (`lib/calc/registro.ts`,
   `letturaRegistro()`): converte i valori mensili reali (F1+F2+F3, kWh) in
   lettura progressiva di registro **dividendo** per K
   (`letturaIniziale + somma/K`). Usato da: la tabella "Letture" in-app
   (riconciliazione + la nuova riga "Lettura iniziale"), il registro letture
   PDF, e la generazione della dichiarazione XML (LettA/LettP per Quadro
   A/G, vedi sotto).
3. **`riconciliazione()`** (stesso file): verifica che la somma dei valori
   mensili reali coincida con (lettura fine periodo − lettura inizio
   periodo) **moltiplicata** per K — il controllo "verificato/non
   verificato" mostrato nella sezione Letture.
4. **Dichiarazione XML EE semestrale** (`lib/xml/
   dichiarazione-ee-semestrale.ts` + `lib/actions/dichiarazioni.ts`): K è un
   dato **richiesto dal tracciato ADM stesso**, non solo un calcolo interno
   — compare come `CostLett` in ogni riga di Quadro A/G, insieme a
   LettA/LettP (calcolate con `letturaRegistro`, quindi ÷K) e DiffLett
   (LettA−LettP, che moltiplicato per K tornerebbe a coincidere col kwh
   reale del mese — stessa relazione descritta nel brief §4.1).
5. **Ricevuta invio S2S in PDF** (`lib/pdf/ricevuta-invio-generator.ts`):
   mostra lo stesso `CostLett` riletto dall'XML archiviato, solo per
   visualizzazione — nessun nuovo calcolo.
6. **Import letture da PDF/screenshot** (`lib/parsers/edistribuzione-pdf.ts`,
   `lib/ai/estrai-letture-screenshot.ts`): il valore di K stampato dal
   distributore viene estratto e incluso nel risultato dell'analisi, ma
   **non viene mai scritto automaticamente** su `contatori.costante_k` — resta
   solo nel risultato dell'analisi, attualmente non mostrato a schermo
   nell'anteprima di import (punto potenzialmente da migliorare in futuro:
   permetterebbe di rilevare se il distributore ha cambiato K, es. dopo un
   cambio di trasformatori, senza dover controllare a mano).

In sintesi: **K non serve solo per la dichiarazione** — è centrale anche
per il calcolo di registro/riconciliazione usato nella sezione Letture e
nel registro letture PDF, oltre a essere un dato obbligatorio del tracciato
XML verso ADM.

## Compliance: Quadro C aggiunto alla dichiarazione XML (2026-07-31)

**Gap di conformità reale, trovato e chiuso**. Verifica approfondita
richiesta esplicitamente dall'utente dopo l'uscita della **Circolare
20/2026** ("chiarimenti dichiarazioni semestrali"), incrociata con
l'Allegato 4 (istruzioni officine, Circolare 9/2026) e l'Allegato 1
(Circolare 6/2026, elenco codici uso).

- **Cosa mancava**: la tabella ufficiale dell'Allegato 4 elenca **A, C, G,
  L** per il profilo "Officina di produzione da fonti rinnovabili uso
  proprio esente" (il profilo tipico dei clienti di Paolo). La Circolare
  20/2026 ha corretto solo un refuso sulla **L** (non richiesta) — non ha
  toccato la **C**, che quindi resta un quadro effettivamente dovuto. Il
  nostro generatore produceva solo A+G: **mancava il Quadro C**
  ("Consumi propri esenti / non sottoposti ad accisa" — cioè l'autoconsumo).
- **Perché non si era notato prima**: la ricerca precedente si era
  concentrata sull'esenzione dal "prospetto J-L-M" (liquidazione
  dell'accisa sulle cessioni a consumatori finali — non applicabile ai
  clienti di Paolo), un discorso distinto e separato dalla *rappresentazione*
  dell'autoconsumo in sé (Quadro C), dovuta a prescindere da eventuali
  vendite a terzi.
- **Perché il test reale precedente (codice 200, il miglior esito
  possibile) non lo aveva rivelato**: il controllo automatico ADM in fase
  di invio verifica principalmente lo schema XSD e alcune regole di
  business, non necessariamente "hai compilato tutti i quadri dovuti per il
  tuo profilo di officina" — quel tipo di completezza sostanziale può
  essere verificato solo in un secondo momento (audit), non bloccante
  all'invio.
- **Come si compila** (Circolare 20/2026, punto 1): quando l'energia per
  uso proprio non è misurata da un contatore dedicato ma calcolata per
  differenza tra produzione e cessione (il caso di Paolo — non c'è un
  contatore "autoconsumo"), **non vanno compilati matricola/letture/
  costante**, solo il **kWh calcolato** per mese. Il valore è esattamente
  l'autoconsumo già calcolato da `autoconsumoMensile()`
  (`lib/calc/registro.ts`), finora usato solo per l'alert a schermo in
  `/letture`, mai scritto nella dichiarazione.
- **Codice uso**: `L2` (Allegato 1, Circolare 6/2026 — "Energia elettrica
  prodotta con impianti azionati da fonti rinnovabili... con potenza
  disponibile superiore a 20 kW, consumata dalle imprese di autoproduzione
  in locali e luoghi diversi dalle abitazioni"). Il vincolo "potenza > 20
  kW" non richiede una verifica impianto per impianto: un impianto ≤20kW
  che non vende a consumatori finali non sarebbe nemmeno tenuto a questa
  dichiarazione (Allegato 4, nota 2) — se un cliente la presenta con questo
  profilo, il suo impianto è per definizione sopra quella soglia.
- **Granularità mensile confermata** (non un valore unico di periodo): sia
  dallo XSD (`ContatoriEsentiType`, stessa struttura per-mese del Quadro A,
  `Mese` `maxOccurs="6"` + `TotaleMese` + `TotaleQuadro`) sia dal testo
  delle istruzioni ("l'unica integrazione [rispetto alle vecchie
  dichiarazioni annuali] è la suddivisione mensile dei consumi").

**Implementato**:
- `lib/validation/dichiarazione-ee.schema.ts`: nuovo `quadroC` (6 mesi,
  ciascuno con solo `kwh`), **obbligatorio** (a differenza di `quadroG` che
  resta nullable per impianti senza contatore di immissione — l'autoconsumo
  invece è sempre applicabile).
- `lib/xml/dichiarazione-ee-semestrale.ts`: `quadroCXml()` — `<Matr></Matr>`
  vuoto (l'elemento resta presente, richiesto dallo XSD, ma
  `matricolaType` ammette stringa vuota), `Tipologia` fissa `L2`, nessuna
  lettura/costante. Ordine elementi corretto per XSD: `Dich, Periodo, A, C,
  G` (C **tra** A e G, non dopo). Parser inverso (`parseDichiarazioneEeSemestraleXml`)
  aggiornato per il round-trip.
- `lib/actions/dichiarazioni.ts`: `quadroC` calcolato come
  `produzioneTot − immissioneTot` per mese, riusando le stesse righe già
  calcolate per A/G (nessuna nuova query). **Guard nuovo**: se l'autoconsumo
  di un mese risulta negativo (immissione > produzione — anomalia nei
  dati, K/lettura probabilmente sbagliati), la generazione si blocca con un
  errore esplicito invece di scrivere un kWh negativo che l'XSD
  rifiuterebbe comunque.
- `components/impianti/invio-dichiarazione-dialog.tsx`: nuova tabella
  Quadro C nella schermata di riepilogo pre-invio (tra A e G).
- `lib/pdf/ricevuta-invio-generator.ts`: nuova pagina Quadro C nella
  ricevuta PDF (tra A e G).
- Test aggiornati: `lib/xml/dichiarazione-ee-semestrale.test.ts` (nuovo
  test sull'ordine A/C/G, Matr vuoto, Tipologia L2, round-trip),
  `lib/xml/dichiarazione-test-fittizia.ts` (quadroC aggiunto ai dati
  fittizi della sandbox `/impostazioni`).
- **Verificato**: `tsc`, `test` (61 test), `lint` puliti. XML generato
  ispezionato manualmente (struttura, ordine elementi, Matr vuoto,
  Tipologia L2, totali) — corretto.

**Non ancora verificato con Paolo/ADM**: questa è la mia lettura tecnica
delle circolari, non una consulenza fiscale — prima di un invio reale con
Quadro C, sarebbe bene una controfirma di Paolo o del suo consulente
fiscale sul codice `L2` e sull'applicabilità a tutti gli impianti del
portafoglio (in teoria uniforme per il profilo "autoconsumo + eccedenza",
ma non verificato caso per caso).

## F24: rimossa la compilazione della sezione anagrafica (2026-07-31)

Richiesta esplicita di Paolo (tramite l'utente): la sezione
"CONTRIBUENTE"/"DATI ANAGRAFICI"/"DOMICILIO FISCALE" del modulo F24 non va
più precompilata — non è mai sicuro con certezza di chi sia effettivamente
la persona tenuta al pagamento, meglio lasciarla in bianco e farla
compilare a mano da chi paga davvero. Resta tutto il resto (sezione
Accise/Monopoli, totali, saldo, data di versamento).

- `lib/pdf/f24-generator.ts`: rimossi `F24ReferenteInput`, il campo
  `referente` da `F24Input`, e tutte le chiamate `drawText`/`drawChars` per
  codice fiscale/cognome/nome/data e comune di nascita/domicilio.
- `lib/pdf/f24-coordinates.ts`: rimosse le coordinate ormai inutilizzate
  (restano in `git log` se mai servisse ripristinarle).
- `lib/actions/f24.ts`: rimossa la validazione `CAMPI_REFERENTE_OBBLIGATORI`
  (bloccava la generazione se mancavano dati anagrafici del referente, ora
  mai usati) — la select su `clienti` per `generaF24` ora prende solo
  `id, ragione_sociale, referente_domicilio_provincia` (quest'ultimo resta,
  serve solo come fallback per la provincia dell'impianto nella sezione
  Accise se `impianti.indirizzo_provincia` non è compilato — non è dato
  anagrafico stampato sul modulo).
- `lib/pdf/f24-generator.test.ts` aggiornato (verifica che il codice
  fiscale non compaia più nel testo estratto dal PDF).
- **Verificato**: `tsc`, `test`, `lint` puliti. PDF generato e
  rasterizzato per controllo visivo — sezione anagrafica vuota, resto
  compilato correttamente.
- **Non toccato**: i campi `referente_*` restano nell'anagrafica cliente
  (form, schema, DB) — potrebbero servire per altro (email al cliente,
  ecc.); rimossa solo la compilazione sul PDF F24.

## Verifica esterna (Energix) su scadenze e periodicità

Paolo ha girato due articoli di Energix
(`dichiarazione-semestrale-di-consumo-per-lenergia-elettrica` e
`istruzioni-dichiarazione-energia-elettrica-i-semestre-2026`), letti e
confrontati con quanto già sapevamo (`project_xml_dogane_ricerca.md`,
`project_dichiarazione_periodicita.md`):

- **Confermato**: passaggio da annuale a semestrale (D.Lgs. 43/2025), invio
  S2S/U2S tramite piattaforma ADM, firma secondo Circolare ADM 6/2022, Quadro
  A/G tra quelli elencati. Nessun conflitto con quanto già costruito.
- **Scadenza I semestre 2026: 1 luglio – 30 settembre 2026** (II semestre: 1
  gennaio – 31 marzo dell'anno successivo). Non avevamo ancora una data
  precisa in memoria — ora sì.
- **Punto da verificare con Paolo, non ancora riconciliato**: gli articoli
  dicono che restano **annuali** solo gli impianti in **cessione totale**
  dell'energia o i soggetti che fanno **vettoriamento/distribuzione**. La
  regola che usiamo nel codice (`impianti.diritto_licenza_dovuto` →
  semestrale, vedi `project_dichiarazione_periodicita.md`) **non è
  formalmente la stessa definizione** — potrebbe coincidere di fatto per gli
  impianti di Paolo, ma non è verificato. **Da chiedere esplicitamente a
  Paolo prima di fidarsi della colonna DB su tutti gli 86 impianti.**
- **Nuovo obbligo dal 2026** (da verificare se rilevante): impianti ≤20kW che
  vendono energia a consumatori finali ora devono dichiarare, prima forse no.

## Nuovo requisito raccolto (non ancora costruito): riepilogo pre-invio reale

L'utente ha chiesto che, quando si costruirà l'invio **reale** (collegamento
tra il client SOAP già validato e `dichiarazioni_ee_semestrali`, non la
sandbox di test), il tasto "Invia" **non** scateni subito la chiamata SOAP:
deve prima mostrare una schermata di riepilogo con tutti i dati effettivi
(Quadro A/G, periodo, contatori/letture, dichiarante) che l'operatore
conferma esplicitamente. Motivo: sono dichiarazioni ufficiali con
conseguenze fiscali/legali reali. Dettagli e "why" completi in memoria
`project_riepilogo_pre_invio_reale.md`. Da rispettare quando si arriva a
quell'incremento (vedi piano `foamy-jumping-manatee.md`).

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
14. **Tabella client con `useState` interno + selettore anno via query string: senza `key` sul componente, cambiare anno non aggiorna la vista** — stesso bug capitato due volte: prima su `LettureTable` (già risolto), poi segnalato dall'utente su `TrackingTable` (spunte/importi fattura restavano quelli del vecchio anno). Causa: la pagina Server Component rifetcha i dati col nuovo `anno`, ma il componente client non viene rimontato — React riusa l'istanza esistente e gli inizializzatori di `useState` non vengono rieseguiti. **Fix consolidato**: qualunque tabella client con stato locale derivato da props che dipendono da un selettore anno/periodo nell'URL deve avere `key={`${anno}-${JSON.stringify(datiRilevanti)}`}` sul componente lato Server Component, per forzare il remount. **Se aggiungi una nuova tabella con selettore anno e stato locale editabile, applica subito questo pattern.**

## Prossimi passi immediati (da fare tu)

Migration applicate, `/impostazioni` verificata in staging, certificato di
test + CA root ADM già caricati e verificati. Quello che resta:

1. ~~Riprova l'invio dalla sandbox~~ **Fatto — catena S2S validata al 100%,
   fino all'accettazione sostanziale definitiva (codice 200)**, sia con
   dati fittizi (fino al codice 20/198) sia con CodDitta reale di un
   cliente vero (fino al 200). Vedi cronologia completa nella sezione "Fase
   4, invio S2S: sandbox validata end-to-end".
1bis. ~~Collega il client SOAP alla dichiarazione reale~~ **Fatto —
   schermata di riepilogo pre-invio, invio verso produzione, controllo
   stato, ricevuta scaricabile**. Vedi sezione "Fase 4, invio S2S:
   collegamento al flusso reale". **Da applicare/testare tu**: esegui la
   migration `20260720120001_dichiarazione_invio_reale.sql` via SQL Editor,
   poi prova il flusso "Genera dichiarazione" → "Invia dichiarazione" su un
   impianto di test in staging. **Endpoint di produzione ora confermato
   (2026-07-30)** — l'invio può davvero raggiungere ADM, non c'è più
   l'errore friendly "endpoint non disponibile" a bloccare il test. Prima
   di un invio con un cliente vero: fai attenzione, è una dichiarazione
   ufficiale con effetti fiscali reali (schermata di riepilogo pensata
   apposta per questo). **Urgente**: la finestra del I semestre 2026 (1
   luglio – 30 settembre) è già aperta.
1bis. ~~Carica anche il certificato di produzione~~ **Fatto** —
   caricato su `/impostazioni` → ambiente di produzione (password
   condivisa privatamente con l'utente, mai nel repo).
1bis. **Chiedi conferma a Paolo sulla regola di periodicità**: verifica se
   "resta annuale solo chi è in cessione totale o fa
   vettoriamento/distribuzione" (fonte Energix) corrisponde davvero a
   `diritto_licenza_dovuto=false` per tutti gli impianti, prima di fidarsi
   della colonna DB in produzione. Vedi sezione "Verifica esterna (Energix)"
   sopra.
2. **Testa il tabellone `/tracking` in staging**: spunta dichiarazione per un
   impianto (1 o 2 semestri a seconda di "Diritto di licenza dovuto") e
   fattura per un cliente, ricarica la pagina e verifica che le spunte
   restino salvate. Cambia anno dal selettore e verifica che il filtro
   partner resti applicato (fix di questa sessione).
3. **Ri-testa l'import PDF letture con una matricola diversa da quella a DB**
   (sostituzione contatore): ora l'import deve **bloccarsi** con un
   messaggio che chiede di creare il nuovo contatore a mano e cessare il
   vecchio, non più solo avvisare e importare comunque.
4. **Testa la generazione della dichiarazione XML in staging**: su un impianto
   di test, compila `codice_impianto_f24` (formato AAA00000A) e
   `codice_distributore_zona` (codice ditta/accisa del distributore, es.
   E-Distribuzione — va reperito, ogni distributore lo pubblica sul proprio
   sito), inserisci letture complete per un semestre su almeno un contatore
   di produzione (e uno di immissione se vuoi testare anche il Quadro G),
   poi vai sulla scheda impianto → "Genera dichiarazione". Se mancano dati,
   vedrai un errore esplicito con l'elenco di cosa manca. **Non inviarlo
   ancora da nessuna parte**: questa dichiarazione (quella reale, non la
   sandbox di test) non è ancora collegata al client SOAP — resta un pezzo
   da fare dopo che il punto 1 avrà validato che l'invio funziona.
5. ~~Configura `ANTHROPIC_API_KEY` su Vercel~~ **Fatto** (confermato
   dall'utente il 2026-07-20) — sia "Importa da licenza PDF" sia il nuovo
   import screenshot letture dovrebbero funzionare, da provare con un caso
   reale.
6. Se un cliente ha più impianti con diritto di licenza di quanti ne entrano
   nel modulo F24 (stimato 6 righe), dimmelo: il codice al momento tronca le
   righe in eccesso, va deciso se passare alla generazione multi-pagina.
7. ~~Quando tutto funziona: dammi conferma esplicita e ti guido nel merge
   staging → main~~ **Fatto (2026-07-30)** — `main` creato, Production
   Branch su Vercel impostato su `main`, dominio custom
   `dichiarazioni.jouletec.it` configurato. Prossimo passo: dare accesso a
   Paolo per farlo sperimentare in produzione.
8. Quando sarete pronti per l'invio reale (non di test), chiedi a Paolo
   anche il **certificato client di produzione** (per ora ha solo il CA
   root di quell'ambiente) — stesso percorso PUDM già usato per quello di
   test.
8bis. **Quando l'invio in produzione sarà definitivamente operativo**
   (endpoint ADM ora confermato — manca solo il primo invio reale
   riuscito): collegare la spunta automatica di `/tracking` a
   `inviaDichiarazioneReale` (decisione esplicita dell'utente il
   2026-07-21, vedi sezione "Fase 4, dichiarazione XML semestrale" — non
   farlo prima del primo invio reale riuscito).
9. (Opzionale) elimina l'utente di test `claude-test@example.com` da
   Supabase Auth Dashboard.
10. ~~Applica la migration `20260721090001_dichiarazione_email_cliente.sql`~~
   **Fatto** (confermato dall'utente il 2026-07-21). Prova il bottone "Invia
   email al cliente" su una dichiarazione con IUT valido e un cliente con
   `referente_email` compilata.
11. **Prova il nuovo test da `/impostazioni`** ("Test invio email al
   cliente") e il nuovo bottone "Invia registro vuoto al cliente" nella
   scheda impianto — vedi sezione dedicata sopra.
12. ~~Applica la migration `20260721100001_email_log.sql`~~ **Fatto** —
   verificato che era solo un ritardo di consegna (email arrivata poco
   dopo), non un errore. La sezione "Log invii email" in `/impostazioni`
   resta comunque disponibile per dubbi futuri.
13. **Applica la migration `20260727120001_tracking_fatture_importo.sql`**
   e prova le sei correzioni dal meeting del 27/07 — vedi sezione dedicata
   sopra per l'elenco completo e cosa verificare per ciascuna.
14. Chiedi a Paolo/ADM chiarimenti sul "Quadro L" (avviso comparso in
   ambiente di addestramento) — vedi punto aperto nella sezione dedicata.

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
- Client SOAP invio ADM + sandbox di test: `lib/adm/soap-client.ts` (orchestrazione, `server-only`), `lib/adm/soap-envelope.ts` (+ `.test.ts`, logica pura), `lib/xml/dichiarazione-test-fittizia.ts` (+ `.test.ts`), `lib/actions/adm-test.ts`, UI: `components/impostazioni/test-invio-adm-section.tsx`, errore persistente riusabile: `components/shared/errore-persistente-dialog.tsx`, CA root ADM: `lib/adm/certificati/`
- Invio S2S reale (collegato alla dichiarazione vera): `parseDichiarazioneEeSemestraleXml` in `lib/xml/dichiarazione-ee-semestrale.ts`, azioni `recuperaRiepilogoDichiarazione`/`inviaDichiarazioneReale`/`controllaStatoDichiarazioneReale`/`scaricaRicevutaDichiarazione` in `lib/actions/dichiarazioni.ts`, UI: `components/impianti/invio-dichiarazione-dialog.tsx` (schermata di riepilogo pre-invio), migration `supabase/migrations/20260720120001_dichiarazione_invio_reale.sql`
- Registro letture PDF: `lib/pdf/registro-letture-generator.ts`, `lib/actions/registro-letture.ts`, UI: `components/impianti/registro-letture-section.tsx`
- Ricevuta invio S2S in PDF: `lib/pdf/ricevuta-invio-generator.ts` (usato da `scaricaRicevutaDichiarazione` in `lib/actions/dichiarazioni.ts`)
- Email finale al cliente (brief §5.8): `inviaRicevutaClienteEmail` in `lib/actions/dichiarazioni.ts`, UI in `components/impianti/dichiarazione-section.tsx`, migration `supabase/migrations/20260721090001_dichiarazione_email_cliente.sql`
- Test invio email da /impostazioni: `listaDichiarazioniInviate` in `lib/actions/dichiarazioni.ts`, UI `components/impostazioni/test-email-cliente-section.tsx`
- Registro letture vuoto via email: `inviaRegistroLettureVuotoEmail` in `lib/actions/registro-letture.ts`, UI in `components/impianti/registro-letture-section.tsx`
- Quadro C (autoconsumo, compliance): `quadroCXml`/`mesiQuadroC` in `lib/xml/dichiarazione-ee-semestrale.ts`, `meseQuadroCSchema` in `lib/validation/dichiarazione-ee.schema.ts`, calcolo in `lib/actions/dichiarazioni.ts` (`generaDichiarazioneSemestrale`)
- Log invii email: logging centralizzato in `lib/email/client.ts`, azione `lib/actions/email-log.ts`, UI `components/impostazioni/log-email-section.tsx`, migration `supabase/migrations/20260721100001_email_log.sql`
- Correzioni meeting 27/07 (registro fedele al modello ADM, lettura iniziale, importo fattura): `lib/pdf/registro-letture-generator.ts` (+ logo in `lib/pdf/templates/logo-agenzia-dogane.jpg`), `components/letture/letture-table.tsx` (+ `aggiornaLetturaIniziale` in `lib/actions/letture.ts`), `ultimoGiornoMese` in `lib/calc/registro.ts`, `aggiornaImportoFattura` in `lib/actions/tracking.ts`, migration `supabase/migrations/20260727120001_tracking_fatture_importo.sql`
- Setup locale: [`README.md`](./README.md)
