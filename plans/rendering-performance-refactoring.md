# Refactoring-Plan: Darstellung und Performance

> Rolle: Experte für JavaScript und three.js mit Schwerpunkt UI, Layout und Darstellung.
> Auftrag: Darstellungslogik prüfen, optimale Programmierregeln anwenden, Refactoring planen und anschließend umsetzen.
> Entscheidung des Auftraggebers: **Subtile Look-Änderungen sind erlaubt, wenn die Performance deutlich steigt** (günstigeres Material, ein zusätzlicher Highlight-Shader, weniger Lichtquellen).

---

## 1. Leitplanken

Diese Regeln sind bindend und stammen aus [`docs/ai-agent-instructions.md`](docs/ai-agent-instructions.md:1), [`docs/performance.md`](docs/performance.md:1) und [`docs/architecture.md`](docs/architecture.md:1):

- Eine Szene für beide Formate, nur unterschiedliche Kameraprofile.
- Ländergrenzen bleiben immer sichtbar und rotieren mit dem Globus.
- Nur das ausgewählte Land erhält den stärksten Akzent.
- Kein Post-Processing, keine schweren Effekte.
- Wenige Draw Calls, zusammengefasste Geometrie.
- Der Renderloop aktualisiert nur Zustand und zeichnet.
- Nach jedem Schritt bleibt der Stand buildbar (`npm run typecheck`, `npm run build`, `npm run smoke`).

---

## 2. Recherche: Regeln für JavaScript und three.js

### 2.1 Renderloop und Hot Path

- **Keine Allokationen pro Frame.** `new Vector3()`, `new Quaternion()`, `new Color()` im Loop erzeugen GC-Druck und Ruckler. Stattdessen Modul-Scratch-Objekte wiederverwenden.
- **Keine Datenarbeit pro Frame.** Kein JSON-Parsen, keine Geometrie-Neuberechnung, keine Suche über alle Länder.
- **Uniform statt Buffer-Upload.** Was sich pro Frame ändert, gehört in ein `uniform`; Vertex-/Index-Puffer sind statisch.
- **`BufferAttribute.addUpdateRange()`** nur für echte Teiländerungen, niemals `needsUpdate` auf großen Puffern pro Frame.
- **Delta-Zeit klemmen** (`Math.min(50, dt)`), damit ein Tab-Wechsel keine Sprünge erzeugt.
- **Nicht zeichnen, wenn nichts passiert.** In einem statischen Zustand kann der Frame übersprungen werden.
- **Bei verstecktem Tab pausieren** (`document.visibilitychange`).

### 2.2 Materialien und Licht

- **So günstig wie möglich:** `MeshBasicMaterial` < `MeshLambertMaterial` < `MeshPhongMaterial` < `MeshStandardMaterial` < `MeshPhysicalMaterial`. PBR ist für einen stilisierten Look meist unnötig teuer.
- **Jede Lichtquelle kostet pro Fragment.** Vier Lichter auf ~265k Dreiecken sind teuer; eine Hemisphere- plus eine Directional-Licht reichen für den Look.
- **`onBeforeCompile`** ist der saubere Weg, ein Standardmaterial um eine kleine Uniform-gesteuerte Änderung zu erweitern, ohne einen kompletten Shader zu schreiben.
- **`emissive`** ist billiger als zusätzliche Lichter und trägt den stilisierten Look.

### 2.3 Geometrie und Speicher

- Geometrie zusammenfassen, Draw Calls minimieren.
- Attribute so klein wie möglich halten (`Uint8` mit `normalized` statt `Float32`, wo es reicht).
- **Alles freigeben:** `geometry.dispose()`, `material.dispose()`, `texture.dispose()`.
- `frustumCulled = false` nur, wo es wirklich nötig ist.
- Keine doppelten Positionspuffer, wenn eine Transformation (Skalierung) dasselbe erreicht.

### 2.4 Animation

- **Deterministisch über absolute Zeit**, nicht über aufsummierte Lerps. Ein `lerp(current, target, t)` pro Frame ist framerate-abhängig und damit falsch.
- Startwerte im Übergangsobjekt speichern und von dort interpolieren.
- Zustandsmaschine bleibt die einzige Quelle für Kamera- und Globusbewegung.

### 2.5 UI, Layout und Darstellung

- **Event-Delegation** für dynamische Listen statt Listener pro Element.
- **Resize debouncen** und `devicePixelRatio`-Änderungen (Monitorwechsel) beachten.
- **Keine konkurrierenden Tastatur-Handler** für dieselbe Taste.
- **Barrierefreiheit** für eigene Widgets: `role="listbox"`, `aria-expanded`, `aria-activedescendant`.
- **`prefers-reduced-motion`** respektieren.
- Kein `innerHTML` mit nicht vertrauenswürdigen Daten.

---

## 3. Befund: Analyse der Darstellungslogik

### 3.1 Hot Path und Allokationen

| # | Ort | Problem | Wirkung |
| --- | --- | --- | --- |
| H1 | [`AnimationDirector.update()`](src/animation/AnimationDirector.ts:156) | `new Quaternion()` pro Idle-Frame | GC-Druck im Dauerbetrieb |
| H2 | [`AnimationDirector.update()`](src/animation/AnimationDirector.ts:149) | `new Quaternion()` pro Reset-Frame | GC-Druck |
| H3 | [`LandLayer.writeCountry()`](src/geography/LandLayer.ts:166) | läuft pro Frame während Zoom/Vorbereitung | CPU-Schleife + GPU-Upload pro Frame |
| H4 | [`GeographyEngine.baseColorFor()`](src/geography/GeographyEngine.ts:326) | alloziert drei Arrays pro Aufruf, wird aus H3 pro Frame gerufen | GC-Druck pro Frame |
| H5 | [`CountryLabel.show()`](src/scene/CountryLabel.ts:131) | `new Quaternion()` pro Auswahl | gering |
| H6 | [`orientation.ts`](src/geography/orientation.ts:17) | alloziert `clone()` und zwei `Quaternion` pro Auswahl | gering |

### 3.2 Material und Licht

| # | Ort | Problem | Wirkung |
| --- | --- | --- | --- |
| M1 | [`GlobeScene`](src/scene/GlobeScene.ts:94) | Land und Ozean nutzen `MeshStandardMaterial` (PBR) | teuerste Fragment-Pipeline auf ~265k Dreiecken |
| M2 | [`GlobeScene`](src/scene/GlobeScene.ts:77) | vier Lichtquellen (Hemisphere, 2× Directional, Ambient) | jede Lichtquelle kostet pro Fragment |
| M3 | [`GlobeScene`](src/scene/GlobeScene.ts:95) | Ozeankugel mit 96×64 Segmenten | ~12k Dreiecke, mehr als nötig |

### 3.3 Geometrie und Speicher

| # | Ort | Problem | Wirkung |
| --- | --- | --- | --- |
| G1 | [`LandLayer.setActive()`](src/geography/LandLayer.ts:137) | kopiert den gesamten Umriss in einen skalierten `Float32Array` | doppelter Speicher, Kopierschleife pro Auswahl |
| G2 | [`GlobeScene.dispose()`](src/scene/GlobeScene.ts:165) | Atmosphäre, Label und Highlight-Geometrien werden nicht freigegeben | Leck |
| G3 | [`CountryLabel`](src/scene/CountryLabel.ts:68) | besitzt gar kein `dispose()` | Leck (Textur, Material, Geometrie) |
| G4 | [`LandLayer.dispose()`](src/geography/LandLayer.ts:185) | Highlight-Geometrien fehlen | Leck |

### 3.4 Animation und Logik

| # | Ort | Problem | Wirkung |
| --- | --- | --- | --- |
| A1 | [`updatePrepare()`](src/animation/AnimationDirector.ts:232) | `labelOpacity = lerp(labelOpacity, 0, eased)` summiert sich pro Frame auf | **framerate-abhängiger Fade, sichtbarer Fehler** |
| A2 | [`AnimationDirector`](src/animation/AnimationDirector.ts:32) | `Transition` speichert keinen Startwert für die Label-Opazität | Ursache von A1 |
| A3 | [`AppController.loop()`](src/app/AppController.ts:194) | zeichnet auch in `HOLD`/`ERROR`, obwohl nichts sich ändert | unnötige GPU-Last |
| A4 | [`AppController`](src/app/AppController.ts:194) | rendert weiter, wenn der Tab verborgen ist | Akku-/CPU-Last |

### 3.5 UI und Layout

| # | Ort | Problem | Wirkung |
| --- | --- | --- | --- |
| U1 | [`SearchUI`](src/ui/SearchUI.ts:231) + [`AppController`](src/app/AppController.ts:179) | beide reagieren auf `Escape` | Autocomplete leeren löst zusätzlich Reset aus |
| U2 | [`renderSuggestions()`](src/ui/SearchUI.ts:213) | Listener pro Listeneintrag bei jedem Tastendruck | unnötige Arbeit |
| U3 | [`CountryRegistry.search()`](src/data/CountryRegistry.ts:51) | normalisiert Namen bei jeder Suche neu | 177×2 Normalisierungen pro Tastendruck |
| U4 | [`SearchUI`](src/ui/SearchUI.ts:69) | Autocomplete ohne ARIA-Rollen | Barrierefreiheit |
| U5 | [`AppController.layout()`](src/app/AppController.ts:133) | Resize ohne Debounce, DPR-Wechsel unbeachtet | Layout-Ruckler, unscharf nach Monitorwechsel |
| U6 | [`SearchUI.formatLabel()`](src/ui/SearchUI.ts:307), [`CountryLabel.accentColor`](src/scene/CountryLabel.ts:213), [`Z_AXIS`-Export](src/geography/orientation.ts:45) | toter Code | Wartbarkeit |
| U7 | [`config.ts`](src/config.ts:90) `LABEL.safeAreaInset` vs. [`.safe-area`](src/ui/styles.css:60) `inset: 6%` | doppelte Konstante | Inkonsistenz-Risiko |

---

## 4. Refactoring-Plan

### Phase 0 – Messbasis herstellen

- Vor jeder Änderung reproduzierbare Messwerte erfassen: FPS, Draw Calls, Dreiecke, Geometrien, Texturen, Aufbauzeit von `buildWorld()`.
- Messpunkte: Idle, Zoom auf Deutschland, Zoom auf Russland, HOLD, Portrait und Landscape.
- Ergebnis in [`docs/verifikation.md`](docs/verifikation.md:1) festhalten, damit die Wirkung belegbar ist.

### Phase 1 – Hot Path und Logikfehler (kein Look-Änderung)

- H1/H2: Scratch-`Quaternion` in [`AnimationDirector`](src/animation/AnimationDirector.ts:1) einführen.
- A1/A2: `startLabelOpacity` in `Transition` aufnehmen und absolut interpolieren.
- H4: `baseColorFor` ohne Allokationen; die drei Farbstützpunkte als Modulkonstanten.
- H5/H6: Scratch-Objekte in [`CountryLabel`](src/scene/CountryLabel.ts:1) und [`orientation.ts`](src/geography/orientation.ts:1).
- U1: `Escape`-Konflikt auflösen (SearchUI behandelt die Taste und stoppt die Weitergabe, solange das Feld fokussiert ist).

### Phase 2 – Highlight ohne Frame-Upload (ein zusätzlicher Shader)

- Basisfarben bleiben statisch im `color`-Attribut.
- Neues Attribut `aHighlight` (`Uint8`, `normalized`) markiert die Vertices des aktiven Landes.
- Landmaterial über `onBeforeCompile` erweitern: `uHighlightColor` und `uHighlightAmount` als Uniforms, Mischung nach `color_fragment`.
- [`setActive()`](src/geography/LandLayer.ts:121) schreibt `aHighlight` **einmal pro Länderwechsel** (nur die beiden betroffenen Bereiche).
- [`setIntensity()`](src/geography/LandLayer.ts:148) setzt nur noch `uHighlightAmount` – **null Buffer-Uploads pro Frame**.
- Damit entfällt H3 vollständig.
- Fallback, falls der Shader Probleme macht: zweites Mesh mit geteilter Geometrie und eigenem Index-Bereich, gesteuert über `material.opacity`.

### Phase 3 – Material und Licht (subtile Look-Änderung)

- M1: Land und Ozean auf `MeshLambertMaterial` umstellen, `emissive` beibehalten, `vertexColors` beibehalten.
- M2: Auf eine Hemisphere- und eine Directional-Lichtquelle reduzieren; Ambient und Fill in die Hemisphere-Parameter einfalten.
- M3: Ozeankugel auf 64×48 Segmente reduzieren.
- Look nach jeder Änderung in beiden Formaten prüfen und bei Bedarf die Farbwerte in [`config.ts`](src/config.ts:22) nachziehen.

### Phase 4 – Geometrie und Speicher

- G1: Glow über `mesh.scale` statt kopiertem Positionspuffer.
- G2/G3/G4: `dispose()` vollständig machen; `CountryLabel.dispose()` ergänzen.
- Optional: `STEP_DEG` von 2,5° auf 3,0° prüfen (weniger Dreiecke) und visuell abnehmen.

### Phase 5 – Renderloop und Lebenszyklus

- A3: In `HOLD`/`ERROR` nur zeichnen, wenn sich etwas geändert hat (Dirty-Flag).
- A4: Bei `visibilitychange` pausieren und beim Zurückkehren die Zeitbasis zurücksetzen.
- U5: Resize debouncen; `devicePixelRatio`-Änderung über `matchMedia` beobachten und neu layouten.

### Phase 6 – UI, Layout und Barrierefreiheit

- U2: Event-Delegation für die Autocomplete-Liste.
- U3: Normalisierte Suchschlüssel im [`CountryRegistry`](src/data/CountryRegistry.ts:1) vorberechnen.
- U4: ARIA-Rollen und `aria-activedescendant` ergänzen.
- U6: toten Code entfernen.
- U7: Safe-Area-Wert aus [`config.ts`](src/config.ts:90) als CSS-Variable setzen.
- Optional: `prefers-reduced-motion` berücksichtigen.

### Phase 7 – Abnahme

- `npm run typecheck`, `npm run build`, `npm run smoke`.
- Manuelle Prüfliste aus [`docs/ai-agent-instructions.md`](docs/ai-agent-instructions.md:149): Deutschland, Japan, Brasilien, USA, Indonesien, Neuseeland, zwei und fünf Länder nacheinander, Reset während Zoom, Enter ohne Auswahl, Resize 16:9 → 9:16.
- Messwerte aus Phase 0 erneut erfassen und in [`docs/verifikation.md`](docs/verifikation.md:1) gegenüberstellen.
- [`docs/performance.md`](docs/performance.md:1) und [`docs/architecture.md`](docs/architecture.md:1) um die neuen Regeln und Abweichungen ergänzen.

---

## 5. Erwartete Wirkung

| Maßnahme | Erwartung |
| --- | --- |
| Highlight über Uniform statt Vertex-Upload | keine Buffer-Uploads und keine Farbberechnung pro Frame |
| Scratch-Objekte | keine Allokationen im Dauerbetrieb |
| Lambert statt Standard | deutlich geringere Fragment-Kosten auf ~265k Dreiecken |
| zwei statt vier Lichter | geringere Fragment-Kosten |
| Dirty-Flag in HOLD | GPU-Last nur bei echter Bewegung |
| Pause bei verborgenem Tab | keine Last im Hintergrund |
| vollständiges `dispose()` | kein Speicherleck bei Neuaufbau |

---

## 6. Risiken

- **Shader-Erweiterung** kann bei three.js-Updates brechen. Deshalb eng an `onBeforeCompile` mit klarer Include-Ankerstelle halten und den Fallback dokumentieren.
- **Lambert statt Standard** verändert Glanz und Kontrast. Farbwerte in [`config.ts`](src/config.ts:22) müssen nachgezogen werden; Abnahme in beiden Formaten.
- **`STEP_DEG`-Erhöhung** kann Grenzlinien sichtbar eckiger machen. Nur nach visueller Abnahme.
- **Dirty-Flag** darf keine laufende Animation einfrieren. Nur für echte Ruhezustände verwenden.
