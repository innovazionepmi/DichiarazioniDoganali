CLAUDE.md – Governance & Workflow Standard
Stack Tecnologico

Frontend: React
Database: Supabase
Deployment: Vercel
Domain: Dominio di terzo livello personalizzato (DNS custom su Vercel), es. progetto.tuodominio.com


Variabili d'Ambiente
Tutte le configurazioni sensibili e le dipendenze critiche vanno gestite tramite variabili d'ambiente, mai hardcodate nel codice.
Template .env.example
# Anthropic API
ANTHROPIC_MODEL=claude-3-5-sonnet
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Vercel (automatico)
VERCEL_ENV=production

# Integrazioni esterne (se applicabili)
HUBSPOT_API_KEY=pat-...
META_ACCESS_TOKEN=...
GOOGLE_DRIVE_API_KEY=...
Nota: Configurare tutte le variabili sensibili direttamente in Vercel Project Settings. Il file .env.example rimane in repo senza valori reali.

Branching Strategy
Branch Main

Scopo: Produzione live
Accesso: Deploy automatico via Vercel al push
Protezione: Nessun push diretto, solo merge da staging dopo validazione

Branch Staging

Scopo: Ambiente di sviluppo e test
Accesso: Ricezione di tutte le modifiche durante lo sviluppo
Workflow: Tutte le modifiche vanno su staging. Una volta completate e testate, si procede al merge su main


GitHub Workflow
Flusso Operativo

Claude Code effettua modifiche al codice sul branch staging
Al termine di ogni modifica, Claude Code fornisce i comandi Git da eseguire da terminale (tu li esegui manualmente)
Tu pushei su staging usando i comandi forniti
Dopo aver testato tutto in staging, Claude Code ti chiede: "Hai testato tutto e tutto funziona correttamente?"
Ricevuta conferma, Claude Code ti guida nel merge da staging a main con i comandi specifici
Vercel effettua il deploy automatico su main

Comandi Standard Forniti
Esempio di comandi che Claude Code ti darà:
bashgit checkout staging
git add .
git commit -m "feat: descrizione della modifica"
git push origin staging
Dopo validazione in staging, per il merge su main:
bashgit checkout main
git pull origin main
git merge staging
git push origin main
Importante: Tu sei sempre responsabile dell'esecuzione. Claude Code non pushea direttamente.

Naming Convention
Branch

Feature: feature/nome-feature
Bug fix: fix/nome-bug
Refactoring: refactor/nome-refactoring

Commit Messages

feat: descrizione breve
fix: descrizione breve
refactor: descrizione breve
docs: descrizione breve

Formato: tipo: descrizione (massimo 50 caratteri nella prima riga)

Testing Protocol
Prima di mergare su main da staging:

Validazione manuale di tutte le modifiche in ambiente staging
Verifica funzionalità: tutte le feature devono funzionare come previsto
Controllo performance: nessuna regressione visibile
Conferma esplicita prima del merge a main


Monitoraggio Deprecazioni
Variabili Critiche da Monitorare

Modelli Anthropic (ANTHROPIC_MODEL): monitora changelog ufficiale Anthropic per deprecazioni
Dipendenze npm: controlla package.json per versioni outdated
API esterne: tieni traccia di eventuali breaking changes da HubSpot, Meta Ads, Google Drive, Supabase

Automazione n8n Centralizzata
Crea un'automazione che:

Monitora il changelog Anthropic ufficiale per deprecazioni di modelli
Legge le variabili d'ambiente di tutti i tuoi progetti (da repo o da documento centralizzato)
Incrocia i dati e ti notifica quando un modello in deprecazione è usato in una delle tue app
Anticipo minimo consigliato: 1 mese prima della deprecazione effettiva


Secrets Management

Mai salvare API key, token o credenziali nel repo
Sempre usare variabili d'ambiente su Vercel Project Settings
.env.example rimane in repo come template, senza valori reali
.env.local rimane in .gitignore per lo sviluppo locale


Design System
Una volta definiti gli obiettivi visivi del progetto, puoi usare Claude Design per creare un design system personalizzato che stabilisce:

Palette colori
Tipografia
Componenti UI standard
Brand guidelines

Passa il design system generato al codice per un look and feel coerente e personalizzato.

Ultima modifica: 10/07/2026
Versione: 1.0
