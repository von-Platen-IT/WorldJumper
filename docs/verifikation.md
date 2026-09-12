# Verifikation

Dieses Dokument hält fest, was tatsächlich geprüft wurde – und womit es reproduzierbar ist.

## Automatisierte Prüfungen

```bash
npm run typecheck   # tsc --noEmit, keine Fehler
npm run smoke       # kopflose Prüfungen gegen die echten Daten
npm run build       # tsc --noEmit + vite build
```

### Build-Ergebnis

```text
dist/index.html                   1.06 kB │ gzip:   0.47 kB
dist/assets/index-*.css           5.95 kB │ gzip:   2.03 kB
dist/assets/index-*.js          577.41 kB │ gzip: 147.36 kB
✓ built
```

### Smoke-Test-Ergebnis

Getestet mit Node 24.21.0 gegen `public/data/countries.geojson` und `public/data/country-index.json`.

```text
✓ countries built  (177)
✓ land vertices present  (796011 vertices)
✓ land indices valid  (265337 triangles)
✓ borders present  (11791 segments)
✓ no NaN in land positions
✓ land vertices sit on the land radius  (r=2.0080)
✓ no oversized land triangles  (max chord=0.0875 (2.50 deg))
✓ chord sag stays below the land offset  (sag=0.00048 < offset=0.0080 (17x margin))
✓ land tessellation is meaningful  (265337 triangles)
✓ all land triangles face outwards  (0 inward of 265337)
✓ fill complete for US  (mesh/truth=0.9738)
✓ fill complete for BR  (mesh/truth=0.9940)
✓ fill complete for RU  (mesh/truth=0.9856)
✓ fill complete for CN  (mesh/truth=0.9923)
✓ fill complete for AU  (mesh/truth=0.9893)
✓ fill complete for DE  (mesh/truth=0.9964)
✓ border segments follow the sphere  (max segment=0.0526)
✓ every index entry has geometry  (177/177)
✓ Germany has vertices  (483)
✓ Germany has an outline  (57 segments)
✓ orient DE faces camera  (dot(z)=1.000000)      northY=0.628
✓ orient JP faces camera  (dot(z)=1.000000)      northY=0.809
✓ orient BR faces camera  (dot(z)=1.000000)      northY=0.983
✓ orient US faces camera  (dot(z)=1.000000)      northY=0.768
✓ orient NZ faces camera  (dot(z)=1.000000)      northY=0.720
✓ orient ID faces camera  (dot(z)=1.000000)      northY=1.000
✓ orient RU faces camera  (dot(z)=1.000000)      northY=0.410
✓ quaternion slerp is short path  (dot=0.446)
✓ no antimeridian artefacts  (max segment=0.0526)
✓ resolve "deu" -> Deutschland
✓ resolve "germany" -> Deutschland
✓ resolve "Deutschland" -> DE
✓ resolve "japan" -> JP
✓ resolve "brasilien" -> BR
✓ resolve "vereinigte staaten" -> US
✓ resolve "usa" -> US
✓ rejects nonsense
✓ search "deu" ranks Germany first
✓ search is accent tolerant
```

Was diese Zahlen belegen:

- **`dot(z) = 1.000000`** für sieben sehr unterschiedlich gelegene Länder: Nach der Ausrichtung liegt der Landesschwerpunkt exakt auf der Kameraachse. Es gibt keinen Restversatz, der beim Zoomen sichtbar würde.
- **`northY > 0.4`** über alle getesteten Länder: Der Nordpol bleibt auf der oberen Bildhälfte. Der Globus kippt nicht unangenehm.
- **`dot = 0.446`** zwischen Japan und USA: Der Winkel zwischen beiden Zielorientierungen ist kleiner als 180°, der Slerp nimmt also den kürzeren Weg. Ein Japan-Flug von Europa aus macht keine zusätzliche halbe Umdrehung.
- **`sag = 0.00048 < offset = 0.0080`**: Der Durchhang der flachsten Landfläche liegt 17× unter dem Radius-Offset. Die Ozeankugel kann die Füllung nicht mehr verdecken. Siehe [Behobene Fehler](#behobene-fehler).
- **`0 inward von 265337`**: Jedes Dreieck zeigt nach außen, es wird keines als Rückseite weggecullt.
- **`mesh/truth = 0.974 … 0.996`**: Die gefüllte Fläche entspricht der unabhängig integrierten Landesfläche. Sie liegt minimal darunter (Splitter-Filter, Sehnen an den Rändern), aber nie darüber.
- **`max segment = 0.0526`** bei einem Kugelradius von 2: Kein Grenzsegment überspannt die Erdkugel. Der Antimeridian (180. Längengrad) erzeugt keine Artefakte.
- **`177/177`**: Jedes Land aus dem Suchindex hat auch Geometrie – es kann keine „leere“ Auswahl geben.

## Behobene Fehler

### Dunkle Flecken / nur Rand statt Fläche (Version 1.1)

**Symptom:** Länder erschienen nur an den Grenzen gefüllt, innen war die Ozeanfarbe zu sehen. Besonders auffällig bei großen Ländern wie den USA, unauffällig bei kleinen wie Deutschland. Zusätzlich einzelne dunkle Flecken.

**Ursache 1 – Sehnendurchhang.** Die triangulierten Dreiecke sind flach. Messung an den Rohdaten:

| Messwert | Vorher | Nachher |
| --- | --- | --- |
| größte Dreieckskante | 1,6416 (48,35°) | 0,0875 (2,50°) |
| Sehnendurchhang der Innenfläche | **0,1758** | **0,00048** |
| verfügbarer Radius-Offset | 0,0044 | 0,0080 |
| Verhältnis | 40× zu klein | **17× Reserve** |

Bei großen Ländern hing die Dreiecksmitte also 0,176 Einheiten unter der Oberfläche. Die Ozeankugel lag davor und verdeckte sie – übrig blieb nur der schmale Streifen nahe den Eckpunkten, also optisch „nur die Ränder".

**Ursache 2 – 68 falsch gewickelte Dreiecke.** Diese wurden als Rückseiten weggecullt und erzeugten die einzelnen dunklen Flecken. Die Wicklung wird jetzt pro Dreieck erzwungen.

**Ursache 3 – entartete Splitter-Dreiecke.** Die Kantenverdichtung fügt Punkte exakt auf geraden Längengradlinien ein (z. B. Chinas Grenzen). Diese Punkte sind kollinear, `earcut` bildet daraus Dreiecke ohne Fläche (Fläche 2,4e-6). Sie werden verworfen.

**Ursache 4 – Unterteilung im falschen Raum.** Der erste Korrekturversuch unterteilte über 3D-Mittelpunkte. Ein 3D-Mittelpunkt liegt auf dem Großkreis, der von der Längen-/Breitengradlinie abweicht und sich zum Pol wölbt. Russlands Innendreiecke spannen bis zu 104° Längengrad – über Großkreise unterteilt wuchs die gefüllte Fläche um **28 %** und lief über die Grenzen hinaus (mesh/Referenz 1,2755). Die Unterteilung erfolgt jetzt im Parameterraum; die Mittelpunkt-Unterteilung in der Ebene tilingt das Dreieck exakt, die Projektion erhält die Region also unverändert. Ergebnis: 1,0421 → gegen die echte Grundwahrheit 0,9856.

**Anmerkung zur Messmethode:** Der naheliegende Flächenvektor-Algorithmus (`|Σ p×q|/2`) ist als Referenz ungeeignet, weil er Großkreis-Sehnen annimmt, während die Natural-Earth-Daten geraden Längen-/Breitengradlinien folgen. Bei Russland unterschätzt er die Fläche um 5,4 % und hätte den Fehler teilweise verdeckt. Der Test nutzt deshalb eine unabhängige Scanline-Integration über cos(lat)·dLon·dLat, deren Ergebnis bei 0,05° und 0,1° Rasterweite übereinstimmt (konvergiert).

### Ausgelieferte Assets

Der Produktionsbuild wurde über `vite preview` ausgeliefert und geprüft:

```text
200  /
200  /data/countries.geojson
200  /data/country-index.json
200  /flags/de.svg
200  /flags/jp.svg
```

Damit ist belegt, dass die Anwendung nach dem Build ohne externe Quelle vollständig ladefähig ist. Es gibt keine Laufzeit-API-Abhängigkeit.

## Datenqualität

Nach der Aufbereitung (`npm run data`):

| Kennzahl | Wert |
| --- | --- |
| Länder | 177 |
| Länder mit Flagge | 175 |
| ohne Flagge | Somaliland, Türkische Republik Nordzypern (keine Ressource in `flag-icons`) |
| Geometrie | 200 kB |
| Index | 36 kB |

Kontrollpunkte der Schwerpunktberechnung (dominante Landmasse statt Durchschnitt aller Gebiete):

| Land | lat | lon | Winkelradius |
| --- | --- | --- | --- |
| Deutschland | 51,08 | 10,26 | 0,070 |
| Frankreich | 46,55 | 2,31 | 0,089 |
| Vereinigte Staaten | 39,87 | −98,73 | 0,416 |
| Brasilien | −10,65 | −53,17 | 0,403 |
| Japan | 36,01 | 136,72 | 0,124 |
| Neuseeland | −43,96 | 170,59 | 0,068 |
| Russland | 65,79 | 95,33 | 0,650 |

Frankreich liegt plausibel in Metropolitan-Frankreich (nicht bei 43°/173° durch Réunion), die USA im Kernland (nicht bei Alaska/Hawaii). Genau das war ein Fehler in der ersten Fassung und ist seither durch die Auswahl der dominanten Landmasse behoben.

## Manuelle Prüfliste

Vor einem Filmeinsatz zu empfehlen:

- [ ] Deutschland: kompaktes Land, füllt das Bild, Grenze klar, Flagge und Name lesbar
- [ ] Frankreich: Metropolitan-Frankreich wird zentriert, nicht die Überseegebiete
- [ ] Japan: Inselstaat, keine leere Wasserfläche im Bild
- [ ] USA: Kernland wird gezeigt
- [ ] Brasilien, Indonesien: große, meerübergreifende Länder
- [ ] Neuseeland: weit entfernt, Rotation nimmt den kurzen Weg
- [ ] Russland: sehr groß, Zoom bleibt moderat, Globus bleibt erkennbar
- [ ] Liste `Deutschland → Frankreich → Japan`: Reihenfolge stimmt, Pause nur dazwischen
- [ ] Liste mit fünf Ländern: kein Durchlauf hängt, Endzustand bleibt stehen
- [ ] `R` mitten im Zoom: fährt sauber zurück, Globus dreht wieder
- [ ] `Enter` ohne Treffer: Fehlermeldung, keine leere Sequenz
- [ ] Umschalten 16:9 → 9:16 im Ruhezustand: Bühne wechselt ohne Verzerrung
- [ ] Fenstergröße ändern während der Ruhe und während der Fahrt
- [ ] `H` ausblenden, `S` prüfen: Aufnahmebereitschaft

## Bekannte Grenzen

- Die 110m-Geometrie ist bewusst grob. Kleine Inselstaaten erscheinen vereinfacht; das ist ausdrücklich gewünscht, weil Performance und klare Optik Vorrang vor Kartografie haben.
- Die Hervorhebung des Zielstaat nutzt Vertex-Farben und eine verstärkte Grenzlinie. Ein pixelgenaues Flaggen-Mapping innerhalb der Landesfläche ist bewusst nicht Teil von Version 1 (siehe auch [Animationsspezifikation](animation-spec.md) und [Datenquellen](data-sources.md)).
