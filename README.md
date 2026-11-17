This is the repo for the HTV 1866 website.
Exclusively informative site.

## Inhalte

Termine, Neuigkeiten und Galerie auf der Startseite kommen aus JSON-Dateien und werden von `js/content.js` angezeigt:

| Datei | Inhalt | Felder |
|---|---|---|
| `content/events.json` | Termine | `title`, `date` (`YYYY-MM-DD`), optional `start_time`/`end_time` (`HH:MM`), `location`, `category` (Wettkampf, Vereinsfeier, Vorführung, Offen), `description` |
| `content/news.json` | Neuigkeiten | `title`, `date`, `body`, optional `image` |
| `content/gallery.json` | Galerie | `image`, `caption`, optional `alt`, `date` |

- Termine verschwinden automatisch, wenn sie vorbei sind. Ohne Endzeit gilt der Termin als 4 Stunden lang, ohne Uhrzeit als ganztägig.
- Textfelder: Leerzeile = neuer Absatz, `**fett**`, `*kursiv*`, `[Linktext](https://…)`.
- Galeriebilder liegen in `images/gallery/` (WebP, längste Seite max. 1600 px). Reihenfolge = Reihenfolge in der Datei.

## Bildgrößen – drei Sicherheitsstufen

1. **CMS verkleinert beim Hochladen** (Sveltia, noch einzurichten): wandelt Fotos im Browser in WebP um, max. 1600 px, entfernt Metadaten, wandelt auch iPhone-Fotos (HEIC) um.
2. **GitHub Action** (`.github/workflows/optimize-images.yml`, aktiv): verkleinert nach jedem Upload in `images/` jedes Bild über 1600 px und entfernt Metadaten wie den GPS-Standort. Dateiname und Format bleiben gleich. Kann unter *Actions → Bilder optimieren → Run workflow* auch von Hand gestartet werden.
3. **Upload-Grenze im CMS** (noch einzurichten): lehnt Dateien über 15 MB ab, z. B. versehentlich gewählte Videos.

Einstellungen für Stufe 1 und 3 in der Sveltia-Konfiguration (`admin/config.yml`):

```yaml
media_libraries:
  all:
    max_file_size: 15728640 # 15 MB in Bytes
    transformations:
      raster_image:
        format: webp
        quality: 80
        width: 1600
        height: 1600
```

### Grenzen

- **Veröffentlichung nach einer automatischen Korrektur:** Commits einer GitHub Action lösen möglicherweise keinen neuen GitHub-Pages-Build aus. Dann bleibt das große Original online, bis zur nächsten Änderung. Die Seite funktioniert trotzdem, lädt aber langsamer. Nach der ersten automatischen Korrektur prüfen.
- **iPhone-Fotos (HEIC):** Die GitHub Action kann HEIC nicht lesen und überspringt solche Dateien. Nur Stufe 1 wandelt sie um. Eine HEIC-Datei, die am CMS vorbei hochgeladen wird, bleibt unverändert, und die meisten Browser können sie nicht anzeigen.
- **Git-Verlauf:** Bei Stufe 2 bleibt das große Original im Git-Verlauf gespeichert, das Repository wächst also mit. Darum ist Stufe 1 die wichtigste.
- **PNG-Dateien:** Die Action verkleinert sie und entfernt Metadaten, senkt aber keine Qualität. Ein großes PNG-Foto kann deshalb über 500 KB bleiben (die Action meldet das im Protokoll).
- **Sveltia ist noch Beta:** Die Einstellungen oben können sich bis Version 1.0 ändern. Laut Dokumentation ist offen, ob die 15-MB-Grenze die Originaldatei oder die verkleinerte Datei prüft. Normale Handyfotos kommen in beiden Fällen durch, Videos nicht.
- **Schreibrecht der Action:** GitHub muss Actions erlauben, ins Repository zu schreiben (*Settings → Actions → General → Workflow permissions*). Die Action fordert das Recht selbst an; es funktioniert, solange die Einstellungen es nicht verbieten.

## Lokal testen

`fetch()` funktioniert nicht mit `file://`. Im Repo-Ordner einen lokalen Server starten, z. B. `npx http-server`, und `http://localhost:8080` öffnen.
