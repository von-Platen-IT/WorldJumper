# UI und Videoformate

## Grundidee

Die Oberfläche ist ein Werkzeug, keine klassische Website.

Während des Filmablaufs soll möglichst nichts von der Szene ablenken.

## Startansicht

Zentral oder leicht unterhalb der Bildmitte:

- großes Länder-Suchfeld
- dezenter Placeholder, z. B. `Land eingeben …`
- dunkler halbtransparenter Hintergrund
- keine permanente Seitenleiste im Filmfenster

Optional klein darunter:

- Modus `Einzelnes Land`
- Modus `Länderliste`
- Format `Landscape / Portrait`

## Autocomplete

Die Suche arbeitet ausschließlich gegen den lokalen Länderindex.

Unterstützen:

- deutscher Name
- englischer Name
- ISO2
- ISO3

Beispiel:

`deu` → Deutschland
`germany` → Deutschland
`jap` → Japan

Die Suche soll tolerant gegenüber Groß-/Kleinschreibung und Leerzeichen sein.

## Enter-Verhalten

`Enter` wählt:

- den aktuell markierten Vorschlag, wenn vorhanden
- ansonsten den eindeutigen Treffer
- bei mehreren Treffern keinen zufälligen Treffer, sondern lässt die Auswahl sichtbar

Nach erfolgreicher Auswahl verschwindet das Suchfeld.

## Listenmodus

Einfache, robuste Eingabe bevorzugen:

```text
Deutschland
Frankreich
Spanien
Japan
USA
```

Optional zusätzlich CSV/kommaseparierte Eingabe.

Version 1 braucht keinen komplexen Drag-and-drop-Playlist-Editor.

## Formatumschaltung

### Landscape

1920 × 1080

Der Globus wird horizontal großzügig inszeniert.

### Portrait

1080 × 1920

Die Kamerakomposition wird angepasst:

- etwas mehr vertikaler Raum
- Globus eher zentral
- UI darf weiter in Richtung oberes Drittel verlagert werden

Die Geometrie bleibt identisch. Nur Kamera, FOV, Abstand und UI-Layout ändern sich.

## Safe Areas

Für Videos soll eine konfigurierbare Safe Area vorgesehen werden.

Orientierung:

- wichtige Landinformation nicht zu dicht am Rand
- Name/Flagge mindestens mit ca. 5–8 % Randabstand vom sichtbaren Bildbereich

## Renderauflösung

Browser-Vorschau kann kleiner sein.

Für eine spätere hochwertige Aufnahme/Renderstrecke sollen aber dieselben Szenenparameter auf:

- 1920×1080
- 1080×1920

angewandt werden können.

Version 1 muss nicht direkt MP4 erzeugen. Die Szene soll reproduzierbar genug sein, um über Screen Capture oder eine spätere Offline-Renderpipeline aufgezeichnet werden zu können.
