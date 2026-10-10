# Spiegelkabinett

Eine Website, die dir neun Spiegel vorhält. Das Spiegelbild steht fest in der Mitte des Bildschirms;
beim Scrollen gleiten die Spiegel darüber hinweg, und jeder zeigt dieselbe Person ein wenig anders.
Außerhalb der Spiegel spiegelt sich nichts.

| Station | Spiegel | Was passiert |
|---|---|---|
| 0 | Konvexspiegel (nach Parmigianino) | Wölbung: Mitte vergrößert, Rand drängt den Raum zusammen |
| 1 | Badezimmerspiegel | beschlagen; Maus oder Finger wischen frei, der Dampf kommt langsam wieder |
| 2 | Teich (Narziss) | Wellen bei Berührung, Blätter treiben auf der Oberfläche, die Person wirkt geschönt |
| 3–5 | drei Zerrspiegel | lang, wabbelig, breit; das Gesicht verteilt sich über alle drei |
| 6 | Ölbild (Dorian Gray) | altert beim Scrollen: Falten, graue Haare, Firnis, Craquelé; die Augen folgen dir |
| 7 | zerbrochener Spiegel | Klick bricht das Glas neu, Zähler „Jahre Pech“ |
| 8 | ausgeschaltetes Handy | schwarzer Spiegel; sobald das Display angeht, verschwindet das Spiegelbild |
| 9 | Durch den Spiegel (Carroll) | flüssiges Quecksilber, Schachbrettwelt, das Spiegelbild schaut weg |
| Zugabe | Zauberspiegel (Grimm) | sagt die Wahrheit: die Person wird zum Troll |
| Ende | ehrlicher Spiegel | Kamera oder eigenes Foto ersetzt die Figur in allen Spiegeln |

Oben rechts schaltet „Mensch / Troll“ die ganze Seite auf Troll.

## Die Person

`js/head.js` modelliert einen Kopf aus Signed Distance Functions und rendert ihn per Ray-Marching in eine
Textur: Kopfform, Augen mit Lidern, Iris und Hornhautreflex, Brauen, Lippen, Ohren, Haartolle, Trainingsjacke
mit Stehkragen. Jedes Merkmal ist ein Parameter (Blick, Lider, Lächeln, Nase, Ohren, Alter, Troll …). Die
Figur blinzelt, folgt dem Mauszeiger mit Kopf und Augen und schaut sich um, wenn niemand die Maus bewegt.
Jeder Spiegel hat eine eigene Variante (`VARIANTS` in `js/cabinet.js`); beim Scrollen wird zwischen ihnen überblendet.

## Ein echtes Foto als Spiegelbild

Leg ein Foto als `img/face.jpg` ab. `index.html` lädt es automatisch (`data-face` am `<html>`-Element) und
nimmt es statt der Figur. Das Foto dreht sich dann leicht zum Mauszeiger (Tiefen-Ellipsoid), atmet, und
bekommt in jedem Spiegel dessen Farbe, Alter und Troll-Nase.

`data-face-frame="x,y,s"` richtet es aus: `x,y` ist die Mitte des Gesichts im Foto (0–1, von oben links),
`s` die Fotohöhe in Kopfhöhen. Voreingestellt ist `0.41,0.45,1.17`, passend zu einem Selfie, auf dem das
Gesicht etwas links der Mitte sitzt und gut die Hälfte der Bildhöhe einnimmt. Besucher können im letzten
Spiegel auch selbst ein Foto wählen oder die Kamera einschalten und es dort mit der Maus ausrichten.
Blinzeln und Augenbewegung gibt es nur bei der Figur, nicht beim Foto.

## Technik

- Ein unsichtbarer WebGL2-Kontext rendert pro Frame erst die Person, dann das Glas jedes sichtbaren
  Spiegels (`js/glass.js`, ein Fragment-Shader pro Spiegeltyp), und kopiert das Ergebnis in die Canvas des Spiegels.
- Diese Canvas ist `position: fixed` und liegt in einem Element mit `clip-path`. So verschiebt der Browser
  selbst beim Scrollen das Glas über das stehende Spiegelbild, ohne Verzögerung zwischen Rahmen und Glas.
  Deshalb darf kein Vorfahr eines `.mirror` `transform`, `filter` oder `will-change` bekommen.
- Die Kopfauflösung passt sich der Bildrate an. `?q=0.5` legt sie fest, `?dpr=1` begrenzt die Pixeldichte,
  `?nogl` zeigt die Seite ohne WebGL.
- `prefers-reduced-motion`: keine Umherblicke, keine Regentropfen, langsamere Zeit.

Lokal starten: `npx http-server` oder `python3 -m http.server` im Repo-Ordner. Die Kamera
braucht HTTPS oder `localhost`.
