# Performance und Qualitätsregeln

## Priorität

1. stabile Animation
2. geringe Komplexität
3. klare Ländergrenzen
4. sauberer filmischer Look
5. geografische Detailtreue

## Geometrie

110m Natural Earth ist der Default.

Vor dem Erzeugen der Three.js-Geometrie:

- unnötige Attribute entfernen
- möglichst wenige Vertex-Dopplungen
- kleine Inseln bzw. extrem kleine Polygone nach einem nachvollziehbaren Schwellwert entfernen, falls sie visuell nichts beitragen
- Geometrien wiederverwenden
- dünne Dreiecke ("Splitter") nicht nach ihrem Seitenverhältnis verwerfen. Sie decken echte Fläche ab; ihr Wegfall reißt keilförmige Löcher, durch die die dunkle Ozeankugel sichtbar wird. Ursache und Messwerte: [Verifikation](verifikation.md#dunkle-keile-in-großen-ländern-kanada-usa)

## Draw Calls

Ziel: möglichst wenige Materialien und Meshes.

Die gesamte Welt muss nicht aus hunderten separaten, unabhängig gerenderten Meshes bestehen.

Besser:

- gemeinsame Geometrien, wo möglich
- Instancing nur einsetzen, wenn es die Architektur wirklich vereinfacht
- Border-Layer als zusammengefasste Liniengeometrie

## Texturen

Keine große Weltkarte als permanente 8K-Textur.

Globus bevorzugt:

- Material-/Farbstil
- optional kleine generische Kontinent-/Ozeantextur
- keine Satellitendaten

Flaggen:

- SVG lokal
- nur bei Auswahl decodieren
- kleine Renderauflösung
- nach Benutzung freigeben oder begrenzt cachen

## Device Pixel Ratio

Nie blind den nativen `devicePixelRatio` als Renderfaktor verwenden.

Auf sehr hochauflösenden Displays kann z. B. ein internes Limit sinnvoll sein.

Ziel ist nicht maximale Retina-Schärfe, sondern stabile Full-HD-ähnliche Vorschau.

## Post Processing

Version 1:

**kein verpflichtendes Post Processing**.

Ein späterer optionaler Layer kann:

- sehr schwaches Bloom
- leichte Vignette
- leichte Farbkorrektur

hinzufügen.

Diese Effekte dürfen niemals Grundfunktionalität des Tools voraussetzen.

## Animation

Während einer Kamerafahrt sollen keine großen Datenmengen erzeugt oder gelöscht werden.

Animation verändert primär:

- Rotation einer Gruppe
- Kamera-Transform
- Opazität/Intensität von Materialien
- Transform der Highlight-Layer

## Render Loop

Der Loop soll nur rendern und einen kleinen Zustand aktualisieren.

Kein:

- JSON-Parsen pro Frame
- GeoJSON-Konvertieren pro Frame
- Flaggen-Decoding pro Frame
- aufwändige trigonometrische Suche über alle Länder pro Frame

## Profiling

Three.js stellt Renderer-Informationen wie Draw Calls, Dreiecke und Textur-/Geometrieanzahl bereit. Diese Informationen sollen während der Entwicklung regelmäßig geprüft werden. citeturn976521search0

## Mindest-Testgeräte

Mindestens testen auf:

- normalem Desktop-Browser
- älterem Desktop/GPU
- aktuellem Mobilgerät
- Portrait-Viewport
- Landscape-Viewport

Die Anwendung soll nicht nur auf der Entwicklungsmaschine flüssig wirken.

## Qualitätsziel

Der Nutzer soll im finalen Video nicht bemerken, dass die Weltkarte absichtlich vereinfacht wurde. Die Vereinfachung soll wie ein bewusstes Grafikdesign wirken.
