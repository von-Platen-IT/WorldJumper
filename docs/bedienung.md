# Bedienung und Dreh-Hinweise

## Start

1. `npm install`
2. `npm run data` (einmalig, benötigt Internet)
3. `npm run dev` und `http://localhost:5173` öffnen

Das Boot-Overlay zeigt den Fortschritt: Länderdaten laden, Geometrie aufbauen, Szene einrichten. Danach dreht sich der Globus langsam und das Eingabefeld erscheint.

## Zwei Eingabemodi

### Einzelnes Land

- Land eintippen. Gesucht wird gleichzeitig über deutschen Namen, englischen Namen, ISO2 und ISO3.
- Die Vorschlagsliste zeigt Flagge, Name und ISO3-Code.
- `↑` / `↓` markiert einen Vorschlag, `Enter` bestätigt.
- Gibt es genau einen Treffer, genügt `Enter` ohne Navigation.
- Gibt es mehrere Treffer und keinen markierten Vorschlag, startet **nichts**. Die Liste bleibt sichtbar, damit keine zufällige Auswahl entsteht.
- Gibt es keinen Treffer, erscheint eine kurze Fehlermeldung.

Nach erfolgreicher Auswahl blendet die Oberfläche aus. Die Sequenz startet erst, wenn die Maske vollständig verschwunden ist; während der Fahrt ist nur die Szene zu sehen. Am Ende bleibt das erreichte Land stehen, und die Maske kommt erst etwa eine Sekunde später zurück, damit das Label vorher in Ruhe zu lesen ist. Danach kann direkt das nächste Land eingegeben werden.

#### Mehrere Länder nacheinander ohne Liste

Wird bei stehendem Land direkt ein weiteres Land eingegeben, wird **nicht** zur Ausgangsansicht zurückgesetzt. Die Maske verschwindet, das bisherige Land verliert weich seine Markierungsfarbe und sein Label, die Kamera zieht heraus und fährt unmittelbar zum nächsten Land. Damit lässt sich auch im Einzelmodus eine Aufnahme mit mehreren Ländern nacheinander erzeugen.

### Länderliste

- Modus **Länderliste** wählen.
- Ein Land pro Zeile, alternativ durch Komma oder Semikolon getrennt.
- `Sequenz starten` oder `Enter` im Textfeld beginnt die Aufführung in der eingegebenen Reihenfolge.
- Nicht auflösbare Einträge werden vor dem Start gesammelt gemeldet; die Sequenz startet dann nicht.

Die Reihenfolge bleibt exakt erhalten. Zwischen zwei Ländern liegt genau eine Sekunde Pause, nicht davor und nicht danach.

## Zeitlicher Ablauf

| Phase | Dauer | Was zu sehen ist |
| --- | --- | --- |
| `IDLE` / `INPUT` | offen | Globus dreht langsam, Suchfeld sichtbar |
| `PAUSE_BEFORE_ACTION` | 1000 ms | bewusst ruhiges Bild, Schnittpunkt |
| `PREPARE_GLOBE` | 850 ms | Kamera zieht heraus, Globus wieder ganz sichtbar, altes Highlight verblasst |
| `ORIENT_TO_COUNTRY` | 1450 ms | Globus dreht auf kürzestem Weg zum Ziel |
| `ZOOM_TO_COUNTRY` | 2100 ms | Kamera zoomt hinein, Highlight, Grenze, Flagge und Name blenden ein |
| `HOLD` | offen | Endzustand bleibt stehen |
| `SEQUENCE_PAUSE` | 1000 ms | nur zwischen zwei Ländern |

Die Eingabemaske blendet **vor** der Pause aus (480 ms); die Pause beginnt erst, wenn nichts mehr von ihr zu sehen ist. Am Ende bleibt der Endzustand eine Sekunde unverändert, bevor die Maske zurückkommt.

Die genauen Werte stehen in [`src/config.ts`](../src/config.ts:1) und sind bewusst zentral gehalten.

## Formate

- **Landscape 16:9** (1920 × 1080) und **Portrait 9:16** (1080 × 1920).
- Die Bühne ist immer ein exakt proportionierter Rahmen, in den Viewport eingepasst. Es gibt keine Verzerrung.
- Umschalten ist nur möglich, solange keine Sequenz läuft.
- Im Portrait wird automatisch etwas weiter herausgezogen und stärker auf die Breite gezoomt, damit Länder nicht am seitlichen Rand kleben.

## Bedienelemente

| Taste / Element | Wirkung |
| --- | --- |
| `Enter` | Auswahl bestätigen bzw. Liste starten |
| `↑` `↓` | Vorschlag markieren |
| `Esc` | Vorschläge schließen / jederzeit zurücksetzen |
| `R` | zurücksetzen, auch mitten in der Fahrt |
| `E` | Eingabemaske ein-/ausblenden, ohne die Ansicht zu verändern |
| `H` | technisches HUD (FPS, Draw Calls, Dreiecke) ein-/ausblenden |
| `L` | Logo im HUD ein-/ausblenden |
| `S` | Safe-Area-Rahmen ein-/ausblenden |
| `Zurück`-Schaltfläche | erscheint unten links, sobald eine Sequenz läuft |

`Esc` und `R` brechen eine laufende Sequenz sauber ab: Highlight und Label verschwinden, die Kamera fährt weich in die Totale zurück, danach dreht sich der Globus wieder langsam.

## Für die Aufnahme

1. Zielformat wählen (16:9 oder 9:16).
2. Mit `S` die Safe Area einblenden und prüfen, dass Flagge und Name nicht am Rand kleben. Mit `L` lässt sich das Logo links unten separat ausblenden, mit `H` das gesamte HUD.
3. Mit `H` das technische HUD ausblenden. Die Eingabemaske erscheint nach jeder Fahrt wieder; mit `E` lässt sie sich ausblenden, damit sie nicht im Video landet.
4. Sequenz starten (Einzelland oder Liste).
5. Bildschirmaufnahme des Bühnenbereichs starten – die Bühne ist exakt im Zielformat, sodass das Material ohne Nachskalierung in den Schnitt geht.
6. Nach dem letzten Land bleibt der Endzustand stehen; für die nächste Szene `R` drücken.

## Wiederholbarkeit

- Alle Zeiten sind feste Werte; eine Sequenz läuft immer gleich ab.
- Die Ausgangsorientierung ist nach `R` immer dieselbe.
- Es gibt keine Datenquelle zur Laufzeit, keine Zufallselemente in der Bewegung und keine Audio-Clock.

## Bekannte Bedienregeln

- Während einer laufenden Sequenz ist die Eingabe ausgeblendet und gesperrt. Das ist beabsichtigt.
- Die Suche arbeitet ausschließlich gegen den lokalen Index; es findet kein Netzwerkzugriff statt.
- Länder ohne eigene Flaggenressource (z. B. Somaliland in den Natural-Earth-Daten) werden korrekt dargestellt, aber ohne Flaggenbild.
