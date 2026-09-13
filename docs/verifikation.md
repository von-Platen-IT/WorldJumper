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
✓ land vertices present  (214239 vertices)
✓ land indices valid  (71413 triangles)
✓ borders present  (11791 segments)
✓ no NaN in land positions
✓ land vertices sit on the land radius  (r=2.0080)
✓ no oversized land triangles  (max chord=0.0875 (2.50 deg))
✓ chord sag stays below the land offset  (sag=0.00048 < offset=0.0080 (17x margin))
✓ land tessellation is meaningful  (71413 triangles)
✓ all land triangles face outwards  (0 inward of 71413)
✓ fill complete for CA  (mesh/truth=1.0007)
✓ fill complete for US  (mesh/truth=0.9996)
✓ fill complete for GL  (mesh/truth=0.9997)
✓ fill complete for RU  (mesh/truth=1.0000)
✓ fill complete for BR  (mesh/truth=1.0001)
✓ fill complete for CN  (mesh/truth=1.0000)
✓ fill complete for AU  (mesh/truth=1.0001)
✓ fill complete for KZ  (mesh/truth=1.0000)
✓ fill complete for DE  (mesh/truth=0.9998)
✓ border segments follow the sphere  (max segment=0.0526)
✓ every index entry has geometry  (177/177)
✓ Germany has vertices  (291)
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
✓ highlight uniforms injected
✓ highlight attribute declared
✓ highlight varying written
✓ highlight mix injected
✓ label stays inside the safe area in both formats
✓ label keeps the card aspect ratio
✓ label size does not depend on the country
✓ label width follows the configured frame fraction  (30.0% der Bildbreite)
```

Was diese Zahlen belegen:

- **`dot(z) = 1.000000`** für sieben sehr unterschiedlich gelegene Länder: Nach der Ausrichtung liegt der Landesschwerpunkt exakt auf der Kameraachse. Es gibt keinen Restversatz, der beim Zoomen sichtbar würde.
- **`northY > 0.4`** über alle getesteten Länder: Der Nordpol bleibt auf der oberen Bildhälfte. Der Globus kippt nicht unangenehm.
- **`dot = 0.446`** zwischen Japan und USA: Der Winkel zwischen beiden Zielorientierungen ist kleiner als 180°, der Slerp nimmt also den kürzeren Weg. Ein Japan-Flug von Europa aus macht keine zusätzliche halbe Umdrehung.
- **`sag = 0.00048 < offset = 0.0080`**: Der Durchhang der flachsten Landfläche liegt 17× unter dem Radius-Offset. Die Ozeankugel kann die Füllung nicht mehr verdecken. Siehe [Behobene Fehler](#behobene-fehler).
- **`0 inward von 71413`**: Jedes flächige Dreieck zeigt nach außen, es wird keines als Rückseite weggecullt. Entartete Dreiecke ohne Fläche sind von der Prüfung ausgenommen, weil ihre Normalenrichtung numerisch bedeutungslos ist und sie kein Pixel abdecken.
- **`mesh/truth = 0.9996 … 1.0007`**: Die gefüllte Fläche entspricht praktisch exakt der unabhängig integrierten Landesfläche. Die Restabweichung unter 0.1% entsteht nur durch Sehnen an den Rändern. Die frühere Untergrenze von 0.95 hat einen Fehler durchgelassen, der 2.6% bis 6.5% der Fläche verschluckte (siehe [Dunkle Keile](#dunkle-keile-in-großen-ländern-kanada-usa)).
- **`max segment = 0.0526`** bei einem Kugelradius von 2: Kein Grenzsegment überspannt die Erdkugel. Der Antimeridian (180. Längengrad) erzeugt keine Artefakte.
- **`177/177`**: Jedes Land aus dem Suchindex hat auch Geometrie – es kann keine „leere“ Auswahl geben.

## Headless-Sichtprüfung

Die Geometrie ist headless prüfbar, die *Darstellung* nicht – und genau der Unterschied war hier entscheidend: Die dunklen Keile entstanden aus fehlender Fläche unterhalb der Sichtbarkeitsschwelle der Flächenprüfung.

`node scripts/serve-diag.mjs` liefert den gebauten Stand aus und hängt eine Sonde ein, die `preserveDrawingBuffer` erzwingt und die echte WebGL-Leinwand zurückmeldet. Headless-Firefox setzt die GL-Fläche nicht in `--screenshot` um, deshalb wird das Bild aus der Seite herausgelesen und nach `/tmp/wj-canvas.png` geschrieben; die GPU-Kennzahlen landen in `/tmp/wj-probe.json`. Ein absichtlich langsames Bild hält dabei das `load`-Ereignis offen, bis die Geometrie aufgebaut und gerendert ist.

Damit ließ sich der Fehler reproduzieren und die Korrektur belegen. Die gerasterte Aufnahme in dieser Umgebung meldete `depthBits: 24`, `WebGL 2.0`, Renderer `llvmpipe`.

## Behobene Fehler

### Falsches Timing der Eingabemaske

**Symptom:** Die Fahrt begann, während die Maske noch ausblendete, und am Ende erschien die Maske, bevor das Label zu lesen war.

**Ursache.** Beide Übergänge liefen gleichzeitig statt nacheinander:

1. `AppController.startSequence()` blendete die Maske aus und rief **sofort** `director.start()` auf. Die 1000 ms Pause lief also parallel zur 480 ms dauernden Ausblendung.
2. `onStatus()` blendete die Maske im `HOLD` sofort wieder ein, im selben Moment, in dem das Label erschien.

**Lösung.**

1. [`SearchUI.hideForSequence()`](../src/ui/SearchUI.ts:1) blendet aus und löst erst nach dem `transitionend` auf (mit Zeitüberschreitung als Rückfall). `startSequence()` wartet darauf und startet die Sequenz erst danach. Das entspricht auch der ursprünglichen Vorgabe „UI ausblenden, dann 1000 ms Pause".
2. Die Maske kommt im `HOLD` erst nach `TIMING.maskAfterHold` (1000 ms) zurück. Der Zeitgeber wird bei jedem Phasenwechsel verworfen, und `E` kann ihn übersteuern.
3. Die Fadedauer liegt als `PANEL_FADE_MS` in der Konfiguration und wird beim Start als CSS-Variable `--panel-fade` gesetzt, damit Übergang und Wartezeit nicht auseinanderlaufen können.

**Verifikation** (headless, Ereignisprotokoll aus Maske und Phasen):

| Zeitpunkt | Ereignis |
| --- | --- |
| 243 ms | Maske ausgeblendet |
| 732 ms | `PAUSE_BEFORE_ACTION` beginnt – **erst nach** dem Ausblenden |
| 40 495 ms | `HOLD` erreicht, Maske weiterhin verborgen |
| 45 360 ms | Maske kehrt zurück |

Die Verzögerung am Ende misst 4272 ms statt 1000 ms. Das ist die Umgebung, nicht die Anwendung: Ein Kontroll-`setTimeout(1000)` feuert im selben Lauf erst nach **4222 ms**, weil der Software-Rasterizer den Hauptthread blockiert. Die App-Verzögerung entspricht dem Kontrollwert.

### Hartes Zurücksetzen bei der Eingabe eines weiteren Landes

**Symptom:** Wurde bei bereits angezeigtem Land ein weiteres eingegeben, verschwand die Markierungsfarbe des bisherigen Landes schlagartig, und die Ansicht wirkte wie ein Sprung zurück in die Ausgangsansicht. Die Eingabemaske war im angezeigten Zustand überhaupt nicht erreichbar – man musste mit `R` oder `Esc` zurücksetzen, was genau den unerwünschten Sprung erzeugte.

**Ursache.**

1. [`AnimationDirector.start()`](../src/animation/AnimationDirector.ts:110) löschte Akzent und Label **sofort** (`setActive(null)`, `setIntensity(0)`, `label.hide()`). Die Übergangslogik hätte beides weich ausblenden können – sie zeichnet die laufende Intensität und Label-Deckkraft als Startwerte auf –, aber der harte Reset zerstörte diese Startwerte, bevor sie gelesen wurden.
2. [`AppController.onStatus()`](../src/app/AppController.ts:143) behandelte nur `IDLE` und `INPUT` als bedienbar und blendete die Maske im `HOLD` aus. Damit war die Eingabe gesperrt, sobald ein Land stand.

**Lösung.**

1. `start()` setzt die Akzent- und Labelwerte nicht mehr zurück. `PREPARE_GLOBE` blendet das bisherige Land weich aus und zieht die Kamera heraus, bevor `ORIENT` und `ZOOM` zum nächsten Land führen. Beim Start aus dem Ruhezustand ändert sich nichts, weil die Startwerte dort ohnehin 0 sind.
2. Der `HOLD` gilt jetzt als bedienbar: Nach jeder Fahrt kommt die Maske zurück, ohne die Ansicht zu verändern. Beim Absenden verschwindet sie und die Fahrt beginnt.
3. Neue Taste `E` blendet die Maske von Hand aus, ohne Szene oder Zustand anzufassen – für Aufnahmen ohne Maske. Jeder Phasenwechsel hebt die manuelle Ausblendung wieder auf. Beim Ausblenden gibt das Feld den Fokus ab, damit die Tastenkürzel weiter greifen.

**Verifikation** (headless, siehe [Headless-Sichtprüfung](#headless-sichtprüfung)):

| Zeitpunkt | Beobachtung |
| --- | --- |
| Pause nach der zweiten Eingabe | Das bisherige Land ist noch vollständig markiert und sein Label sichtbar – vorher wäre beides hier bereits gelöscht gewesen |
| `Vorbereitung` desselben Wechsels | Kamera auf die Totale herausgezogen, Markierung weich auf die Grundfarbe geblendet, Label ausgeblendet |

Zusätzlich programmatisch geprüft: Maske im Halt sichtbar, nach `E` unsichtbar, nach erneutem `E` wieder sichtbar, beim Absenden unsichtbar.

### Falsch ausgerichtete und übergroße Länderkarte

**Symptom:** Die Flaggen-/Namenskarte stand schief und füllte bei großen Ländern fast das ganze Bild; sie ragte über den Rahmen hinaus.

**Ursache.** Zwei voneinander unabhängige Fehler:

1. **Beliebige Rollung.** [`CountryLabel.show()`](../src/scene/CountryLabel.ts:1) richtete die Ebene mit `setFromUnitVectors(PLANE_FACING, anchor)` aus. Diese Funktion liefert die kürzeste Drehung und damit eine beliebige Drehung um die Blickachse – der Text stand schief.
2. **Größe aus dem Winkelradius.** Die Karte wurde mit `0.62 + angularRadius * 1.9` skaliert, also bis 1,9 Welteinheiten. Bei Deutschlands Zoomabstand 2,84 ist die sichtbare Bildhöhe nur `2 · 2,84 · tan(21°) ≈ 2,18` Einheiten. Die Karte füllte damit fast das gesamte Bild und lief durch den Versatz nach Norden zusätzlich über den Rand.

**Lösung.**

1. **Bildparallele Ausrichtung.** Die Karte hängt nicht mehr an der rotierenden Globus-Gruppe, sondern an der Szene. Da [`CameraRig.apply()`](../src/scene/CameraRig.ts:44) mit Standard-`up` auf den Ursprung schaut, hat die Kamera keine Rollung; die Karte übernimmt die Kameradrehung und steht damit exakt horizontal.
2. **Größe in Bildbruchteilen.** Die Karte wird über das sichtbare Bildfeld an ihrer Tiefe bemessen: Breitenanteil je Format (30% Querformat, 60% Hochformat), begrenzt durch einen Höhenanteil. Die Abhängigkeit vom Winkelradius entfällt, kleine und große Länder sind gleich groß. Das `min()` aus Breiten- und Höhengrenze hält die Karte auch in flachen Formaten im Bild.
3. **Klemmung in die Safe Area.** Der Landesmittelpunkt wird projiziert, um einen festen Bildversatz nach oben verschoben (damit die Karte das Land nicht verdeckt) und so geklemmt, dass **Karte samt Ausdehnung** innerhalb `1 − safeAreaInset` bleibt. Der geklemmte Bildversatz wird über die Kameraachsen in eine Weltverschiebung zurückgerechnet.

Die Rechnung liegt als reine Funktion in [`labelLayout.ts`](../src/scene/labelLayout.ts:1) und ist dadurch headless prüfbar.

**Verifikation** (headless gerasterte WebGL-Aufnahme, siehe [Headless-Sichtprüfung](#headless-sichtprüfung)):

| Fall | Ergebnis |
| --- | --- |
| Deutschland, Querformat | Karte horizontal, 30% der Bildbreite, oberhalb des Landes, vollständig im Bild |
| Kanada, Querformat | gleiche Kartengröße wie bei Deutschland trotz viel größerer Fläche |
| Deutschland, Hochformat | Karte horizontal, 60% der Bildbreite, vollständig im Bild |

Im Smoke-Test bleibt die Karte für beide Formate und sechs Ankerpositionen – darunter bewusst Positionen außerhalb des Bildes – vollständig in der Safe Area, ihr Seitenverhältnis bleibt erhalten, und ihre Größe hängt nicht vom Land ab.

### Dunkle Keile in großen Ländern (Kanada, USA)

**Symptom:** Über Kanada und den USA zogen dünne, dunkle, dreieckige Keile durch die Landesfläche. Kleine Länder wie Deutschland waren unauffällig.

**Ursache.** Die Dreiecksfläche wurde nach ihrem Seitenverhältnis gefiltert: [`flushTriangle()`](../src/geography/GeographyEngine.ts:138) verwarf jedes Dreieck mit Höhe/Längskante < 0.02. Die Unterteilung erzeugt vier *ähnliche* Kinder – ein dünnes Dreieck bleibt also in jeder Ebene dünn und wurde ausnahmslos verworfen. Ein ganzes dünnes Earcut-Dreieck verschwand damit als keilförmiges Loch, durch das die dunkle Ozeankugel sichtbar wurde.

Verschärft wurde das durch die Kantenverdichtung: `densifyRing` setzte vor der Triangulierung Punkte exakt auf gerade Kanten, aus denen Earcut Kollinearitäts-Splitter bildete. Die Unterteilung erzeugte dadurch rund 4.1 Mio. Blattdreiecke für 265 000 sichtbare – das 15-fache an Arbeit.

Gemessene fehlende Fläche (Mesh-Fläche gegen unabhängige Scanline-Integration):

| Land | verworfene Blätter | fehlende Fläche |
| --- | --- | --- |
| Kanada | 8128 von 17312 (46.9%) | 6.5% |
| USA | 1938 von 10195 (19.0%) | 2.6% |
| Grönland | 828 von 4612 (18.0%) | 1.9% |
| Russland | 7246 von 49116 (14.8%) | 1.5% |
| Deutschland | 1 von 132 (0.8%) | 0.1% |

Die 2.6% für die USA stimmen exakt mit dem zuvor gemessenen `mesh/truth = 0.9738` überein – eine unabhängige Bestätigung. Ausgeschlossen wurden zuvor Triangulationsfehler (die 2D-Triangulierung tilet jede Polygonfläche exakt), Überlappungen, doppelte Dreiecke, falsche Wicklung, Radienfehler und Z-Fighting gegen die Ozeankugel (Rastertest: 0 von über 70 000 überlappenden Pixeln selbst bei 16-Bit-Tiefe).

**Lösung.**

1. **Triangulierung auf den unverdichteten Ringen.** [`preparePolygon()`](../src/geography/GeographyEngine.ts:141) liefert jetzt getrennt die verdichteten Ringe (für Grenzlinien) und die rohen Ringe (für die Triangulierung). Die Füllung folgt der Kugel trotzdem, weil die Unterteilung die Randkanten anschließend verfeinert.
2. **Verwerfen nur noch bei echter Entartung.** Die Schwelle sank von 0.02 auf 1e-6; praktisch alle Splitter bleiben erhalten und schließen die Lücken.
3. **Unterteilung durch Halbierung der längsten Kante** statt Vierteilung über alle Mittelpunkte. Die Vierteilung verfeinert auch die kurze Richtung und bläht dünne Regionen auf; die Halbierung verfeinert nur die Richtung, die tatsächlich zu grob ist.

**Ergebnis:**

| Kennzahl | vorher | nachher |
| --- | --- | --- |
| Dreiecke | 265 337 | **71 413** |
| Vertices | 796 011 | **214 239** |
| `buildWorld` (Median) | ~1550 ms | **~100 ms** |
| USA `mesh/truth` | 0.9738 | **0.9996** |
| Kanada `mesh/truth` | nicht geprüft | **1.0007** |

Die Korrektur beseitigt die Artefakte und erzeugt dabei **deutlich weniger Geometrie** statt mehr.

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

## Performance-Basis (Beginn des Refactorings)

Aufgenommen mit `npm run bench` (Node 24.21.0, dieselbe Maschine wie die Smoke-Tests). Der Benchmark misst die beiden rechenintensiven Pfade, die ohne Browser prüfbar sind: den einmaligen Geometrieaufbau und die Highlight-Aktualisierung, die die Animation während Vorbereitung und Zoom pro Frame auslöst.

Die Maschine ist eine geteilte VM; die Werte schwanken zwischen Läufen um bis zu 20 %. Eine erste Messung lag bei `buildWorld` scheinbar bei 3,3 s und bei Russland bei 1,2 ms/Frame – beides war Lastrauschen, nicht reproduzierbar. Verlässlich ist nur eine Messung mit Wertebereich.

Geometrie (konstant über alle Läufe):

```text
countries        177
land vertices    214239
land triangles   71413
border segments  11791
```

Die Zahlen gelten nach der Geometrie-Korrektur (siehe [Dunkle Keile](#dunkle-keile-in-großen-ländern-kanada-usa)); vorher waren es 796 011 Vertices und 265 337 Dreiecke. `buildWorld` sank dabei von rund 1550 ms auf **rund 100 ms**, weil die Unterteilung nicht mehr das Vielfache an Geometrie erzeugt, das anschließend verworfen wurde.

Vergleich Original gegen den Stand nach Phase 1 und Phase 2 (Phase 0/1 als Median aus fünf Läufen bzw. Bereich aus drei Läufen, Phase 2 als Einzelmessung nach der Änderung):

| Messwert | Original | nach Phase 1 | nach Phase 2 |
| --- | --- | --- | --- |
| `buildWorld` | 1604,6 ms | 1515–1594 ms | 1544–1717 ms |
| Highlight RU (125610 Vertices) | 0,889 ms/Frame | 0,78–0,93 ms/Frame | **0,001 ms/Frame** |
| Highlight US (24771 Vertices) | 0,153 ms/Frame | 0,14–0,16 ms/Frame | **<0,001 ms/Frame** |
| Länderwechsel (`setActive`) | 0,125 ms | 0,11–0,12 ms/switch | 0,070 ms/switch |

Einordnung:

- **`buildWorld`** lag zum Zeitpunkt dieser Messung bei rund 1,6 s. Nach der Geometrie-Korrektur sind es **rund 100 ms**, weil die Unterteilung nicht mehr ein Vielfaches an Geometrie erzeugt, das anschließend verworfen wird.
- **Phase 1 bewegt sich im Rauschen dieses Benchmarks.** Das ist erwartbar: Die entfernten Kleinallokationen sind kurzlebig und für V8 im Microbenchmark billig. Der Nutzen liegt im Dauerbetrieb (weniger GC-Druck), nicht in diesen Zahlen. Phase 1 enthält zusätzlich einen echten Logikfix (framerate-unabhängiger Label-Fade), der sich nicht in Millisekunden messen lässt.
- **Phase 2 ist der große Hebel.** Das Umschreiben der Vertex-Farben pro Frame ist vollständig verschwunden: Aus 0,889 ms/Frame werden 0,001 ms/Frame bei Russland, also rund **900× weniger CPU-Zeit**, und der zugehörige GPU-Upload von rund 1,5 MB pro Frame entfällt ersatzlos. An seine Stelle treten ein Uniform-Schreibzugriff pro Frame und ein einmaliger Marker-Schreibzugriff pro Länderwechsel. Deshalb halbiert sich auch `setActive` (0,125 → 0,070 ms).
- Die Hervorhebung selbst bleibt optisch identisch: Bei weißer Materialfarbe ist `mix(diffuseColor.rgb, uHighlightColor, vHighlight * uHighlightAmount)` exakt gleichbedeutend mit dem bisherigen Einmischen in die Vertex-Farbe.
- **`setActive`** fällt nur beim Länderwechsel an und ist unkritisch.
- Nach der Geometrie-Korrektur sind die Vertex-Zahlen der Länder deutlich kleiner (Russland 125 610 → 21 957, USA 24 771 → 7455). Der Highlight-Pfad bleibt davon unberührt: weiterhin ein Uniform pro Frame.

Die browserabhängigen Kennzahlen (FPS, Draw Calls, Dreiecke, Geometrien, Texturen) zeigt das HUD zur Laufzeit; sie werden in Phase 7 in beiden Formaten gegengemessen.

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
- [ ] `H` ausblenden, `L` blendet nur das Logo aus, `S` prüfen: Aufnahmebereitschaft
- [ ] Nach einer Fahrt ein zweites Land eingeben: keine Rückkehr zur Ausgangsansicht, das bisherige Land verliert weich seine Farbe, die Kamera zieht heraus und fährt direkt weiter
- [ ] `E` im Halt: Maske verschwindet, Land und Ansicht bleiben unverändert; erneut `E` bringt sie zurück
- [ ] Im Halt eintippen, `Enter`: Maske verschwindet und die nächste Fahrt startet ohne Sprung
- [ ] Beim Absenden: die Bewegung beginnt erst, wenn die Maske vollständig ausgeblendet ist
- [ ] Am Ende: der Endzustand steht etwa eine Sekunde ruhig, bevor die Maske zurückkommt

## Bekannte Grenzen

- Die 110m-Geometrie ist bewusst grob. Kleine Inselstaaten erscheinen vereinfacht; das ist ausdrücklich gewünscht, weil Performance und klare Optik Vorrang vor Kartografie haben.
- Die Hervorhebung des Zielstaat nutzt Vertex-Farben und eine verstärkte Grenzlinie. Ein pixelgenaues Flaggen-Mapping innerhalb der Landesfläche ist bewusst nicht Teil von Version 1 (siehe auch [Animationsspezifikation](animation-spec.md) und [Datenquellen](data-sources.md)).
