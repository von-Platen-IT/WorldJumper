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
3. `Enter` blendet die Oberfläche aus. Erst wenn die Maske vollständig verschwunden ist, startet die Sequenz mit der 1 s Pause.

Nach jeder Fahrt bleibt das erreichte Land stehen. Die Eingabemaske kommt erst etwa eine Sekunde später zurück, damit das Label vorher in Ruhe zu lesen ist. Wird dann direkt das nächste Land eingegeben, wird **nicht** zur Ausgangsansicht zurückgesetzt: Das bisherige Land verliert weich seine Markierungsfarbe und sein Label, die Kamera zieht heraus und fährt direkt zum nächsten Land. So lässt sich auch im Einzelmodus eine Aufnahme mit mehreren Ländern nacheinander erzeugen.

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
| `L` | Logo im HUD ein-/ausblenden |
| `E` | Eingabemaske ein-/ausblenden |
| `S` | Safe-Area-Rahmen ein-/ausblenden |

Links unten zeigt das HUD über der Performance-Messung das Logo (`src/pics/logo_banner_small.png`) klein und halbtransparent. Mit `L` wird nur das Logo ausgeblendet, mit `H` das gesamte HUD.

Die Eingabemaske ist im Ruhezustand und nach jeder Fahrt erreichbar. Da sie innerhalb des Aufnahmebereichs liegt, lässt sie sich mit `E` ausblenden, ohne das gezeigte Land oder die Ansicht zu verändern – beim nächsten Phasenwechsel erscheint sie automatisch wieder.

Für die spätere Aufnahme empfiehlt sich: HUD mit `H` ausblenden (oder nur das Logo mit `L`), die Eingabemaske mit `E`, Safe Area mit `S` prüfen, danach Bildschirmaufnahme starten.

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
- Hervorhebung des Zielstaat erfolgt über **Vertex-Farben** des geteilten Landmeshes – kein zusätzliches Mesh, keine Textur pro Land. Der Akzent ist zusätzlich ein **uniform-gesteuerter Shader-Mix** (Vertex-Marker `aHighlight` plus `uHighlightAmount`): pro Frame wird nur ein Uniform gesetzt, kein Vertex-Puffer hochgeladen.
- Das Land ist **im Parameterraum fein unterteilt** (max. 2,5° Kantenlänge, rund 71.000 Dreiecke), damit die Oberfläche der Kugel folgt. Ohne das hängen große Länder hinter der Ozeankugel und erscheinen nur an den Rändern gefüllt – Hintergrund und Messwerte in [Verifikation](docs/verifikation.md:99). Der Aufbau dieser Geometrie dauert rund 0,1 s und läuft im Boot-Overlay.
- Die Flaggen-/Namenskarte ist eine einzige, wiederverwendete Canvas-Textur. Sie bleibt am Land verankert, wird aber **parallel zur Bildebene** gezeichnet statt tangential zur Kugel: Der Text steht dadurch immer horizontal, die Größe ist ein fester Anteil des Bildes (unabhängig von der Größe des Landes) und die Karte wird so in die Safe Area geklemmt, dass sie nie über den Rahmen läuft. Sie ist damit kein flaches HUD, sondern eine bildparallele Beschriftung am Globus.
- Nur **ein** Custom-Shader (Atmosphäre). Kein Post-Processing.
- `devicePixelRatio` ist gedeckelt; die Vorschau zielt auf ein Full-HD-nahes, stabiles Bild.
- Im Renderloop passiert nur: Zustand fortschreiben, Rotation/Kamera setzen, zeichnen. Kein Parsen, keine Neuberechnung von Geometrie.

Details: [Performance-Regeln](docs/performance.md).

## Tests

```bash
npm run smoke     # 57 kopflose Prüfungen
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

Voraussetzung für alle npm-Befehle ist **Node.js ≥ 20** (getestet mit 24.x) inklusive `npm`. Die folgenden Hinweise sind bewusst systemunabhängig formuliert, damit das Projekt auf Linux, macOS und Windows gleichermaßen aufgesetzt werden kann.

### Node.js installieren

Wähle den Weg, der zu deinem System passt:

| System | Empfohlener Weg |
| --- | --- |
| Linux (openSUSE) | `sudo zypper install nodejs22` (oder `nodejs20`) |
| Linux (Debian/Ubuntu) | `sudo apt install nodejs npm` oder das NodeSource-Repo für eine aktuelle Version |
| Linux (Fedora) | `sudo dnf install nodejs` |
| macOS | Installer von [nodejs.org](https://nodejs.org) oder `brew install node` |
| Windows | LTS-Installer von [nodejs.org](https://nodejs.org) |
| Alle Systeme, ohne Root | Versionsmanager `nvm`/`fnm` oder portable Laufzeit (siehe unten) |

Anschließend prüfen, ob die Installation erfolgreich war:

```bash
node --version    # muss ≥ v20 ausgeben
npm --version
```

### Fehlerbehebung: `npm` bzw. `node` wird nicht gefunden

Meldungen wie `npm: command not found` (Linux/macOS) oder `'npm' is not recognized` (Windows) bedeuten fast immer, dass Node.js entweder **nicht installiert** ist oder das Installationsverzeichnis **nicht im `PATH`** liegt.

Unter openSUSE schlägt die Shell zusätzlich ein Paket vor, zum Beispiel:

```text
Das Programm 'npm' kann im folgenden Paket gefunden werden:
  * nodejs-common [ Pfad: /usr/bin/npm, Repository: download.opensuse.org-oss ]
```

Das ist nur ein Hinweis darauf, welches Paket `npm` bereitstellen würde – es ist **keine** Aufforderung, dieses Paket zwingend zu installieren. Prüfe zuerst, ob bereits eine Node-Installation existiert, die nur nicht im `PATH` liegt:

```bash
# Linux/macOS: suchen, wo node/npm liegen
which -a node npm
ls -d /usr/local/bin/node /opt/node* "$HOME/.local/opt/node"* 2>/dev/null

# Windows (PowerShell)
Get-Command node, npm -ErrorAction SilentlyContinue
```

Findet sich eine Installation, genügt es, ihr `bin`-Verzeichnis vorne an den `PATH` anzuhängen (siehe unten). Findet sich keine, installiere Node.js wie oben beschrieben.

### Portable Node-Laufzeit (ohne Root-Rechte)

Wenn keine systemweite Installation möglich oder gewünscht ist, kann Node.js als portable Laufzeit im Benutzerverzeichnis liegen. Beispiel für Linux/macOS:

```bash
# 1. Node-LTS-Archiv von https://nodejs.org/en/download herunterladen und entpacken,
#    z. B. nach ~/.local/opt/node-24
mkdir -p "$HOME/.local/opt"
tar -xf node-v24.*-linux-x64.tar.xz -C "$HOME/.local/opt"
mv "$HOME/.local/opt/node-v24."* "$HOME/.local/opt/node-24"

# 2. Für die aktuelle Sitzung in den PATH aufnehmen
export PATH="$HOME/.local/opt/node-24/bin:$PATH"

# 3. Prüfen
node --version
npm --version
```

Unter Windows entspricht das dem Entpacken des ZIP-Archivs und dem Hinzufügen des entpackten Ordners zum `PATH` (Systemeinstellungen → Umgebungsvariablen).

### `PATH` dauerhaft setzen

Damit der `PATH` nicht in jeder neuen Sitzung erneut gesetzt werden muss, in die Profildatei der Shell eintragen:

```bash
# Linux/macOS, bash
echo 'export PATH="$HOME/.local/opt/node-24/bin:$PATH"' >> ~/.bashrc

# Linux/macOS, zsh
echo 'export PATH="$HOME/.local/opt/node-24/bin:$PATH"' >> ~/.zshrc
```

Danach ein neues Terminal öffnen oder `source ~/.bashrc` (bzw. `~/.zshrc`) ausführen. In VS Code muss der integrierte Terminal danach neu gestartet werden, damit er den aktualisierten `PATH` übernimmt.

> **Hinweis für diese Umgebung:** Hier war kein systemweites Node.js vorhanden; es wurde einmalig eine portable Laufzeit unter `~/.local/opt/node-24` installiert. Alle npm-Befehle setzen voraus, dass dieses Verzeichnis im `PATH` liegt. Auf einer Maschine mit regulärer Node-Installation entfällt der Schritt.

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
