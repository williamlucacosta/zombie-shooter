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
- **Hub + zone sbloccabili**: il cimitero centrale è circondato da 3 ambienti tematici
  dietro porte a pagamento — **LA CRIPTA**, **LA CHIESA IN ROVINA**, **IL BOSCO DEGLI
  IMPICCATI** — ognuno con terreno PBR realistico, luci, nebbia e atmosfera propri. Uccidere
  frutta **Anime** (valuta separata dal punteggio): spendile (tasto **E** vicino al cancello)
  per aprire nuove aree. Più stanze apri, **più l'orda diventa folta, veloce e letale** —
  rischio/ricompensa. L'area giocabile e l'atmosfera si espandono man mano che avanzi.
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

- **Giocatore (soldato)**: "Vanguard" di T. Choonyung via [Adobe Mixamo](https://www.mixamo.com),
  ridistribuito negli esempi di [three.js](https://github.com/mrdoob/three.js) — three.js MIT,
  mesh Mixamo (royalty-free per uso commerciale)
- **Zombi base (camminatore/corridore)**: **"Zombie Hazmat" di LxNazarov**
  ([Sketchfab](https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04)) —
  **CC BY 4.0** (attribuzione richiesta)
- **Camminatore realistico**: **"Zombie (Rigged & Animated)" di Aiden Studios**
  ([Sketchfab](https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa)) —
  **CC BY 4.0** (attribuzione richiesta). Scaricato via Download API ufficiale di Sketchfab.
- **Corridore (9 animazioni: corsa/attacchi/morte/urlo)**: **"Zombie Fantasy Animated" di Larnox**
  ([Sketchfab](https://sketchfab.com/3d-models/zombie-fantasy-animated-4e966d5df4e54260b69487919dbe7660)) —
  **CC BY-NC 4.0** (attribuzione richiesta · **uso non commerciale**)
- **Pistola (Glock-17 animata, clip sparo/ricarica)**: **"Glock-17 Animated (Free)" di BarcodeGames**
  ([Sketchfab](https://sketchfab.com/3d-models/glock-17-animated-free-ab6ce788574147ce92b73d49915c123f)) —
  **CC BY 4.0** (attribuzione richiesta)
- **Mitra (KRISS Vector animato, clip sparo/ricarica)**: **"Kriss Vector Animated (Free)" di BarcodeGames**
  ([Sketchfab](https://sketchfab.com/3d-models/kriss-vector-animated-free-54530c888cfd4ae7aab3c3852b229c7e)) —
  **CC BY 4.0** (attribuzione richiesta). Stesse mani guantate del Glock (stessa serie).
- **Magnum (Mark 23 animato, clip sparo/ricarica)**: **"Mark 23 Animated (Free)" di BarcodeGames**
  ([Sketchfab](https://sketchfab.com/3d-models/mark-23-animated-free-7abebe340aca4f46b36368417b3ca920)) —
  **CC BY 4.0** (attribuzione richiesta). Stesse mani guantate del Glock (stessa serie).
- **Fucile a pompa (viewmodel FPS animato: braccia+mani+arma, ricarica a colpo singolo)**:
  **"FPS Arms remington (shotgun)" di Cransh**
  ([Sketchfab](https://sketchfab.com/3d-models/fps-arms-remington-shotgun-e68ef617fe8a48cca8610d016ffd5881)) —
  **CC BY 4.0** (attribuzione richiesta). Idle/cammina/sparo/ricarica; la mano carica i pallettoni uno a uno.
- **Brute / Boss (Mutant realistico, 13 animazioni di combattimento)**: "Mutant" di [Adobe Mixamo](https://www.mixamo.com)
  (mesh + animazioni + texture creatura) — Mixamo royalty-free per uso commerciale. Crepe rese emissive nel gioco.
- **Crawler (lupo che carica)**: **"Wolf with Animations" di 3DHaupt**
  ([Sketchfab](https://sketchfab.com/3d-models/wolf-with-animations-f3769a474a714ebbbaca0d97f9b0a5a0)) —
  **CC BY-NC 4.0** (attribuzione richiesta · **uso non commerciale**)
- **Altri personaggi**: [Quaternius](https://quaternius.com) — Post-Apocalypse Pack
  (cane/hound; Big Arm e strisciante come ripieghi) via [poly.pizza](https://poly.pizza) — CC0
- **Scheletri e scenografia cimitero**: [Kay Lousberg / KayKit](https://kaylousberg.com) —
  Skeletons Pack + Halloween Bits — CC0
- **Texture terreno/zone (PBR realistiche)**: [Poly Haven](https://polyhaven.com) — aerial_grass_rock,
  forrest_ground_01, cobblestone_floor_08, rock_wall_10, weathered_planks (diffuse+normale+rugosità) — CC0
- **Props ambientazione realistici (PBR)**: [Poly Haven](https://polyhaven.com) — dead_tree_trunk +
  dead_tree_trunk_02 (tronchi caduti), tree_stump_01, boulder_01, rock_07, rock_moss_set_01,
  wooden_lantern_01, marble_bust_01 — CC0. Lapidi, mausolei e plinti delle statue sono geometria
  PBR procedurale (materiale rock_wall_10). Scaricabili con `tools/download-ph-models.mjs`.
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
- **Sparo del fucile a pompa** e **inserimento bossoli** (ricarica a colpo singolo): registrazioni
  reali di Joseph Sardin / [BigSoundBank](https://bigsoundbank.com) ("Shotgun: Shots",
  "Pistolet, chargement", rielaborate) — CC0
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
