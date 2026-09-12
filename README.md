# Globe Film Tool

Ein fokussiertes 3D-Webtool zur Erzeugung von filmischen Globus-Sequenzen. Der Globus schwebt im Weltraum, dreht sich langsam und kann nach Eingabe eines Landes gezielt auf dieses Land ausgerichtet und gezoomt werden. Das Tool ist für die spätere Weiterverarbeitung in einem Videoschnittprogramm gedacht.

> **Status: Version 1 umgesetzt und verifiziert.** Der Produktionsbuild läuft, alle Smoke-Checks sind grün.
> Siehe [Verifikation](docs/verifikation.md) und [Bedienung](docs/bedienung.md).

## Inhaltsverzeichnis

- [Was die Anwendung leistet](#was-die-anwendung-leistet)
- [Der verbindliche Ablauf](#der-verbindliche-ablauf)
- [Schnellstart](#schnellstart)
- [npm-Skripte](#npm-skripte)
- [Bedienung](#bedienung)
- [Projektstruktur](#projektstruktur)
- [Konfiguration](#konfiguration)
- [Datenpipeline](#datenpipeline)
- [Technik und Performance](#technik-und-performance)
- [Tests](#tests)
- [Hinweise zur Entwicklungsumgebung](#hinweise-zur-entwicklungsumgebung)
- [Dokumentation](#dokumentation)
- [Nicht-Ziele von Version 1](#nicht-ziele-von-version-1)

## Was die Anwendung leistet

- stilisierter Globus im Weltraum mit langsamer, kontinuierlicher Eigenrotation
- Eingabe eines Landes über ein einzelnes Textfeld mit sofortiger Autovervollständigung
- nach `Enter` verschwindet die Oberfläche, es folgt exakt **1,0 s Pause**
- danach die filmische Fahrt: Kamera zieht heraus, der Globus dreht sich auf kürzestem Weg zum Ziel, die Kamera zoomt kontrolliert hinein
- **Ländergrenzen bleiben immer sichtbar** – auch in der Totalen und beim Close-up
- **nur das ausgewählte Land** erhält die stärkste Hervorhebung sowie Flagge und Namen
- Länderliste: mehrere Länder werden nacheinander abgespielt, dazwischen jeweils 1 s Pause
- Portrait (1080 × 1920) und Landscape (1920 × 1080) aus derselben Szene, nur mit unterschiedlichen Kameraprofilen
- vollständig offline, keine externe API, kein Backend, kein Ton

## Der verbindliche Ablauf

```text
IDLE / INPUT     Globus dreht langsam, Suchfeld sichtbar
   │
   ▼  Enter
PAUSE_BEFORE_ACTION   1000 ms, bewusst ruhiges Bild
   │
   ▼
PREPARE_GLOBE   Kamera zieht leicht heraus, Globus wieder als Ganzes sichtbar,
                vorherige Hervorhebung und Label blenden aus
   │
   ▼
ORIENT_TO_COUNTRY   Globus rotiert auf kürzestem Weg in die Kameraachse
   │
   ▼
ZOOM_TO_COUNTRY   Kamera zoomt hinein, Highlight + Grenze + Flagge + Name blenden ein
   │
   ▼
HOLD   Endzustand bleibt stehen
   │
   ├─ weitere Länder in der Liste? ──► SEQUENCE_PAUSE (1000 ms) ──► PREPARE_GLOBE …
   │
   └─ nein ──► HOLD bis der Nutzer neu startet oder zurücksetzt
```

Alle Zeiten liegen zentral in [`src/config.ts`](src/config.ts:1).

## Schnellstart

Voraussetzungen: **Node.js ≥ 20** (getestet mit 24.21.0) und npm.

```bash
npm install          # Abhängigkeiten installieren
npm run data         # Natural-Earth-Daten + Flaggen nach public/ aufbereiten (einmalig)
npm run dev          # Entwicklungsserver auf http://localhost:5173
```

Für eine Produktionsvorschau:

```bash
npm run build        # Typcheck + Bundle nach dist/
npm run preview      # statischer Server auf http://localhost:4173
```

### Zugriff von einem anderen Rechner im Netz (optional)

Der Dev-Server lauscht bereits auf allen Interfaces. Wenn ein anderer Rechner im Heimnetz zugreifen soll und die Firewall den Port blockt, gibt es dafür ein Skript, das nur diesen einen Port befristet und auf das lokale Subnetz begrenzt öffnet – ohne die Firewall abzuschalten:

```bash
npm run lan          # Port im lokalen Netz freigeben (fragt nach sudo-Passwort)
npm run lan:status   # Zustand anzeigen
npm run lan:close    # Freigabe sofort beenden
```

Ursachenanalyse, manuelle Varianten, SSH-Tunnel-Alternative und Fehlersuche stehen in [TestLocal.md](TestLocal.md:1).

`npm run data` benötigt einmalig Internetzugang, um die Natural-Earth-Quelldatei zu laden. Danach ist die Anwendung vollständig offline lauffähig – die aufbereiteten Daten liegen in `public/`.

## npm-Skripte

| Skript | Zweck |
| --- | --- |
| `npm run dev` | Vite-Entwicklungsserver mit HMR |
| `npm run build` | `tsc --noEmit` + Produktionsbuild nach `dist/` |
| `npm run preview` | gebauten Stand lokal ausliefern |
| `npm run typecheck` | reiner TypeScript-Typcheck |
| `npm run data` | Ländergrenzen und Flaggen aufbereiten |
| `npm run smoke` | kopfloser Funktionstest der Geometrie, Ausrichtung und Suche |

## Bedienung

### Einzelnes Land

1. Land eintippen – deutscher Name, englischer Name, ISO2 oder ISO3 funktionieren alle.
2. Vorschlag mit `↑` / `↓` wählen (oder direkt `Enter` bei eindeutigem Treffer).
3. `Enter` startet die Sequenz, die Oberfläche blendet aus.

Beispiele: `Deutschland`, `germany`, `deu`, `DE`, `japan`, `brasilien`.

### Länderliste

Modus **Länderliste** umschalten und je Zeile ein Land eingeben (alternativ durch Komma oder Semikolon getrennt):

```text
Deutschland
Frankreich
Spanien
USA
Japan
```

Über `Sequenz starten` oder `Enter` im Textfeld läuft die Liste in genau dieser Reihenfolge ab. Die 1 s Pause liegt nur **zwischen** den Ländern. Unbekannte Einträge werden vor dem Start gemeldet, statt still zu verschwinden.

### Formate

Die Bühne ist ein Letterbox-Rahmen mit exaktem Zielformat:

| Modus | Auflösung | Verwendung |
| --- | --- | --- |
| Landscape 16:9 | 1920 × 1080 | klassisches Querformat |
| Portrait 9:16 | 1080 × 1920 | Social-/Vertikalformate |

Die Szene und die Geometrie sind identisch. Es ändern sich nur Kameraabstand, FOV-Wirkung und Komposition. Das Umschalten ist nur außerhalb einer laufenden Sequenz möglich.

### Tastenkürzel

| Taste | Wirkung |
| --- | --- |
| `Enter` | Auswahl bestätigen / Sequenz starten |
| `↑` `↓` | Vorschlag wählen |
| `Esc` | Vorschläge schließen bzw. jederzeit zurücksetzen |
| `R` | jederzeit zurücksetzen (auch mitten in einer Fahrt) |
| `H` | technisches HUD ein-/ausblenden |
| `S` | Safe-Area-Rahmen ein-/ausblenden |

Für die spätere Aufnahme empfiehlt sich: HUD mit `H` ausblenden, Safe Area mit `S` prüfen, danach Bildschirmaufnahme starten.

## Projektstruktur

```text
WorldJumper/
├── index.html                  Bühne, UI-Wurzel, Boot-Overlay
├── package.json
├── tsconfig.json
├── vite.config.ts
├── scripts/
│   ├── prepare-data.mjs        Natural Earth -> public/data + public/flags
│   └── smoke.ts                kopflose Verifikation (npm run smoke)
├── public/
│   ├── data/
│   │   ├── countries.geojson   reduzierte Ländergeometrie (MultiPolygon, 3 Dezimalen)
│   │   └── country-index.json  Suche, Schwerpunkt, Angularradius, Flaggenpfad
│   └── flags/                  175 SVG-Flaggen (nur die mit Länderbezug)
└── src/
    ├── main.ts                 Einstiegspunkt
    ├── config.ts               sämtliche Zeiten, Farben, Kamera- und Formatprofile
    ├── app/AppController.ts    Verdrahtung von Daten, Szene, Animation und UI
    ├── scene/
    │   ├── GlobeScene.ts       Renderer, Kamera, Globus-Gruppe, Formatlogik
    │   ├── CameraRig.ts        abstrahierte Kamera (Abstand, Ziel, Profil)
    │   ├── Starfield.ts        zwei Sternenebenen + Nebel-Backdrop
    │   ├── Atmosphere.ts       ein einzelner Fresnel-Shader für den Randglow
    │   └── CountryLabel.ts     Flaggen-/Namenskarte als Canvas-Textur
    ├── geography/
    │   ├── GeographyEngine.ts  GeoJSON -> 3D, Triangulierung, Grenzlinien
    │   ├── LandLayer.ts        Landmesh, Grenzlinien, aktives Highlight
    │   ├── geoProjection.ts    lat/lon -> Kugel, Antimeridian-Behandlung
    │   └── orientation.ts      kurzwegige Ausrichtung, Label-Anker
    ├── animation/
    │   ├── AnimationDirector.ts  Zustandsmaschine der Filmsequenz
    │   └── easing.ts             zentrale Easing-Kurven
    ├── data/
    │   ├── CountryRegistry.ts  tolerante Suche, Auflösung von Namen und ISO-Codes
    │   └── types.ts
    ├── ui/
    │   ├── SearchUI.ts         Suchfeld, Autocomplete, Listenmodus, Formatwahl
    │   ├── Hud.ts              FPS/Draw-Calls sowie Reset-Zugang
    │   └── styles.css
    └── utils/assets.ts         Auflösung relativer Asset-Pfade
```

## Konfiguration

Alle Stellschrauben liegen in [`src/config.ts`](src/config.ts:1):

| Wert | Bedeutung |
| --- | --- |
| `TIMING.pauseBeforeAction` | Pause nach `Enter` (Standard 1000 ms) |
| `TIMING.prepareGlobe` | Dauer des Herausziehens |
| `TIMING.orientToCountry` | Dauer der Globusdrehung |
| `TIMING.zoomToCountry` | Dauer des Zoomflugs |
| `TIMING.sequencePause` | Pause zwischen zwei Ländern |
| `IDLE_SPIN_SPEED` | Geschwindigkeit der Ruherotation (Standard: Umdrehung in 24 s) |
| `CAMERA_PROFILES` | FOV, Ruheabstand, Mindest-/Maximalabstand, Sicherheitsfaktor je Format |
| `COLORS` | Weltraum, Ozean, Land, Grenze, Highlight, Atmosphäre |
| `MAX_PIXEL_RATIO` | Obergrenze für `devicePixelRatio` (Standard 1.5) |

## Datenpipeline

`npm run data` führt aus:

1. Natural Earth **Admin 0 – Countries, 1:110m** herunterladen (Quelle siehe [Datenquellen](docs/data-sources.md)).
2. Auf die benötigten Felder reduzieren: `ISO_A2`, `ISO_A3`, `NAME_EN`, `NAME_DE`, `CONTINENT`.
3. Koordinaten auf 3 Dezimalstellen runden (≈ 110 m – unterhalb jeder sichtbaren Stilisierung).
4. **Dominante Landmasse** bestimmen und daraus den Schwerpunkt sowie den Winkelradius berechnen. Das ist wichtig: sonst würden Überseegebiete die Ausrichtung von Frankreich oder den USA verfälschen.
5. `countries.geojson` und `country-index.json` nach `public/data/` schreiben.
6. Benötigte Flaggen-SVGs aus `flag-icons` nach `public/flags/` kopieren.

Ergebnis: 177 Länder, 175 mit Flagge, rund 200 kB Geometrie und 36 kB Index.

## Technik und Performance

- **TypeScript + Vite + three.js**, kein UI-Framework ([Begründung](docs/architecture.md)).
- Land aller Länder steckt in **einem einzigen Mesh**, alle Grenzen in **einem einzigen Linienobjekt**. Damit sind Weltraum, Globus, Land und Grenzen zusammen nur eine Handvoll Draw Calls.
- Hervorhebung des Zielstaat erfolgt über **Vertex-Farben** des geteilten Landmeshes – kein zusätzliches Mesh, keine Textur pro Land. Beim Ein-/Ausblenden wird nur der Farbbereich des aktiven Landes hochgeladen (`addUpdateRange`), nicht der komplette Puffer.
- Das Land ist **im Parameterraum fein unterteilt** (max. 2,5° Kantenlänge, rund 265.000 Dreiecke), damit die Oberfläche der Kugel folgt. Ohne das hängen große Länder hinter der Ozeankugel und erscheinen nur an den Rändern gefüllt – Hintergrund und Messwerte in [Verifikation](docs/verifikation.md:99). Der Aufbau dieser Geometrie dauert rund 1,5 s und läuft im Boot-Overlay.
- Die Flaggen-/Namenskarte ist eine einzige, wiederverwendete Canvas-Textur und liegt **räumlich korrekt auf der Globusoberfläche**, nicht als flaches HUD.
- Nur **ein** Custom-Shader (Atmosphäre). Kein Post-Processing.
- `devicePixelRatio` ist gedeckelt; die Vorschau zielt auf ein Full-HD-nahes, stabiles Bild.
- Im Renderloop passiert nur: Zustand fortschreiben, Rotation/Kamera setzen, zeichnen. Kein Parsen, keine Neuberechnung von Geometrie.

Details: [Performance-Regeln](docs/performance.md).

## Tests

```bash
npm run smoke     # 46 kopflose Prüfungen
npm run typecheck
npm run build
```

`npm run smoke` prüft unter anderem:

- Geometrieaufbau für alle 177 Länder, keine NaN-Werte, Vertexanzahl und Dreiecke
- jedes Land aus dem Index besitzt Geometrie
- Ausrichtung für Deutschland, Japan, Brasilien, USA, Neuseeland, Indonesien, Russland: Zielland liegt exakt auf der Kameraachse (`dot(z) = 1.000000`) und der Nordpol bleibt oben
- Quaternion-Rotation nimmt immer den kürzeren Weg
- keine Antimeridian-Artefakte (kein Grenzsegment über die Erdkugel)
- Suche: `deu` → Deutschland, `germany` → Deutschland, `usa` → US, Unsinn wird abgelehnt

Ergebnis und manuelle Prüfliste: [Verifikation](docs/verifikation.md).

## Hinweise zur Entwicklungsumgebung

In dieser Umgebung war kein systemweites Node.js vorhanden. Es wurde einmalig eine portable Laufzeit installiert:

```bash
# Node 24 LTS nach /home/bernd/.local/opt/node-24
export PATH=/home/bernd/.local/opt/node-24/bin:$PATH
```

Alle npm-Befehle setzen diesen `PATH` voraus. Auf einer Maschine mit regulärer Node-Installation entfällt der Schritt.

## Dokumentation

- [Bedienung und Drehbuch-Hinweise](docs/bedienung.md)
- [Architektur](docs/architecture.md)
- [Datenquellen](docs/data-sources.md)
- [Animationsspezifikation](docs/animation-spec.md)
- [UI und Videoformate](docs/ui-and-formats.md)
- [Performance](docs/performance.md)
- [Umsetzungsplan](docs/implementation-plan.md)
- [Verifikation](docs/verifikation.md)
- [Anweisungen für den AI-Coding-Agenten](docs/ai-agent-instructions.md)
- [Credits und Lizenzen](docs/credits-and-licenses.md)

## Nicht-Ziele von Version 1

- kein frei navigierbares GIS, keine Satelliten- oder Reliefdaten
- keine Live-Daten, keine Serverdatenbank, keine Benutzerkonten
- kein Audio
- kein eingebauter Videoschnitt, kein direkter MP4-Export
- keine zusätzliche Framework-Komplexität
