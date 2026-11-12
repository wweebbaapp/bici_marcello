# bici_marcello — Vai Marcello!!!

Web app statica per allenamenti di **interval training in bici**, con video
locale, YouTube o RaiPlay nel riquadro. **Nessun Bluetooth, nessun rullo
interattivo**: l'app fa da guida con tempi, percentuale di FTP, watt target e
cadenza consigliata.

È pensata per essere pubblicata su **GitHub Pages** e usata dal browser.

---

## Struttura di ogni allenamento

Ogni allenamento, preimpostato o personalizzato, è costruito così:

1. **5 minuti** di riscaldamento
2. **5 minuti** alternati: 30" a FTP 50% / 30" di pedalata agile (≥ 90 rpm)
3. **4 serie** di interval training
   - ogni serie ha **almeno 3 ripetizioni**
   - ogni ripetizione = **allungo + recupero di uguale durata**
   - l'allungo è regolabile dal **70% al 100% dell'FTP** (default **85%**)
   - tra una serie e l'altra ci sono **3 minuti** di recupero
4. **5 minuti** di defaticamento

### Preset

| Preset | Ripetizioni/serie | Durata allungo | FTP allungo | Durata totale |
|---|---|---|---|---|
| 30 minuti | 3 | 15" | 85% | 30:00 |
| 45 minuti | 3 | 52" | 85% | 44:48 |
| 1 ora | 3 | 90" | 85% | 1:00:00 |

> Il preset 45 minuti dura 44:48 perché allungo e recupero devono avere la
> stessa durata e i secondi sono interi; il valore più vicino a 45 minuti è
> 52 secondi per allungo.

### Personalizzato

Nel pannello in basso puoi scegliere:

- ripetizioni per serie (minimo 3)
- durata dell'allungo (il recupero dentro la serie dura lo stesso tempo)
- percentuale FTP dell'allungo (70% – 100%)

La struttura fissa (5' + 5' + 4 serie + 3' tra le serie + 5') resta quella
richiesta. Il totale viene ricalcolato e mostrato in tempo reale.

L'**FTP in watt** si imposta in alto a destra: serve solo a trasformare la
percentuale in watt target (es. FTP 250 W × 85% = 213 W). Non serve alcun
sensore: è un riferimento per la pedalata.

---

## Video

Nel riquadro video puoi:

- **caricare un video dal PC** con il selettore file (si apre il menu sfoglia);
- **incollare un link YouTube** e incorporarlo direttamente;
- **incollare un link RaiPlay** (vedi nota sotto);
- incollare un qualsiasi altro link: viene caricato in un iframe con il
  pulsante **Apri** come fallback.

### Nota su RaiPlay

YouTube funziona bene con l'incorporamento. **RaiPlay spesso blocca l'iframe**
(protezioni del player, DRM, limitazioni geografiche). Per questo l'app mostra
sempre il pulsante **↗ Apri**: se il riquadro resta vuoto, apri il video in una
nuova scheda e lascialo in riproduzione. L'allenamento funziona comunque.

---

## Motivazione

- **“Vai Marcello!!!”** è nel logo, nel banner e come watermark sul video.
- Durante gli allunghi ad alta intensità (≥ 80% FTP) compaiono messaggi
  casuali tipo **“Marcello non mollare!!!”**, oltre a frasi scherzose.
- I messaggi ruotano ogni 12 secondi durante gli allunghi.
- I segnali sonori (beep) indicano i cambi di fase; puoi disattivarli con
  **🔔 Audio**.

---

## Provarla in locale

Le app con moduli ES non funzionano aprendo `index.html` con doppio clic
(`file://`). Serve un piccolo server locale:

```bash
cd /Users/agente/bici_marcello
python3 -m http.server 8030
```

Poi apri:

```
http://localhost:8030
```

---

## Pubblicazione su GitHub Pages

1. Crea un repository su GitHub (es. `bici_marcello`).
2. Carica **il contenuto di questa cartella** nella radice del repository
   (`index.html`, `styles.css`, `js/`, `sw.js`, `manifest.webmanifest`,
   `icon.svg`, `.nojekyll`).
3. Vai su **Settings → Pages**.
4. In **Build and deployment** scegli **Deploy from a branch**.
5. Seleziona il branch **main** e la cartella **/ (root)**, poi **Save**.
6. Dopo qualche minuto l'app sarà online su:

```
https://TUO-UTENTE.github.io/bici_marcello/
```

Tutti i percorsi sono relativi, quindi funziona anche in una sottocartella del
sito GitHub Pages. Il file `.nojekyll` evita l'elaborazione Jekyll.

---

## File

```
bici_marcello/
├── index.html              interfaccia
├── styles.css              stile
├── manifest.webmanifest    installazione come web app (PWA)
├── sw.js                   service worker per l'uso offline
├── icon.svg                icona
├── icon-192.png            icona PWA 192×192
├── icon-512.png            icona PWA 512×512
├── .nojekyll               per GitHub Pages
├── README.md
└── js/
    ├── app.js              logica: timer, UI, video, audio, timeline
    ├── workout.js          costruzione allenamenti e preset
    └── messages.js         frasi del coach
```

---

## Personalizzare

- **Preset e struttura**: `js/workout.js` (`FIXED`, `PRESETS`, `buildWorkout`).
- **Messaggi del coach**: `js/messages.js`.
- **Colori e layout**: `styles.css`.
- **Video e incorporamenti**: funzione `resolveEmbed()` in `js/app.js`.

Se modifichi i file e l'app sembra usare la versione vecchia, alza il numero di
versione in `sw.js` (`const CACHE = "bici-marcello-v2";`) oppure svuota i dati
del sito dal browser.
