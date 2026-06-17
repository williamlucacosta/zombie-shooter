# 🧟 NOTTE DELL'ORDA

Twin-stick shooter 3D a ondate, visto dall'alto con camera angolata, ambientato in un
cimitero maledetto. Costruito con **Three.js** + **postprocessing** (bloom, SMAA,
aberrazione cromatica, vignettatura) e asset 3D/audio professionali CC0.

## Come si gioca

```bash
npm install
npm run dev      # apri http://localhost:3210
```

Build di produzione: `npm run build`, poi `npm run preview`.
Pagina di sviluppo per provare i suoni: `http://localhost:3210/audios`.

| Comando | Azione |
|---|---|
| **WASD / frecce** | Movimento |
| **Mouse** | Mira e fuoco |
| **Shift / Spazio** | Scatto (2 cariche, con invulnerabilità) |
| **R** | Ricarica |
| **1–4 / rotella** | Cambio arma |
| **Esc** | Pausa (volumi regolabili) |

## Caratteristiche

- **Ondate infinite a tema**: ogni ondata ha nome, palette e potenza propri
  ("I Famelici", "I Putrefatti", "Notte di Sangue"…) — gli zombi cambiano colore,
  occhi luminosi e statistiche.
- **6 tipi di nemico**: Camminatore, Corridore, Strisciante (senza gambe!), Segugio
  infernale, Bruto mutante, Sputatore scheletrico (a distanza). Élite potenziate
  dall'ondata 7.
- **Boss ogni 5 ondate**: IL CARNEFICE (carica + schianto), L'EVOCATORE (evoca
  servitori + raffica acida), IL DIVORATORE (tutte le abilità), con barra vita
  dedicata e telegrafi a terra.
- **4 armi col modello in mano**: Pistola (infinita), Fucile a pompa (ondata 3),
  Mitra (ondata 6), Magnum perforante (ondata 9) — l'arma equipaggiata è impugnata
  e punta verso la mira; drop garantiti, munizioni e medikit dai nemici.
- **4 difficoltà** (Facile / Normale / Difficile / Incubo): scalano vita, velocità
  e danno dei nemici, densità dell'orda e vita del giocatore — ma soprattutto il
  **dash** (cariche, ricarica, invulnerabilità), così a Incubo schivare diventa una
  risorsa rara da dosare con precisione.
- **Temporali realistici occasionali**: scrosci di pioggia spinti dal vento, schizzi
  a terra, cielo che si fa cupo, fulmini con lampo a scatti e tuono ritardato dalla
  distanza. Alcune ondate (e certi boss) si combattono sotto l'acqua.
- **Gli zombi risalgono dalla terra** (gli scheletri si risvegliano con la loro
  animazione dedicata), sangue, decal, numeri di danno, critici, combo, slow-motion
  sui boss, screen-shake, record persistente.
- **Atmosfera**: luna piena, stelle, nebbia bassa che deriva, lanterne tremolanti,
  lucciole, riverbero a convoluzione su spari e impatti, e gunshot da registrazioni
  reali (con synth WebAudio procedurale di riserva per ogni effetto).

## Crediti asset (CC0 salvo dove indicato)

- **Personaggi e armi**: [Quaternius](https://quaternius.com) — Post-Apocalypse Pack
  (zombi, mutante Big Arm, sopravvissuto Sam, cane, armi) via [poly.pizza](https://poly.pizza) — CC0
- **Scheletri e scenografia cimitero**: [Kay Lousberg / KayKit](https://kaylousberg.com) —
  Skeletons Pack + Halloween Bits — CC0
- **Texture terreno**: [Poly Haven](https://polyhaven.com) — aerial_grass_rock — CC0
- **Spari (registrazioni reali premium)**: Still North "Free Firearm Sound Library"
  ([buddingmonkey/FreeFirearmsSFXLibrary](https://github.com/buddingmonkey/FreeFirearmsSFXLibrary)) —
  Walther PPQ, Mossberg, AR-15, Smith & Wesson 642 — CC0
- **Ricariche** (pistola/fucile/pompa), **impatti su carne · critici · splatter**, **sputo**,
  **whoosh dello scatto**, **grugniti di dolore**, **raccolta oggetti/armi**, **inizio ondata**:
  pacchetti CC0 da [OpenGameArt](https://opengameart.org) (rubberduck "100 CC0 SFX",
  Independent.nu "wet squish impacts", "Swishes", "water/splash/slime", "Handgun/Gun reload",
  "male strain/hurt", "Oldschool Horror Theme") — CC0
- **Tuoni/fulmini** ("Storm thunderbolts") e **schianto del boss** (esplosione): registrazioni
  reali da [Wikimedia Commons](https://commons.wikimedia.org) — Pubblico Dominio
- **Pioggia**: Ylmir "Rain (loopable)" — CC0; **Passi**: TinyWorlds "Different steps" — CC0;
  **Musica** "The Surreal Truth" di Joth — CC0; **ruggito boss** di trazzz123 — CC0;
  **voci zombi/battito** da artisticdude, saturn91, SpringySpringo, bart — CC0;
  **suoni UI e jingle "ondata completata"** di [Kenney](https://kenney.nl) — CC0; da [OpenGameArt](https://opengameart.org)
- **Font**: Creepster — SIL Open Font License (Google Fonts)

Tutti gli asset audio sono ora **CC0 o Pubblico Dominio**: nessun obbligo di attribuzione.

## Struttura

```
src/config.js   bilanciamento: armi, nemici, ondate, boss, temi, difficoltà
src/assets.js   caricamento GLB/texture (con risorse differite) + animatore
src/audio.js    motore WebAudio: file OGG + synth, riverbero, bus volumi, pioggia
src/world.js    arena cimitero, luci, nebbia, cielo
src/rain.js     pioggia, schizzi, fulmini e tuoni
src/effects.js  particelle, decal, traccianti, anelli, numeri danno, shake
src/enemies.js  IA nemici, boss, direttore ondate, proiettili acidi
src/player.js   movimento, armi, scatto, proiettili
src/pickups.js  medikit, munizioni, armi a terra
src/ui.js       HUD e schermate
src/main.js     rendering, post-processing, camera, stati di gioco
tools/          script download asset + smoke/integration test headless
```
