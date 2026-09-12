# Anweisungen für den AI-Coding-Agenten

## Rolle

Du entwickelst ein kleines, performantes 3D-Visualisierungstool zur Erzeugung von filmischen Globus-Sequenzen.

Du sollst nicht einfach möglichst viel Code erzeugen. Du sollst die kleinste sinnvolle Architektur bauen, die die beschriebenen Abläufe zuverlässig und erweiterbar abbildet.

## Verbindliche technische Entscheidungen

- TypeScript
- Vite
- Three.js
- HTML/CSS für UI
- lokale Geodaten
- Natural Earth 110m als Standard
- lokale SVG-Flaggen
- keine Backend-Anwendung in Version 1
- keine Datenbank
- keine externe Karten-API
- kein React/Vue, solange kein konkreter technischer Grund entsteht

## KISS-Regel

Bevor du eine Library hinzufügst, prüfe:

1. Kann Three.js die Aufgabe direkt lösen?
2. Kann normales TypeScript/CSS die Aufgabe direkt lösen?
3. Erzeugt die Library echte langfristige Vereinfachung?

Wenn nein, keine zusätzliche Dependency.

## Architekturregeln

Vermeide:

- globale mutable Zustände überall im Projekt
- direkte Kamera-Manipulation aus UI-Komponenten
- GeoJSON-Verarbeitung im Renderloop
- Länder-Suche gegen externe APIs
- mehrfach implementierte Easing-Logik
- hart codierte Länderlisten an mehreren Stellen

Bevorzuge:

- kleine Module
- klar benannte Zustände
- zentrale Konfiguration
- unveränderliche Datenobjekte, wo sinnvoll
- Caching für vorberechnete Geometrie

## Animation

Die Animation muss deterministisch sein.

Es gibt eine zentrale Animation-/State-Machine.

UI darf nicht selbst entscheiden, wie Kamera oder Globus bewegt werden.

## Eingabelogik

Beim Tippen wird nur gesucht.

Beim Enter:

1. Auswahl validieren.
2. UI ausblenden.
3. 1000 ms Pause.
4. Sequenz starten.

Kein sofortiger Kamerasprung nach Enter.

## Globusbewegung

Der Globus dreht sich im Idle langsam.

Beim Zielwechsel:

- Idle-Rotation unterbrechen oder in kontrollierte Transition überführen.
- kürzesten sinnvollen Rotationsweg wählen.
- niemals das Ziel aus dem Blick verlieren.
- Kamera und Globusbewegung synchronisieren.

## Ländergrenzen

Grenzen sind ein Kernfeature und dürfen nicht wegen Vereinfachung verschwinden.

Sie müssen:

- bei normalen Zooms sichtbar sein
- beim Zielstaat verstärkt sichtbar sein
- mit dem Globus mitrotieren
- nicht als flache HUD-Linie vor dem Bildschirm kleben

## Flagge und Name

Nur das aktuell ausgewählte Land bekommt die stärkste Flaggen-/Namensdarstellung.

Bevorzugte Reihenfolge der Implementierung:

1. einfacher 3D-Label-/Overlay-Ansatz
2. erst bei Bedarf polygonbezogenes Mapping

Die kompliziertere Lösung darf nicht ohne visuellen Grund vorgezogen werden.

## Daten

Natural-Earth-Daten werden beim Setup lokal gespeichert und auf die wirklich benötigten Eigenschaften reduziert.

Die Anwendung soll nach dem Build ohne Internet starten können.

## Performance

Miss statt zu raten.

Nutze Three.js Renderer-Informationen während der Entwicklung.

Achte besonders auf:

- Draw Calls
- Geometrien
- Texturen
- Pixel Ratio
- Anzahl sichtbarer Meshes

Verwende keine schweren Effekte nur wegen ihres Demo-Effekts.

## Responsive Videoformate

Baue keine zweite Szene für Portrait.

Es gibt eine Szene und unterschiedliche Kamera-/Layoutprofile.

Minimal erforderlich:

```text
landscape 16:9
portrait 9:16
```

## Codequalität

Jedes Modul braucht eine eindeutige Verantwortung.

Keine Dateien mit 1000+ Zeilen, wenn die Funktion sinnvoll auf mehrere Verantwortlichkeiten aufteilbar ist.

Kommentare nur dort, wo die Entscheidung nicht offensichtlich ist.

## Tests

Mindestens manuell prüfen:

- Deutschland
- Japan
- Brasilien
- USA
- Indonesien
- Neuseeland

Zusätzlich:

- zwei Länder nacheinander
- fünf Länder nacheinander
- Reset während Zoom
- Enter ohne gültige Auswahl
- Resize 16:9 → 9:16

## Implementierungsreihenfolge

Nicht alles in einem Schritt bauen.

Arbeite inkrementell:

1. Setup
2. Globus
3. Geodaten
4. Grenzen
5. Suche
6. Kamera
7. Highlight
8. Timing
9. Liste
10. Portrait
11. Performance
12. Polishing

Nach jedem Schritt soll der Projektstand weiterhin buildbar sein.

## Umgang mit Fehlern

Wenn eine Bibliothek oder API unnötige Komplexität erzeugt, nicht daran festhalten. Zur einfacheren nativen Implementierung zurückkehren.

Wenn Geodaten problematisch sind, zuerst die Datenvorbereitung verbessern und nicht die Three.js-Szene mit Sonderlogik überladen.

## Visuelles Ziel

Das Ergebnis soll hochwertig, reduziert und filmisch wirken – nicht wie ein technischer Kartenviewer.

Die geografische Aussage muss stimmen, die grafische Vereinfachung ist ausdrücklich erlaubt.

## Abschlusskriterium

Keine Funktion gilt als fertig, nur weil sie technisch funktioniert. Sie muss auch im 16:9- und 9:16-Format überzeugend aussehen und den definierten zeitlichen Ablauf einhalten.
