# Scanner Menu

Diese Spezifikation beschreibt das Display-Menue fuer den TTGO-Handscanner mit zwei Buttons.

## Grundregeln

- WLAN wird immer vor Haushalt-Pairing eingerichtet.
- Im normalen Betrieb ist der Scanner nach dem Aufwachen eingeschaltet und bleibt bis zum Schlafmodus an.
- Nach 30 Sekunden Inaktivitaet schaltet die Firmware den Scanner aus und setzt den TTGO in Light-Sleep.
- `Button 1` oder `Button 2` weckt den TTGO wieder auf.
- `Button 1 kurz`: auf dem Startbildschirm zwischen `Einchecken` und `Auschecken` umschalten.
- `Button 2 kurz`: auf dem Startbildschirm Menue oeffnen.
- `Button 2 kurz` im Menue: naechsten Menuepunkt oder naechste Option auswaehlen.
- `Button 1 kurz` im Menue: markierten Menuepunkt bestaetigen.
- Jedes Menue und Untermenue hat als ersten oder letzten Eintrag `Zurueck`.
- Im WLAN-Setup bleibt die 5V-Scanner-Versorgung aus.

## Zustand: WLAN Nicht Konfiguriert

Wenn kein WLAN konfiguriert ist, gibt es keinen Haushalt-Pairing-Modus und keinen normalen Scannerbetrieb.

Display:

```text
WLAN einrichten

AP: nomnomstock-XXXX
Pass: nomnom1234
http://192.168.4.1
```

Verhalten:

- Scanner-Versorgung bleibt aus.
- ESP32 startet einen temporaeren Access Point mit Captive Portal.
- Im Portal werden WLAN SSID, WLAN Passwort und API Base URL eingetragen.
- Nach erfolgreichem Speichern verbindet sich der Scanner mit dem WLAN.
- Erst danach wechselt er in `Nicht Gekoppelt`.

Details stehen in [wifi-provisioning.md](./wifi-provisioning.md).

## Zustand: Nicht Gekoppelt

Wenn WLAN konfiguriert, aber kein Haushalt gekoppelt ist, gibt es keinen normalen Scannerbetrieb und kein normales Menue.

Display:

```text
nomnomstock
Haushalt koppeln

Pairing-Code scannen
B1/B2: Scanner an
```

Verhalten:

- `Button 1` oder `Button 2`: Scanner-Versorgung einschalten und Pairing-Barcode lesen.
- Nach erfolgreichem Pairing speichert das Geraet:
  - `token`
  - `apiBase`
  - `defaultMode`
  - `defaultLocationId`
  - optional letzte geladene Lagerliste

Nur fuer Service-Faelle sollte es eine versteckte Reset-Geste geben, z. B. beide Buttons beim Start 5 Sekunden halten. Diese Geste ist kein normales Menue.

## Zustand: Gekoppelt / Startbildschirm

Der Startbildschirm zeigt die fuer den naechsten Scan wirksamen Werte.

```text
Einchecken
Lager: Vorrat

B1: Auschecken
B2: Menue
```

Wenn der Modus `Auschecken` aktiv ist:

```text
Auschecken
Lager: Vorrat

B1: Einchecken
B2: Menue
```

Scan-Payload:

```json
{
  "barcode": "4006381333931",
  "mode": "stock_add",
  "locationId": 1,
  "quantity": 1
}
```

Dabei gilt:

- `mode = stock_add` fuer Einchecken.
- `mode = stock_remove` fuer Auschecken.
- `locationId` ist das aktuell gewaehlte Lager und ueberschreibt den Scanner-Default.
- Wenn kein Lager manuell gewaehlt ist, wird `locationId` weggelassen und das Backend nutzt den Scanner-Default.

## Hauptmenue

Empfohlene Reihenfolge:

1. `Lager`
2. `Modus`
3. `Synchronisieren`
4. `Verbindung`
5. `Energie`
6. `Pairing`
7. `Info`
8. `Zurueck`

Beim Oeffnen des Menues ist `Lager` markiert. So kann `Button 1` direkt die Lagerauswahl oeffnen. `Zurueck` bleibt als eigener Menueeintrag vorhanden, damit jedes Menue einen Rueckweg hat.

Diese Eintraege reichen fuer den ersten Firmware-Stand. Weitere Funktionen sollten erst ergaenzt werden, wenn der Ablauf mit echten Barcodes stabil ist.

## Untermenue: Modus

Eintraege:

- `Zurueck`
- `Einchecken`
- `Auschecken`

Bedeutung:

- `Einchecken`: `mode = stock_add`
- `Auschecken`: `mode = stock_remove`

Der TTGO-Handscanner bietet nur diese beiden Modi an. `Button 1 kurz` toggelt ebenfalls nur zwischen `Einchecken` und `Auschecken`.

## Untermenue: Lager

Eintraege:

- `Zurueck`
- `Scanner-Default`
- danach alle vom Backend geladenen Lager, z. B.:
  - `Vorrat`
  - `Kuehlschrank`
  - `Keller`
- `Lager neu laden`

Verhalten:

- `Scanner-Default`: Firmware sendet keine `locationId`; Backend nutzt den beim Pairing gesetzten Default.
- Konkretes Lager: Firmware sendet dessen `locationId` bei jedem Scan.
- `Lager neu laden`: `GET /api/v1/locations` ausfuehren und Liste lokal speichern.

## Untermenue: Synchronisieren

Eintraege:

- `Zurueck`
- `Lager neu laden`
- `Geraeteprofil laden`
- `Zeit/Status pruefen`

Funktionen:

- `Lager neu laden`: `GET /api/v1/locations`
- `Geraeteprofil laden`: spaeter optional, wenn das Backend Device-Settings aktiv ausliefert
- `Zeit/Status pruefen`: Health/API-Test und Anzeige, ob Token noch gueltig ist

## Untermenue: Verbindung

Eintraege:

- `Zurueck`
- `WLAN Status`
- `API Status`
- `Token Status`
- `WLAN neu verbinden`
- `WLAN Setup`
- `WLAN vergessen`

Anzeigen:

- WLAN verbunden / getrennt
- SSID
- Signalstaerke
- API erreichbar
- Token akzeptiert oder abgelehnt

`WLAN Setup` startet wieder den temporaeren Access Point mit Captive Portal. `WLAN vergessen` loescht die gespeicherte SSID und braucht eine zweite Bestaetigung.

## Untermenue: Energie

Eintraege:

- `Zurueck`
- `Scanner aus`
- `Display dimmen`
- `Sleep jetzt`
- `Timeout 30s`
- `Timeout 60s`

Funktionen:

- Scanner-Versorgung manuell ausschalten.
- Display-Helligkeit reduzieren.
- Light-Sleep starten.
- Inaktivitaets-Timeout setzen. Default ist 30s.

## Untermenue: Pairing

Eintraege:

- `Zurueck`
- `Pairing anzeigen`
- `Neu koppeln`
- `Haushalt vergessen`

`Haushalt vergessen` braucht eine zweite Bestaetigung:

```text
Wirklich vergessen?
B2: Nein
B1: Ja
```

Nach `Haushalt vergessen`:

- Token loeschen.
- Haushalt/Lagerliste loeschen.
- Scanner in Zustand `Nicht Gekoppelt` setzen.

## Untermenue: Info

Eintraege:

- `Zurueck`
- `Geraet`
- `Firmware`
- `Akku`
- `Pins`

Anzeigen:

- Device-Name
- Firmware-Version
- API Base URL
- aktueller Modus
- aktuelles Lager oder `Scanner-Default`
- Akkuspannung, wenn implementiert
- UART-Pins und Power-Pin fuer Diagnose

## Mindestumfang Fuer Version 1

Fuer die erste nutzbare Firmware reichen:

1. WLAN Setup per Captive Portal.
2. Nicht gekoppelt: Pairing-Code scannen.
3. Startbildschirm mit `Einchecken`/`Auschecken` und Lager.
4. `Button 1 kurz`: Einchecken/Auschecken toggeln.
5. Scanner ist nach Wake automatisch an und liest Barcodes.
6. `Button 2`: Menue oeffnen.
7. 30s Inaktivitaet: Scanner aus und Light-Sleep.
8. Menuepunkte: `Zurueck`, `Lager`, `Modus`, `Synchronisieren`, `Verbindung`, `Pairing`, `Info`.

Alles Weitere kann danach ergaenzt werden, ohne das Bedienkonzept zu aendern.
