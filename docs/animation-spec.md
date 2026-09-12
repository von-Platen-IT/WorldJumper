# Animationsspezifikation

## Grundsatz

Die Bewegung soll nicht wie eine GIS-Karte wirken. Sie soll wie eine geplante Kamerafahrt in einem Film aussehen.

Alle Zeiten sind zentrale Konfigurationswerte und nicht über viele Dateien verteilt.

## Idle

Zustand: `IDLE`

- Globus langsam drehen
- konstante oder sehr leicht modulierte Geschwindigkeit
- Kamera zeigt einen großzügigen Weltblick
- Eingabefeld sichtbar

Empfohlene Größenordnung:

- ca. 15–30 Sekunden für eine vollständige Weltumdrehung

Der genaue Wert ist bewusst nur ein Startwert und soll leicht konfigurierbar sein.

## Eingabephase

Zustand: `INPUT`

Beim Tippen:

- Autocomplete filtert die bekannte Länderliste
- keine Kamerabewegung
- Idle-Drehung kann weiterlaufen oder sehr sanft pausieren

Bei `Enter`:

- ausgewähltes Land endgültig bestimmen
- Input ausblenden
- Autocomplete schließen
- Animation Director übernimmt

## Pause

Zustand: `PAUSE_BEFORE_ACTION`

Exakt ungefähr:

**1000 ms**

Während dieser Sekunde soll das Bild bewusst ruhig bleiben. Das ist für den Filmschnitt erwünscht.

## Vorbereitung

Zustand: `PREPARE_GLOBE`

Die Kamera zieht leicht zurück, sodass der Globus als Ganzes wieder erkennbar ist.

Gleichzeitig:

- bisherige starke Hervorhebung ausblenden
- Farbe/Textur des vorherigen Ziels sanft entfernen
- normale Landesflächen wieder herstellen

Die Übergänge sollen weich sein, nicht abrupt.

## Orientierung

Zustand: `ORIENT_TO_COUNTRY`

Der Globus dreht sich so, dass das Ziel-Land in Richtung Kamerazentrum gelangt.

### Wichtig

Die kürzere Rotationsrichtung verwenden. Keine unnötige 300°-Drehung, wenn eine 60°-Drehung genügt.

Für ästhetische Kontrolle darf später ein Konfigurationswert die Richtung überschreiben.

Die Zielausrichtung wird aus Breiten-/Längengrad oder aus einem vorbereiteten Länder-Schwerpunkt berechnet.

## Zoom

Zustand: `ZOOM_TO_COUNTRY`

Kamera und Globus bewegen sich in einer kombinierten Sequenz:

- Globusrotation wird langsam beendet
- Kamera zoomt auf das Land
- Zielstaat wird aktiv hervorgehoben
- Flagge und Name blenden ein

Der Globus bleibt dabei als räumlicher Körper erkennbar. Nicht bis zum kompletten "Flatten" hineinzoomen.

## Easing

Keine lineare Bewegung für die Filmsequenz.

Empfohlen:

- sanftes Ease-In
- beschleunigte Mittelphase
- sanftes Ease-Out

Die Kurve sollte in der Mitte sichtbar dynamisch sein, an Anfang und Ende aber ruhig.

## Endzustand

Das ausgewählte Land steht im Fokus.

Sichtbarkeit:

- Land großflächig
- Grenze klar
- Flagge sichtbar
- Name sichtbar
- übriger Globus noch erkennbar

Keine automatische Rückkehr zu Idle, solange der Nutzer nicht eine neue Sequenz startet.

## Sequenzmodus

Für eine Liste:

```text
Land A
  ↓
Hold
  ↓
1 s Pause
  ↓
Land B
  ↓
Hold
  ↓
1 s Pause
  ↓
Land C
```

Die 1-Sekunden-Pause soll **zwischen** zwei Aktionen liegen, nicht versehentlich zusätzlich vor dem ersten Land und nach dem letzten Land.

## Reset

Ein Reset muss jederzeit möglich sein.

Reset bedeutet:

- laufende Animation stoppen
- Highlight entfernen
- Flaggen-/Namenslayer ausblenden
- Kamera auf Ausgangskonfiguration setzen
- Idle-Rotation starten
- UI wieder einblenden

## Keine Audioabhängigkeit

Es existiert keine Audio-Clock und keine Audiologik.

Zeitsteuerung basiert ausschließlich auf einer stabilen Render-/Animation-Clock.
