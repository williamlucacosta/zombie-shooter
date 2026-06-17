# 🧟 NOTTE DELL'ORDA

Twin-stick shooter 3D a ondate, visto dall'alto con camera angolata, ambientato in un
cimitero maledetto. Costruito con **Three.js** + **postprocessing** (bloom, SMAA,
aberrazione cromatica, vignettatura) e asset 3D/audio professionali CC0.

## Come si gioca

```bash
npm install
npm run dev      # apri http://localhost:5173
```

Build di produzione: `npm run build`, poi `npm run preview`.

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
- **4 armi**: Pistola (infinita), Fucile a pompa (ondata 3), Mitra (ondata 6),
  Magnum perforante (ondata 9) — drop garantiti, munizioni e medikit dai nemici.
- **Gli zombi risalgono dalla terra** (gli scheletri si risvegliano con la loro
  animazione dedicata), sangue, decal, numeri di danno, critici, combo, slow-motion
  sui boss, screen-shake, record persistente.
- **Atmosfera**: luna piena, stelle, nebbia bassa che deriva, lanterne tremolanti,
  lucciole, traccia ambient post-apocalittica e suoni reali (con synth WebAudio
  procedurale di riserva per ogni effetto).

## Crediti asset (tutti CC0 / OFL — nessun obbligo, ma onore al merito)

- **Personaggi e armi**: [Quaternius](https://quaternius.com) — Post-Apocalypse Pack
  (zombi, mutante Big Arm, sopravvissuto Sam, cane, armi) via [poly.pizza](https://poly.pizza)
- **Scheletri e scenografia cimitero**: [Kay Lousberg / KayKit](https://kaylousberg.com) —
  Skeletons Pack + Halloween Bits
- **Texture terreno**: [Poly Haven](https://polyhaven.com) — aerial_grass_rock
- **Audio**: artisticdude (zombi), saturn91 (zomby sfx), kurt (pistole), Tabasco
  (registrazioni fucili), SpringySpringo (ricariche), bart (battito), trazzz123
  (ruggito boss), [Juhani Junkala](https://opengameart.org/users/subspaceaudio)
  ("Post Apocalyptic Wastelands") — tutti da [OpenGameArt](https://opengameart.org);
  suoni UI di [Kenney](https://kenney.nl)
- **Font**: Creepster (SIL Open Font License, Google Fonts)

## Struttura

```
src/config.js   bilanciamento: armi, nemici, ondate, boss, temi
src/assets.js   caricamento GLB/texture + fallback procedurali + animatore
src/audio.js    motore WebAudio: file + synth procedurale, bus volumi, ambiente
src/world.js    arena cimitero, luci, nebbia, cielo
src/effects.js  particelle, decal, traccianti, anelli, numeri danno, shake
src/enemies.js  IA nemici, boss, direttore ondate, proiettili acidi
src/player.js   movimento, armi, scatto, proiettili
src/pickups.js  medikit, munizioni, armi a terra
src/ui.js       HUD e schermate
src/main.js     rendering, post-processing, camera, stati di gioco
tools/          script download asset + smoke/integration test headless
```
