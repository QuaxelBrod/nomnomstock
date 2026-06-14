# Flashing TTGO Scanner Firmware

Empfohlener Weg: PlatformIO. Der Sketch liegt in `ttgo_scanner/ttgo_scanner.ino`; `platformio.ini` enthaelt die TTGO-T-Display/TFT-Konfiguration.

## Voraussetzungen

- TTGO T-Display per USB verbinden.
- Python 3 installiert.
- PlatformIO Core oder VS Code mit PlatformIO Extension.
- nomnomstock Backend im Netzwerk erreichbar, z. B. `http://192.168.178.50:3001/api/v1`.

Wichtig: Fuer den ESP32 nie `localhost` als API Base URL verwenden. `localhost` waere auf dem ESP32 der ESP32 selbst.

## Flashen Mit PlatformIO CLI

Vom Repo-Root:

```bash
cd frontends/esp/ttgo
pio run -e ttgo-t-display
pio run -e ttgo-t-display -t upload
pio device monitor -b 115200
```

Wenn der Upload nicht startet:

1. `BOOT` auf dem TTGO gedrueckt halten.
2. Upload starten.
3. Sobald `Connecting...` oder der Schreibvorgang beginnt, `BOOT` loslassen.

## Flashen Mit VS Code

1. VS Code oeffnen.
2. PlatformIO Extension installieren.
3. Ordner `frontends/esp/ttgo` als Projekt oeffnen.
4. PlatformIO: `Build` ausfuehren.
5. PlatformIO: `Upload` ausfuehren.
6. PlatformIO: `Monitor` mit `115200` Baud starten.

## Ersteinrichtung Nach Dem Flash

1. TTGO startet.
2. Wenn kein WLAN gespeichert ist, zeigt das Display:

```text
WLAN einrichten
AP: nomnomstock-XXXX
Pass: nomnom1234
http://192.168.4.1
```

3. Mit Handy/Laptop mit `nomnomstock-XXXX` verbinden.
4. Browser oeffnen: `http://192.168.4.1`.
5. Eintragen:
   - WLAN SSID
   - WLAN Passwort
   - API Base URL, z. B. `http://192.168.178.50:3001/api/v1`
   - optional Geraetename
6. Speichern. Der TTGO startet neu.
7. In der Web-App unter `Profil` einen ESP Scanner koppeln.
8. Pairing-Code mit dem TTGO scannen.

## Bedienung Version 0.1

- Scanner ist nach Wake automatisch eingeschaltet.
- `Button 1`: Einchecken/Auschecken umschalten.
- `Button 2`: Menue oeffnen oder im Menue weiterblaettern.
- `Button 1` im Menue: Eintrag bestaetigen.
- Erster Menueeintrag ist `Lager`.
- Nach 30 Sekunden Inaktivitaet: Scanner aus, Display aus, Light-Sleep.
- Aufwachen: `Button 1` oder `Button 2`.

## Pinbelegung Im Sketch

| Funktion | GPIO |
| --- | ---: |
| Scanner Power | `32` |
| Scanner UART RX am ESP | `26` |
| Scanner UART TX vom ESP | `27` |
| Button 1 | `35` |
| Button 2 | `0` |
| TFT Backlight | `4` |

## Bekannte Grenzen Der Ersten Version

- Location-Liste wird einfach aus JSON geparst; fuer komplexere Namen spaeter robusten JSON-Parser ergaenzen.
- HTTPS mit Zertifikatspruefung ist noch nicht implementiert. Fuer lokale Tests HTTP nutzen.
- WLAN-Setup-Passwort ist aktuell `nomnom1234`; fuer produktive Nutzung geraetespezifisch machen.
- Light-Sleep wird verwendet, damit beide Board-Buttons aufwecken koennen. Deep-Sleep mit beiden aktiven-low TTGO-Buttons braucht je nach ESP32-Core oder Hardware eine andere Wakeup-Beschaltung.
