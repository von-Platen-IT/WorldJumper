# Umsetzungsplan

## Phase 0 – Projektgerüst

Ziel: leeres Vite-TypeScript-Projekt mit Three.js.

Aufgaben für den AI-Coding-Agenten:

1. Vite-Projekt mit TypeScript einrichten.
2. Three.js als direkte Dependency hinzufügen.
3. Grundlegende Ordnerstruktur nach README anlegen.
4. Linting und Typecheck nur so weit einrichten, dass Build-Fehler früh sichtbar werden.
5. README und Dokumentation unverändert als Projektleitfaden einchecken.

Akzeptanz:

- `npm install` erfolgreich
- `npm run dev` erfolgreich
- `npm run build` erfolgreich
- leerer Three.js-Canvas sichtbar

## Phase 1 – Globus

Ziel: stilisierter rotierender Globus ohne Länderhighlight.

Aufgaben:

1. Scene, Camera, Renderer.
2. Globus-Kugel.
3. einfache Materialgebung.
4. Sterne.
5. langsame Idle-Rotation.
6. Resize-Handling.
7. Landscape/Portrait testen.

Akzeptanz:

- flüssiger Globus
- keine sichtbaren Sprünge beim Resize
- Kamera bleibt zuverlässig auf Globus ausgerichtet

## Phase 2 – Geodaten

Ziel: Länder und Grenzen sichtbar machen.

Aufgaben:

1. Natural-Earth-Daten herunterladen.
2. relevante Felder bestimmen.
3. Daten bereinigen.
4. GeoJSON lokal in `public/data` ablegen.
5. Projektion auf Kugel implementieren.
6. Ländergrenzen aufbauen.
7. Grenzlayer knapp über Kugeloberfläche platzieren.

Akzeptanz:

- Europa klar erkennbar
- Nordamerika, Südamerika, Afrika, Asien und Australien/Ozeanien klar erkennbar
- mindestens Deutschland, USA, Japan und Brasilien identifizierbar

## Phase 3 – Country Registry

Ziel: verlässliche Suche.

Aufgaben:

1. ISO-Index erstellen.
2. deutsche Namen ergänzen.
3. englische Namen optional ergänzen.
4. Schwerpunktkoordinaten hinterlegen.
5. Flaggenpfade hinterlegen.

Akzeptanz:

- Suchfunktion liefert eindeutige ISO-Zuordnung
- keine Abhängigkeit von externer API

## Phase 4 – Länderauswahl

Ziel: UI für die Auswahl.

Aufgaben:

1. Suchfeld.
2. Autocomplete.
3. Tastaturbedienung.
4. Enter-Auswahl.
5. Fehlerzustände.
6. UI während Animation ausblenden.

Akzeptanz:

- `Deutschland` findet DE
- `germany` findet DE
- `deu` findet DEU
- Enter startet die definierte Sequenz

## Phase 5 – Kamera- und Rotationssystem

Ziel: filmische Bewegung zu einem Land.

Aufgaben:

1. Camera Rig erstellen.
2. Zielpunkt aus Länderkoordinate berechnen.
3. Globus-Rotation auf kürzestem Weg bestimmen.
4. Kameraabstand animieren.
5. Easing zentral konfigurieren.

Akzeptanz:

- Deutschland wird aus beliebiger Idle-Position korrekt erreicht
- Japan wird ohne unnatürliche Extraumdrehung erreicht
- Kamera verliert das Ziel während der Fahrt nicht

## Phase 6 – Highlight / Flagge / Name

Ziel: ausgewähltes Land visuell eindeutig machen.

Aufgaben:

1. normales Landdesign behalten.
2. Zielstaat stärker hervorheben.
3. Zielgrenze verstärken.
4. Flagge lokal laden.
5. Landesname als Textur erzeugen.
6. Flagge + Name sichtbar kombinieren.
7. Fade In/Fade Out.

Startlösung:

Ein 3D-Overlay/Label über dem Zielstaat, das räumlich korrekt auf den Globus ausgerichtet wird.

Nur wenn dies visuell nicht genügt, auf echtes polygonales Flaggen-Mapping erweitern.

Akzeptanz:

- Flagge sichtbar
- Name lesbar
- Grenze des Landes bleibt klar
- Label folgt der Kameraposition überzeugend

## Phase 7 – Exakter Ablauf

Ziel: vom Nutzer gewünschten Timingablauf umsetzen.

Verbindliche Reihenfolge:

```text
Input
↓
Enter
↓
1.0 s Pause
↓
Kamera leicht heraus
↓
vorherige Hervorhebung ausblenden
↓
Globus auf Ziel rotieren
↓
Ziel heranzoomen
↓
Highlight + Flagge + Name
↓
Hold
```

Die gesamte Sequenz wird über eine einzige Zustandsmaschine gesteuert.

## Phase 8 – Liste

Ziel: mehrere Länder in definierter Reihenfolge.

Aufgaben:

1. Liste akzeptieren.
2. Reihenfolge erhalten.
3. erstes Land abspielen.
4. 1 s Pause.
5. nächstes Land.
6. nach letztem Land im Hold bleiben.

Akzeptanz:

`DE → FR → JP` wird exakt in dieser Reihenfolge abgearbeitet.

## Phase 9 – Filmformate

Ziel: 16:9 und 9:16.

Aufgaben:

1. Layoutmodus wählen.
2. Kameraparameter pro Format konfigurierbar machen.
3. Safe Area berücksichtigen.
4. Textgrößen anpassen.
5. Portrait intensiv testen.

## Phase 10 – Polishing

Erst jetzt:

- Sternfeld verbessern
- sanfte Glows
- dezente Farbverläufe
- subtile Tiefenwirkung
- UI-Animationen

Keine Effekte hinzufügen, die die FPS oder Bedienbarkeit deutlich verschlechtern.

## Phase 11 – Stabilisierung

Tests:

- Länder mit kompakter Geometrie: Deutschland, Frankreich, Japan
- große Länder: Kanada, Russland, China, Brasilien
- Inselstaaten: Japan, Indonesien, Neuseeland
- Grenzfälle am 180°-Meridian
- mehrere Länder nacheinander
- schneller Reset während einer Animation
- wiederholte Eingaben
- Resize während Idle
- Resize während Animation

## Definition of Done

Version 1 ist fertig, wenn:

- lokaler Build ohne externe Laufzeitdaten funktioniert
- Globus sauber rotiert
- Ländergrenzen sichtbar sind
- Länder zuverlässig gesucht werden können
- Enter die Sequenz startet
- 1 s Pause eingehalten wird
- die Kamera filmisch zum Land fährt
- Flagge und Name des Zielstaates erscheinen
- Listenmodus funktioniert
- 16:9 und 9:16 funktionieren
- keine Audioabhängigkeit besteht
- Performance auf einem normalen Desktop flüssig ist
- keine unnötige Framework-Komplexität eingeführt wurde

## Umsetzungsstatus

| Phase | Status | Anmerkung |
| --- | --- | --- |
| 0 – Projektgerüst | erledigt | Vite 8, TypeScript, three.js, Node 24 |
| 1 – Globus | erledigt | plus Nebel-Backdrop, zwei Sternenebenen, Atmosphären-Glow |
| 2 – Geodaten | erledigt | `scripts/prepare-data.mjs`, 177 Länder, 200 kB Geometrie |
| 2b – Geodaten-Engine | erledigt | Antimeridian-sicher, ein Mesh für Land, ein Objekt für Grenzen |
| 3 – Country Registry | erledigt | ISO2/ISO3/DE/EN, Schwerpunkt, Winkelradius |
| 4 – Länderauswahl | erledigt | Autocomplete, Mehrdeutigkeit wird nicht zufällig aufgelöst |
| 5 – Kamera/Rotation | erledigt | `CameraRig` plus `AnimationDirector` |
| 6 – Highlight/Flagge/Name | erledigt | Vertex-Farben + verstärkte Grenze + Karte auf der Kugeloberfläche |
| 7 – Exakter Ablauf | erledigt | 1000 ms Pause und Reihenfolge exakt eingehalten |
| 8 – Liste | erledigt | 1 s Pause nur zwischen den Ländern |
| 9 – Filmformate | erledigt | Letterbox-Bühne, eigene Kameraprofile |
| 10 – Polishing | erledigt | Vignette, Glow, UI-Übergänge, HUD |
| 11 – Stabilisierung | erledigt | 33 Smoke-Checks, siehe [Verifikation](verifikation.md) |

Nicht umgesetzt (bewusst): polygonales Flaggenmapping innerhalb der Landesfläche. Die einfachere, im Plan als bevorzugt bezeichnete Kartenlösung erfüllt das visuelle Ziel.
