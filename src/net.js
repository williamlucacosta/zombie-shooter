// ====================== RETE CO-OP (P2P via PeerJS/WebRTC) ======================
// Uno OSPITA (host) e ottiene un CODICE STANZA; l'altro ENTRA inserendolo → connessione WebRTC
// DIRETTA tra i due browser (nessun server di gioco da mettere online). PeerJS fa solo la
// "segnalazione" iniziale tramite un broker gratuito; i dati di gioco viaggiano peer-to-peer.
//
// Questo è il LIVELLO DI TRASPORTO puro: host()/join(), send(), on()/onMessage(). La logica di gioco
// (sincronizzazione giocatori, orda, combattimento) ci si appoggia sopra con messaggi tipizzati {t,...}.
//
// Modello scelto: HOST-AUTORITATIVO — chi ospita fa girare la simulazione vera (zombi, ondate,
// collisioni, pickup) e la trasmette; chi entra manda input/stato del proprio giocatore. Così i due
// vedono la STESSA orda e non si desincronizzano.

import { Peer } from 'peerjs';

// prefisso di namespace: riduce le collisioni di codice sul broker pubblico condiviso con altre app.
const PREFIX = 'notteorda-v1-';
// alfabeto senza caratteri ambigui (niente I/O/0/1/L) → codici facili da dettare a voce.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return s;
}

class NetManager {
  constructor() {
    this.peer = null;       // Peer PeerJS (segnalazione)
    this.conn = null;       // DataConnection col peer remoto (dati di gioco)
    this.role = null;       // 'host' | 'client' | null
    this.code = null;       // codice stanza
    this.connected = false; // canale dati aperto
    this._handlers = {};    // evento -> [cb]  (ready|connect|disconnect|error)
    this._msg = {};         // tipo messaggio -> cb  (per messaggi {t:'...'})
  }

  on(ev, cb) { (this._handlers[ev] || (this._handlers[ev] = [])).push(cb); return this; }
  _emit(ev, ...a) { (this._handlers[ev] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } }); }
  /** Registra il gestore per un tipo di messaggio di gioco ({t:type,...}). */
  onMessage(type, cb) { this._msg[type] = cb; return this; }

  isHost() { return this.role === 'host'; }
  isClient() { return this.role === 'client'; }
  active() { return this.role !== null; }

  /** Crea una stanza e restituisce il codice da condividere. Emette 'ready'(code) quando il broker è pronto. */
  host() {
    this.reset();
    this.role = 'host';
    this.code = randomCode();
    this.peer = new Peer(PREFIX + this.code, { debug: 1 });
    this.peer.on('open', () => this._emit('ready', this.code));
    this.peer.on('connection', (conn) => this._bind(conn)); // l'amico si è connesso
    this.peer.on('error', (e) => this._emit('error', e));
    return this.code;
  }

  /** Entra nella stanza `code`. Emette 'connect' quando il canale dati è aperto. */
  join(code) {
    this.reset();
    this.role = 'client';
    this.code = String(code || '').trim().toUpperCase();
    this.peer = new Peer({ debug: 1 }); // id casuale per chi entra
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, metadata: { game: 'notteorda' } });
      this._bind(conn);
    });
    this.peer.on('error', (e) => this._emit('error', e));
  }

  _bind(conn) {
    this.conn = conn;
    conn.on('open', () => { this.connected = true; this._emit('connect'); });
    conn.on('data', (m) => {
      if (m && m.t && this._msg[m.t]) this._msg[m.t](m);
      this._emit('message', m);
    });
    conn.on('close', () => { this.connected = false; this._emit('disconnect'); });
    conn.on('error', (e) => this._emit('error', e));
  }

  /** Invia un oggetto (serializzato da PeerJS). No-op se non connessi. */
  send(obj) {
    if (this.conn && this.connected) { try { this.conn.send(obj); } catch { /* canale chiuso */ } }
  }

  reset() {
    try { if (this.conn) this.conn.close(); } catch { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* ignore */ }
    this.peer = null; this.conn = null; this.role = null; this.code = null; this.connected = false;
  }
}

export const Net = new NetManager();
