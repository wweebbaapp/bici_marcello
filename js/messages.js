// Messaggi del "coach" per tenere alta la motivazione di Marcello.
// Tono scherzoso, mai cattivo: l'allenamento deve restare divertente.

const SURGE_MESSAGES = [
  "Marcello non mollare!!!",
  "Dai Marcello, spingi!!!",
  "Marcello, questa è la tua serie!",
  "Sei una bestia, Marcello!",
  "Non guardare i watt: guarda la gloria!",
  "Il divano ti sta guardando. Deludilo!",
  "Marcello, metti il turbo!",
  "La salita non si arrende, ma tu nemmeno!",
  "Pedala come se ci fosse il gelato alla fine!",
  "Ancora un po', campione!",
  "Marcello, la gamba gira che è una meraviglia!",
  "Soffri un po', sorridi dopo!",
  "La borraccia ti aspetta, ma prima dai tutto!",
  "Marcello, sei tu il motore!",
  "Questa ripetizione non si vince da sola!",
  "Forza Marcello, il cronometro trema!",
  "Marcello, sudore oggi, medaglia domani!",
  "Spingi che poi te la raccontiamo al bar!",
];

const RECOVERY_MESSAGES = [
  "Respira, Marcello. Tra poco si torna a spingere.",
  "Recupero tattico: bevi e non pensare ai watt.",
  "Marcello, recupera... ma non troppo comodo!",
  "Agile e leggero: il prossimo allungo si avvicina.",
  "Rilassa le spalle, riempi i polmoni, sorridi.",
  "Questa pausa è un investimento: falla rendere.",
  "Marcello, la calma prima della tempesta.",
  "Gambe leggere, testa alta. Si riparte.",
];

const FINISH_MESSAGES = [
  "Allenamento completato! Marcello sei una leggenda!",
  "Fatto! Marcello ha steso anche oggi il cronometro.",
  "Grande Marcello! Il divano può aspettare.",
  "Allenamento finito. Meriti un applauso (e un panino).",
  "Missione compiuta, Marcello! Le gambe ringraziano.",
];

const IDLE_MESSAGES = [
  "Pronto a spingere, Marcello?",
  "Oggi si pedala. Vai Marcello!!!",
  "Scegli un allenamento e facciamo girare queste gambe.",
  "Marcello, il divano non ti merita. Vai!",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function surgeMessage() {
  return pick(SURGE_MESSAGES);
}

export function recoveryMessage() {
  return pick(RECOVERY_MESSAGES);
}

export function finishMessage() {
  return pick(FINISH_MESSAGES);
}

export function idleMessage() {
  return pick(IDLE_MESSAGES);
}

export function countdownMessage() {
  return pick([
    "Mancano pochi secondi: tieni duro!",
    "Ultimi secondi, Marcello!",
    "Non lasciare proprio ora!",
  ]);
}
