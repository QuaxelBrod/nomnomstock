# WLAN Provisioning

Der Scanner braucht WLAN, bevor er einen Haushalt koppeln kann. Beste Loesung fuer den ESP32: ein temporaerer Access Point mit Captive Portal.

## Warum Captive Portal

- funktioniert mit Smartphone, Tablet oder Laptop
- keine eigene App noetig
- keine Bluetooth-Abhaengigkeit
- SSID, Passwort und API-URL koennen in einem Schritt gesetzt werden
- spaeter leicht wieder aufrufbar, wenn sich WLAN oder Server-Adresse aendern

## Boot-Reihenfolge

1. Scanner-5V-Versorgung aus lassen.
2. Display starten.
3. Gespeicherte WLAN-Daten aus NVS/Preferences laden.
4. Wenn keine WLAN-Daten vorhanden sind: `WLAN Setup` starten.
5. Wenn WLAN-Daten vorhanden sind: 10-15 Sekunden verbinden versuchen.
6. Wenn Verbindung fehlschlaegt: `WLAN Fehler` anzeigen und Setup anbieten.
7. Wenn WLAN verbunden ist, API-Base pruefen.
8. Wenn kein Haushalt/Token gekoppelt ist: `Haushalt koppeln`.
9. Wenn Haushalt gekoppelt ist: normaler Scannerbetrieb.

## Zustand: WLAN Setup

Display:

```text
WLAN einrichten

AP: nomnomstock-XXXX
Pass: nomnom1234
http://192.168.4.1

B1: Neustart
B2: Abbruch
```

Verhalten:

- ESP32 startet SoftAP `nomnomstock-XXXX`, wobei `XXXX` die letzten 4 Zeichen der MAC-Adresse sind.
- SoftAP mit WPA2-Passwort betreiben, nicht offen.
- Passwort in Version 0.1: `nomnom1234`. Spaeter geraetespezifisch aus MAC ableiten.
- Captive Portal auf `http://192.168.4.1` anzeigen.
- Scanner-Modul bleibt ausgeschaltet.

## Portal-Felder

Pflichtfelder:

- WLAN SSID
- WLAN Passwort
- API Base URL

Optionale Felder:

- Geraetename, z. B. `Kueche Scanner`
- Setup-Passwort aendern

API Base URL Beispiele:

```text
http://192.168.178.50:3001/api/v1
https://example.tld/api/v1
```

Fuer lokale Tests im Heimnetz ist die IP des Rechners/Servers meist besser als `localhost`, weil `localhost` auf dem ESP32 der ESP32 selbst waere.

## Speichern

Nach erfolgreichem Speichern:

- WLAN SSID in NVS speichern.
- WLAN Passwort in NVS speichern.
- API Base URL in NVS speichern.
- SoftAP stoppen.
- Neustart oder direkter Verbindungsversuch.

NVS-Key-Vorschlag:

| Key | Inhalt |
| --- | --- |
| `wifi.ssid` | WLAN-Name |
| `wifi.pass` | WLAN-Passwort |
| `api.base` | API Base URL mit `/api/v1` |
| `setup.done` | Boolean fuer abgeschlossenes Setup |

## WLAN Fehler

Wenn gespeicherte WLAN-Daten nicht funktionieren:

```text
WLAN Fehler
SSID: MeinWLAN

B1: erneut
B2: Setup
```

- `Button 1`: erneuter Verbindungsversuch.
- `Button 2`: Captive Portal starten.

## Menue-Einbindung

Im normalen Betrieb gehoert WLAN ins Menue `Verbindung`:

- `Zurueck`
- `WLAN Status`
- `API Status`
- `WLAN neu verbinden`
- `WLAN Setup`
- `WLAN vergessen`

`WLAN vergessen` braucht eine zweite Bestaetigung:

```text
WLAN vergessen?
B2: Nein
B1: Ja
```

Nach `WLAN vergessen`:

- `wifi.ssid` und `wifi.pass` loeschen.
- API Base URL optional behalten, weil sie oft gleich bleibt.
- Neustart in `WLAN Setup`.

## Pairing-Abhaengigkeit

Haushalt-Pairing darf erst angeboten werden, wenn WLAN verbunden und die API Base URL erreichbar ist.

Der Pairing-Barcode enthaelt fuer den 1D-Scanner nur den Pairing-Key. Deshalb muss die API Base URL schon vorher ueber das WLAN-Setup bekannt sein.

## Empfohlene Firmware-Bibliotheken

Fuer Arduino/PlatformIO:

- ESP32 `WiFi`
- `WebServer` oder `ESPAsyncWebServer`
- `DNSServer` fuer Captive Portal
- `Preferences` fuer NVS-Speicherung

Alternativ kann spaeter ein bestehender WiFiManager genutzt werden. Fuer die erste eigene Firmware ist ein kleines Captive Portal mit den drei Feldern SSID, Passwort und API Base URL ueberschaubar und kontrollierbar.
