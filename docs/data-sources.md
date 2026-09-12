# Datenquellen und Datenaufbereitung

## 1. Ländergeometrie: Natural Earth

Empfohlene Quelle:

**Natural Earth – Admin 0 Countries, 1:110m**

https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/

Natural Earth stellt 1:110m ausdrücklich als für einen schematischen Welt-Globus geeignete Datengrundlage dar. Für 1:50m wird eine höhere Detailstufe angeboten, die bei stärkerem Länderzoom präziser ist. citeturn122344search0turn122344search3

Natural Earth erklärt seine Daten als Public Domain und erlaubt ausdrücklich Änderung und kommerzielle Nutzung. citeturn789462search0

## Entscheidung für 110m

Version 1 verwendet 110m.

Begründung:

- kleine Datenmenge
- schnelle Ladezeit
- wenig Geometrie
- für den Weltüberblick ausreichend
- Ländergrenzen bleiben im Filmstil erkennbar

Wenn Tests zeigen, dass einzelne Zielstaaten beim Close-up zu grob wirken, kann selektiv eine zweite 50m-Datenbasis eingeführt werden. Es soll nicht automatisch die gesamte Welt auf 50m umgestellt werden.

## Welche Natural-Earth-Datei?

Primär:

- `Admin 0 – Countries`

Optional:

- `Admin 0 – Boundary Lines`, wenn die Grenzlinien gegenüber den Länderpolygonen separat behandelt werden sollen.

Natural Earth weist darauf hin, dass `Countries` unterschiedliche Gebietseinheiten und abhängige Gebiete separat modellieren kann. Das Verhalten muss daher anhand der im Tool gewünschten Länderlogik festgelegt werden. citeturn122344search5

## Länderidentifikation

Die Geometrie braucht einen stabilen Schlüssel.

Priorität:

1. ISO Alpha-2 / Alpha-3, sofern vorhanden
2. Natural-Earth-Identifier
3. eigener interner Schlüssel

Das Tool sollte niemals ausschließlich anhand des sichtbaren Ländernamens arbeiten.

Beispiel:

```text
DE -> DEU -> Deutschland
US -> USA -> Vereinigte Staaten
JP -> JPN -> Japan
```

## Flaggen

Für die Flaggen wird empfohlen:

**flag-icons**

https://github.com/lipis/flag-icons

Das Projekt stellt eine Sammlung von Länderflaggen als SVG zur Verfügung und kann per npm eingebunden werden. Die Flaggen können beim Build lokal übernommen werden. Das Repository ist unter MIT-Lizenz veröffentlicht. citeturn122344search1turn789462search2

Wichtig: Nicht die gesamte Bibliothek blind in jede Szene laden. Nur die benötigte Flagge soll zur Laufzeit als Textur decodiert/hochgeladen werden.

## Flagge + Name als visuelle Textur

Der einfachste robuste Weg ist eine dynamisch erzeugte, lokal gerenderte Overlay-Textur:

1. Länderpolygon dient als Maske.
2. Flaggen-SVG wird in eine kleine Offscreen-Canvas-Textur gerendert.
3. Der Landesname wird in derselben Textur als typografische Ebene ergänzt.
4. Das Ergebnis wird nur auf dem ausgewählten Land verwendet.
5. Nach Wechsel auf ein anderes Land wird die alte Textur freigegeben oder aus einem kleinen LRU-Cache genommen.

Dadurch ist nicht für jedes Land permanent eine Flaggen-Textur auf der GPU vorhanden.

### Alternative

Eine Flagge kann zunächst auch als leicht versetztes, flaches Label über dem Zielstaat liegen. Diese Variante ist wesentlich einfacher. Sie soll in Version 1 bevorzugt werden, falls ein echtes polygonbasiertes Textur-Mapping unnötig komplex wird.

## Datenaufbereitung

Der AI-Coding-Agent soll ein kleines vorbereitetes Datenformat erzeugen:

```text
public/data/countries.geojson
public/data/country-index.json
public/flags/*.svg
```

`country-index.json` enthält kompakte Metadaten für die Suche. Die GeoJSON-Datei enthält nur die tatsächlich benötigten Attribute.

Unnötige Natural-Earth-Attribute werden entfernt, um die Ladegröße klein zu halten.

## Offline-Prinzip

Nach dem Build darf die Anwendung keine externe Daten-API benötigen.

Das ist wichtig für:

- reproduzierbare Videos
- stabile Renderbedingungen
- Nutzung ohne Internet
- keine CORS-Überraschungen
- keine Änderungen eines externen Kartendienstes während eines Filmprojekts
