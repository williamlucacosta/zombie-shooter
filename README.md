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
- **Orda di zombi (camminatore/corridore/strisciante/brute)** — libreria coerente di
  **temptecn (DanteGuy)** su [Sketchfab](https://sketchfab.com/temptecn), tutti **CC BY 4.0**
  (attribuzione richiesta), stile horror uniforme, scaricati via Download API ufficiale:
  - **Camminatore**: "Slow Zombie1 FPSC Pack" (11 animazioni)
  - **Corridore**: "Putrid Zombie" (15 animazioni)
  - **Strisciante**: "Crawling Zombie" (5 animazioni)
  - **Brute / Boss**: "Chainsaw Brute FPSC Pack" (10 animazioni)
  - **Evocatore (spitter/boss)**: riusa "Putrid Zombie"
- **Pistola (viewmodel FPS animato: braccia+arma, ricariche tattica/completa)**:
  **"FPS pistol animations" (Springfield XD Mod.2) di Cransh**
  ([Sketchfab](https://sketchfab.com/3d-models/fps-pistol-animations-0d7a343dcb6f401197a73c91aee93f6d)) —
  **CC BY 4.0** (attribuzione richiesta). Arma di raimeiyonke, mani FPS di DJMaesen (bumstrum).
- **Mitra (viewmodel FPS animato, 8 clip)**: **"SMG FPS Animations" (MPA 30 SST) di Cransh**
  ([Sketchfab](https://sketchfab.com/3d-models/smg-fps-animations-ca37ea9148dc4fcc9cc632175d311b23)) —
  **CC BY 4.0** (attribuzione richiesta). Arma di eNse7en, mani FPS di DJMaesen (bumstrum).
- **Magnum (viewmodel FPS animato: estrazione/sparo/ricarica/idle da timeline unica)**:
  **"revolver animated" di bumstrum (DJMaesen)**
  ([Sketchfab](https://sketchfab.com/3d-models/revolver-animated-a34b6d0ddc774744bc3567d6afc0878f)) —
  **CC BY 4.0** (attribuzione richiesta)
- **Fucile a pompa (viewmodel FPS animato: braccia+mani+arma, ricarica a colpo singolo)**:
  **"FPS Arms remington (shotgun)" di Cransh**
  ([Sketchfab](https://sketchfab.com/3d-models/fps-arms-remington-shotgun-e68ef617fe8a48cca8610d016ffd5881)) —
  **CC BY 4.0** (attribuzione richiesta). Idle/cammina/sparo/ricarica; la mano carica i pallettoni uno a uno.
- **Altri personaggi**: [Quaternius](https://quaternius.com) — Post-Apocalypse Pack
  (cane/hound; Big Arm e strisciante come ripieghi) via [poly.pizza](https://poly.pizza) — CC0
- **Scheletri e scenografia cimitero**: [Kay Lousberg / KayKit](https://kaylousberg.com) —
  Skeletons Pack + Halloween Bits — CC0
- **Città abbandonata (relitti e arredo urbano, Sketchfab)** — tutti **CC BY 4.0** (attribuzione richiesta):
  - **"Free Burned Police Cars" di kryik1023** ([Sketchfab](https://sketchfab.com/3d-models/free-burned-police-cars-ad16f7085cb047b494997cf9efed5059))
  - **"Crashed Abandoned Car - Game Ready"** e **"Abandoned Generic Sedan 1 - Game Ready" di rashad-brahimli**
    ([1](https://sketchfab.com/3d-models/crashed-abandoned-car-game-ready-66ef51a84c9843dda53bf0b4b9020011) ·
    [2](https://sketchfab.com/3d-models/abandoned-generic-sedan-1-game-ready-6a2169dafc254f399387a679305bb1bf))
  - **"Abandoned Car - BMW E30 Sedan"** e **"Abandoned Car - Hudson Hornet" di roh3d**
    ([1](https://sketchfab.com/3d-models/abandoned-car-bmw-e30-sedan-32498418a32d43a78d0847ce4c55fcb0) ·
    [2](https://sketchfab.com/3d-models/abandoned-car-hudson-hornet-3a15481d9da9486a8f8e3b5165b66e2d))
  - **"destroyed Bus 01" di dadndan0091** ([Sketchfab](https://sketchfab.com/3d-models/destroyed-bus-01-fdf39ca893a64368af45f82a6b6d68a4))
  - **"Rusty Streetlight" di barbodoji** ([Sketchfab](https://sketchfab.com/3d-models/rusty-streetlight-d75f8d8a26054e3584f55eb07644801a))
  - **"dumpster" di YJ_** ([Sketchfab](https://sketchfab.com/3d-models/dumpster-989ea7f01b924859b3484ee27103e8d9))
  - **"Jersey Barrier" di emran.bayati** ([Sketchfab](https://sketchfab.com/3d-models/jersey-barrier-b52246c9611a42a99a03b425535a0237))
  - **"Ruined buildings pack - Free download" di tobiasherbers2** ([Sketchfab](https://sketchfab.com/3d-models/ruined-buildings-pack-free-download-690edb7d64b84df7bfeee3b54746d6eb))
  - **"City Ruins Environment" di falk** ([Sketchfab](https://sketchfab.com/3d-models/city-ruins-environment-0d32be87779243749417ec783fb3ef60))
  - **"New, Old, Crashed Helicopter" di Vasyukov_S** ([Sketchfab](https://sketchfab.com/3d-models/new-old-crashed-helicopter-0f801510406c452686d0f550add826cd))
  - **"Barricade Sandbags LOD0" di fertator99** ([Sketchfab](https://sketchfab.com/3d-models/barricade-sandbags-lod0-18d348bd76004edd9a1c39155970382d))
  - **"Watch Tower" di edminchi** ([Sketchfab](https://sketchfab.com/3d-models/watch-tower-d5ee8a573a474830b5d7ee9b3baa844d))
  - **"A Pile Of Concrete Debris - 3D Scan" di albentan2012** ([Sketchfab](https://sketchfab.com/3d-models/a-pile-of-concrete-debris-3d-scan-194bec2429da4b74b3926ac981616da8))
  - **"M725 Military Ambulance" di kryik1023** ([Sketchfab](https://sketchfab.com/3d-models/m725-military-ambulance-fbeafdb305114e4eb331d1b69d5fe094))
  - **"Scots Pine Trees Set" di c3posw01** ([Sketchfab](https://sketchfab.com/3d-models/scots-pine-trees-set-422b961ff3d14e7baa7e9077572b2247)) — la foresta instanziata
  - **"Wooden Cabin"** e **"Old Wooden Shed" di donnichols**
    ([1](https://sketchfab.com/3d-models/wooden-cabin-c90674a377864ac1b8fd141ad1917ee3) ·
    [2](https://sketchfab.com/3d-models/old-wooden-shed-761c0879b18041e1a42bc10de88d2228))
- **Texture terreno/zone/città (PBR realistiche)**: [Poly Haven](https://polyhaven.com) — aerial_grass_rock,
  forrest_ground_01, cobblestone_floor_08, rock_wall_10, weathered_planks, asphalt_02,
  rectangular_paving, brick_wall_04, plastered_wall_04, concrete_panels (diffuse+normale+rugosità) — CC0
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
