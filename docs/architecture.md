# Architektur

## Leitidee

Die Anwendung wird als kleine, klar getrennte TypeScript-Anwendung ohne zusätzliches Frontend-Framework aufgebaut. Three.js ist ausschließlich für die 3D-Szene zuständig; HTML/CSS ist für die Benutzeroberfläche zuständig.

## Komponenten

### 1. App Controller

Verantwortlich für den Lebenszyklus der Anwendung und die Verbindung zwischen UI, Szene und Animationssystem.

Aufgaben:

- Initialisierung
- Auswahl übernehmen
- Länderlisten verwalten
- Animationen starten/stoppen
- Reset auf Idle
- Fehler an UI melden

### 2. Globe Scene

Enthält:

- Scene
- Kamera
- WebGLRenderer
- Globus-Gruppe
- Weltraum-Hintergrund
- Sterne
- Länderflächen
- Ländergrenzen
- Highlight-/Flaggen-Layer

Der Globus sollte in einer eigenen `Group` liegen. Die Drehung erfolgt primär über diese Gruppe und nicht durch ständiges Neuberechnen sämtlicher Länderkoordinaten.

### 3. Geography Engine

Einmalige Konvertierung der GeoJSON-Koordinaten in 3D-Koordinaten auf einer Kugel.

Aufgaben:

- GeoJSON laden
- MultiPolygon/Polygon behandeln
- Koordinaten auf Kugeloberfläche projizieren
- Grenzen erzeugen
- Länder-Metadaten dem Polygon zuordnen
- geometrische Daten cachen

Die Geometrie muss nach dem Start möglichst statisch bleiben.

### 4. Country Registry

Normalisierte Länderinformation, mindestens:

```text
id
iso2
iso3
name
nameDe
lat
lon
flagPath
```

`lat/lon` dienen nur als robuste Zielorientierung. Die Zielorientierung sollte zusätzlich über die tatsächlich vorhandene Polygon-Geometrie validiert werden.

### 5. Animation Director

Zentrale Zustandsmaschine.

Empfohlene Zustände:

```text
IDLE
INPUT
PAUSE_BEFORE_ACTION
PREPARE_GLOBE
ORIENT_TO_COUNTRY
ZOOM_TO_COUNTRY
HOLD
SEQUENCE_PAUSE
SEQUENCE_NEXT
ERROR
```

Die Zustandsmaschine ist wichtiger als eine große Animationsbibliothek. Jede Phase besitzt eine definierte Dauer und eine klar definierte Start-/Endbedingung.

### 6. Camera Rig

Nicht direkt überall `camera.position` verändern. Eine kleine Camera-Rig-Abstraktion kapselt:

- Entfernung zum Globus
- Zielpunkt
- Orientierung
- FOV bzw. Kameradistanz
- Smooth-Easing

Die Kamera soll immer auf einen Punkt im Raum ausgerichtet werden, statt komplizierte Euler-Winkelketten zu verteilen.

### 7. Country Highlight Layer

Nur das ausgewählte Land erhält den stärksten visuellen Akzent.

Empfohlene Ebenen:

1. normale Länderfläche
2. normale Grenzlinie
3. ausgewählte Länderfläche
4. ausgewählte Grenzlinie
5. Flaggen-/Namensdarstellung

Die Flaggen-/Namensdarstellung wird nur für das aktuelle Land aufgebaut bzw. aktiviert.

Die Karte bleibt am Land verankert, wird aber **parallel zur Bildebene** gezeichnet statt tangential zur Kugel. Der Text steht dadurch immer horizontal, und die Größe wird in Bruchteilen des Bildes gemessen, nicht aus dem Winkelradius des Landes. Eine tangentiale, mit dem Winkelradius skalierte Karte stand schief und lief bei großen Ländern über den Rahmen.

### 8. UI Layer

Normales HTML/CSS:

- Eingabefeld
- Autocomplete-Liste
- Listenmodus
- Start/Reset
- Aspect-Ratio-Auswahl
- Animationsparameter

Während einer aktiven Filmsequenz wird die UI automatisch ausgeblendet.

## Warum WebGLRenderer?

Three.js bietet weiterhin eine direkte `WebGLRenderer`-API für WebGL 2. Für diese Anwendung ist die direkte WebGL-Pipeline die einfachere und ausreichend performante Standardwahl. Ein Wechsel auf WebGPU kann später geprüft werden, sollte aber Version 1 nicht komplizierter machen. citeturn976521search0

## Shader-Strategie

Version 1 soll möglichst wenig Custom Shader enthalten.

Verwenden:

- Standardmaterialien, wo ausreichend
- ein einfaches unlit/emissive Material für stark stilisierte Flächen
- maximal ein einfacher eigener Shader für das selektierte Land, falls sich damit das Flaggen-Mapping deutlich vereinfachen lässt

Kein großes Shader-Framework.

## Geometrie-Strategie

Die GeoJSON-Koordinaten sind 2D-Längen-/Breitengradwerte. Sie werden einmal auf die Kugel projiziert.

Wichtig:

- Polygone können Inseln enthalten.
- Länder bestehen teilweise aus mehreren Polygonen.
- Geometrie darf antimeridianbedingte Sprünge nicht als lange Verbindung interpretieren.
- Kleine Inseln dürfen bei 110m-Daten verschwinden, solange das Ergebnis filmisch verständlich bleibt.

Die Umwandlung soll in einem vorbereitenden Build-/Preprocessing-Schritt passieren, wenn dadurch Browserarbeit und Ladezeit sinken. Für Version 1 ist aber auch eine einmalige Konvertierung beim Start akzeptabel.

## Grenzen

Ländergrenzen sollen unabhängig von der Farbe der Länderflächen sichtbar sein.

Bevorzugte Umsetzung:

- Liniengeometrie knapp oberhalb der Kugeloberfläche
- dezente Emission
- konstante Lesbarkeit
- keine animierte Neuberechnung der Linien

Bei starkem Zoom muss die Linie nicht pixelgenau konstant breit sein; wichtiger ist eine klare visuelle Grenze.

## Weltraum

Der Hintergrund braucht keine physikalisch korrekte Sternfeldsimulation.

Empfehlung:

- schwarzer/dunkelblauer Hintergrund
- wenige hundert einfache Sterne
- optional sehr schwache große Lichtwolke als statisches, günstiges Hintergrundbild

Sterne sollen nicht individuell animiert werden.

## Umgesetzte Module (Stand der Implementierung)

Die Umsetzung folgt der obigen Gliederung, fasst sie aber in kleinere Dateien mit je einer Verantwortung:

| Modul | Verantwortung |
| --- | --- |
| [`src/config.ts`](../src/config.ts:1) | sämtliche Zeiten, Farben, Kamera- und Formatprofile an einer Stelle |
| [`src/app/AppController.ts`](../src/app/AppController.ts:1) | Verdrahtung von Daten, Szene, Animation und UI; Bühnenlayout; Tastatur |
| [`src/scene/GlobeScene.ts`](../src/scene/GlobeScene.ts:1) | Renderer, Licht, Globus-Gruppe, Formatwechsel, Renderstatistiken |
| [`src/scene/CameraRig.ts`](../src/scene/CameraRig.ts:1) | gekapselte Kamera (Abstand, Ziel, Profil) |
| [`src/scene/Starfield.ts`](../src/scene/Starfield.ts:1) | zwei Sternenebenen und Nebel-Backdrop |
| [`src/scene/Atmosphere.ts`](../src/scene/Atmosphere.ts:1) | einziger Custom-Shader (Randglow) |
| [`src/scene/CountryLabel.ts`](../src/scene/CountryLabel.ts:1) | Flaggen-/Namenskarte als Canvas-Textur mit begrenztem Flaggen-Cache, bildparallele Platzierung pro Frame |
| [`src/scene/labelLayout.ts`](../src/scene/labelLayout.ts:1) | reine Layout-Rechnung der Karte (Größe im Bildfeld, Klemmung in die Safe Area) |
| [`src/geography/GeographyEngine.ts`](../src/geography/GeographyEngine.ts:1) | GeoJSON → 3D, Triangulierung, zusammengefasste Land- und Grenzgeometrie |
| [`src/geography/LandLayer.ts`](../src/geography/LandLayer.ts:1) | Landmesh, Grenzlinien und der jeweils aktive Zielstaat |
| [`src/geography/geoProjection.ts`](../src/geography/geoProjection.ts:1) | lat/lon → Kugelkoordinate, Antimeridian-Behandlung |
| [`src/geography/orientation.ts`](../src/geography/orientation.ts:1) | kurzwegige Zielausrichtung und Label-Anker |
| [`src/animation/AnimationDirector.ts`](../src/animation/AnimationDirector.ts:1) | Zustandsmaschine der Filmsequenz |
| [`src/animation/easing.ts`](../src/animation/easing.ts:1) | alle Easing-Kurven |
| [`src/data/CountryRegistry.ts`](../src/data/CountryRegistry.ts:1) | tolerante Suche und Auflösung von Namen und ISO-Codes |
| [`src/ui/SearchUI.ts`](../src/ui/SearchUI.ts:1) | Suchfeld, Autocomplete, Listenmodus, Formatwahl |
| [`src/ui/Hud.ts`](../src/ui/Hud.ts:1) | Logo, Renderstatistiken und Reset-Zugang |

### Abweichungen zur ursprünglichen Planung

- **Ein Draw Call für das gesamte Land.** Statt eines Meshes pro Land wird eine gemeinsame Geometrie mit fortlaufenden Vertex-Bereichen je Land gebaut. Die Basisfarbe steckt in den Vertex-Farben; der Akzent kommt über ein `aHighlight`-Vertex-Attribut und das Uniform `uHighlightAmount` hinzu. Das reduziert Draw Calls drastisch und hält die Highlight-Kosten konstant klein.
- **Dominante Landmasse statt Gesamtschwerpunkt.** Für Ausrichtung und Zoom wird bewusst nur die größte zusammenhängende Landfläche herangezogen. Andernfalls würden Überseegebiete die Ausrichtung von Frankreich, den USA oder Neuseeland verfälschen.
- **Unterteilung im Parameterraum, nicht auf der Kugel.** Landdreiecke werden in Längen-/Breitengradkoordinaten bis auf 2,5° Kantenlänge verfeinert und erst dann projiziert. Unterteilt wird durch **Halbierung der längsten Kante**, nicht durch Vierteilung über alle Mittelpunkte: Letztere erzeugt ähnliche Kinder und bläht dünne Regionen auf. Eine Unterteilung über 3D-Mittelpunkte würde Großkreise approximieren und die Fläche großer Länder um bis zu 28% aufblähen. Details unter [Behobene Fehler](verifikation.md#behobene-fehler).
- **Triangulierung auf den unverdichteten Ringen.** Die Kantenverdichtung dient nur den Grenzlinien; für die Triangulierung werden die rohen Ringe verwendet. Verdichtete Punkte liegen exakt auf geraden Kanten und werden von Earcut zu Splittern, die früher verworfen wurden – dadurch fehlten ganze Keile der Landesfläche.
- **Highlight über Uniform statt Puffer-Upload.** Das Land verschmilzt zu einem einzigen Mesh; ein vollständiges `needsUpdate` pro Frame würde mehrere MB übertragen. Stattdessen markiert ein Byte pro Vertex (`aHighlight`) das aktive Land, und pro Frame wird nur ein Uniform gesetzt.
- **Skalarer heißer Pfad.** Der Aufbau der Weltgeometrie verzichtet bewusst auf `Vector3`-Objekte und rechnet direkt mit Zahlen. Mit Objekt-Allokation brauchte der Aufbau rund 3,0 s; nach der Geometrie-Korrektur liegt er bei rund 0,1 s.
- **Label bildparallel statt tangential.** Die Karte hing früher als Kind der Globus-Gruppe und wurde mit `setFromUnitVectors` ausgerichtet – das ergibt eine beliebige Rollung, und die Skalierung mit dem Winkelradius ließ große Länder über den Rahmen laufen. Sie hängt jetzt an der Szene, steht parallel zur Bildebene und wird pro Frame in Bildbruchteilen bemessen und in die Safe Area geklemmt. Die Rechnung liegt als reine Funktion in [`labelLayout.ts`](../src/scene/labelLayout.ts:1) und ist damit headless prüfbar.
- **`RESET` als eigener Übergang.** Der im Dokument genannte Reset ist als kurzer, weicher Übergang (750 ms) implementiert, statt die Kamera hart zurückzusetzen. Ein harter Sprung wäre im fertigen Film unbrauchbar.
- **Ein zusätzlicher Zustand `RESET` in der Zustandsmaschine** ist der einzige Zusatz gegenüber der empfohlenen Liste.

### Datenfluss

```text
npm run data
  Natural Earth 110m  ──►  prepare-data.mjs  ──►  public/data/*.json + public/flags/*.svg
                                                        │
                               fetch (nur einmal beim Start)
                                                        ▼
     buildWorld()  ──►  LandLayer (1 Mesh + 1 Linienobjekt)
                    ──►  CountryRegistry (Suche)
                                                        │
                    AppController ──► AnimationDirector ──► CameraRig + GlobeScene
                              │
                              └────────► SearchUI / Hud
```
