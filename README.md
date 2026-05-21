# VideoAPP

Eine Smartphone-freundliche **Progressive Web App (PWA)** zur **Frame-für-Frame Analyse von Videos** mit Zeitmessung zwischen Start- und Endmarkern.

## Features

- **Frame-für-Frame Navigation** (Buttons, Tastatur, Touch-Wisch über das Video)
- **Start- / Endmarker** setzen und Differenz in Sekunden + Frames anzeigen
- **Mehrere Messungen** (Lap-Times) speichern, benennen, anspringen, löschen
- **CSV-Export** aller Messungen
- **Screenshot** des aktuellen Frames als PNG
- **Variable FPS** (Standard 30, frei einstellbar 1–240)
- **Wiedergabegeschwindigkeit** umschaltbar (0.25× – 2.0×)
- **Offline-fähig** (Service Worker) und **als App installierbar** (PWA Manifest)
- Alles läuft **lokal im Browser** – Videos verlassen das Gerät nicht

## Nutzung

1. App im Browser öffnen oder auf den Homescreen installieren ("Zum Home-Bildschirm").
2. **Video laden** antippen und Datei aus der Galerie wählen.
3. FPS prüfen/setzen (Standard 30 – wichtig für genaue Frame-Schritte und Frame-Anzahl).
4. Mit ⏮ / ⏭ ein Frame zurück/vor, ⏯ Play/Pause; auf größeren Bildschirmen Pfeiltasten.
5. **Start setzen** an gewünschter Stelle, dann **Ende setzen** – die Differenz erscheint sofort.
6. **Speichern** legt die Messung in der Liste ab. Mehrere hintereinander möglich; das vorherige Ende wird automatisch zum neuen Start.
7. **CSV** lädt die Liste herunter, **Screenshot** speichert das aktuelle Frame als PNG.

### Tastatur-Shortcuts

| Taste | Funktion |
|-------|----------|
| Leertaste | Play / Pause |
| ← / → | Ein Frame zurück / vor |
| ↓ / ↑ | 10 Frames zurück / vor |
| S | Startpunkt setzen |
| E | Endpunkt setzen |
| L | Messung speichern |

### Touch-Gesten

- **Horizontal über das Video wischen**: Frame-für-Frame scrubben.
- **Doppeltipp aufs Video**: Play / Pause.

## Hosten

Die App ist statisch – einfach den Repo-Inhalt auf einen beliebigen Webserver legen (GitHub Pages, Netlify, Vercel, eigener nginx). Lokal zum Testen:

```bash
cd VideoAPP
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Auf iOS ist Safari notwendig, um die App über *Teilen → Zum Home-Bildschirm* zu installieren. Auf Android funktioniert das aus Chrome heraus über *Installieren* / *Zum Startbildschirm hinzufügen*.

## Hinweis zur Frame-Genauigkeit

Browser stellen die exakte FPS eines Videos nicht zuverlässig zur Verfügung. Stelle den FPS-Wert manuell so ein, wie das Video aufgenommen wurde (z.B. 24, 25, 30, 60, 120, 240). Davon hängen Frame-Schrittgröße und die in der CSV exportierte Frame-Anzahl ab.

## Tech

- Vanilla JS, keine Build-Tools, kein Framework
- HTML5 `<video>` + `requestVideoFrameCallback` (sofern unterstützt) für präzise Frame-Anzeige
- Service Worker für Offline-Caching
- Mobile-First CSS mit großen Touch-Zielen (≥ 48 px)
