# Power Management

Der TTGO soll nach kurzer Nichtbenutzung Strom sparen. Der 5V-Scanner wird nur im aktiven Zustand versorgt und immer vor dem Schlafmodus ausgeschaltet.

Version 0.1 nutzt Light-Sleep, damit beide vorhandenen TTGO-Buttons aufwecken koennen. Deep-Sleep ist spaeter moeglich, braucht bei den aktiven-low Board-Buttons aber je nach ESP32-Core oder Hardware eine andere Wakeup-Beschaltung.

## Zustände

```text
Light Sleep
  |
  | Button 1 oder Button 2
  v
Wake / Active
  |
  | Scanner Power ON
  v
Ready
  |
  | 30s keine Bedienung und kein Scan
  v
Scanner Power OFF
  |
  v
Light Sleep
```

## Aufwachen

- `Button 1` oder `Button 2` weckt den ESP32.
- Nach dem Aufwachen wird das Display aktiviert.
- Wenn WLAN und Haushalt gekoppelt sind, wird der Scanner eingeschaltet und bleibt an.
- Danach wartet die Firmware auf Barcode-Daten vom Scanner-UART.

Wichtig: Es ist kein langer Tastendruck zum Scannen noetig. Der Scanner ist im aktiven Zustand bereits an.

## Inaktivitäts-Timeout

Default: 30 Sekunden.

Als Aktivität zaehlt:

- Button 1 gedrueckt.
- Button 2 gedrueckt.
- Barcode wurde empfangen.
- API-Request laeuft.
- Menue ist offen und wird bedient.

Wenn 30 Sekunden keine Aktivitaet passiert:

1. laufende UART-Verarbeitung beenden oder abbrechen.
2. Scanner-Versorgung ausschalten: `GPIO32 LOW`.
3. Display ausschalten oder Backlight aus.
4. Wakeup fuer beide Buttons konfigurieren.
5. ESP32 in Light-Sleep setzen.

## Wakeup-Pins

TTGO T-Display Buttons:

- `Button 1 = GPIO35`
- `Button 2 = GPIO0`

Beide Pins werden in Version 0.1 per Light-Sleep-GPIO-Wakeup genutzt. `GPIO0` ist zugleich Boot-Strap-Pin; beim Reset/Flashen nicht gedrueckt halten.

Firmware-Hinweis:

- Buttons als aktive-low behandeln, wenn die Board-Schaltung gegen GND zieht.
- Fuer spaeteren Deep-Sleep `ext1` Wakeup mit GPIO-Maske pruefen oder eine kleine Wakeup-Beschaltung ergaenzen.
- Wenn die konkrete Boardrevision abweicht, Wakeup-Polaritaet messen.

## Scanner Power

`GPIO32` steuert den Step-Up oder dessen High-Side-Schalter.

- Beim Boot sofort `GPIO32 LOW`, damit der Scanner aus bleibt.
- Nach erfolgreichem Wake und normalem Betriebszustand `GPIO32 HIGH`.
- Nach 300-800 ms Stabilisierung UART-Daten akzeptieren.
- Vor jedem Sleep `GPIO32 LOW`.

Im WLAN-Setup und beim ungepaarten Zustand ist der Scanner aus, bis ein Pairing-Code gelesen werden soll. Nach dem Pairing-Scan wird er wieder ausgeschaltet oder geht in den normalen Active-Zustand.

## Display

- Im Active-Zustand Display an.
- Nach 20 Sekunden optional Backlight dimmen.
- Nach 30 Sekunden Light-Sleep.
- Bei API-Fehlern kurze Meldung anzeigen, aber Timeout weiterlaufen lassen.

## Empfohlene Defaults

| Einstellung | Wert |
| --- | ---: |
| Inaktivitaet bis Light-Sleep | 30s |
| Scanner-Stabilisierungszeit nach Power-On | 300-800 ms |
| Backlight-Dimmen | 20s |
| Scanner Power Pin | `GPIO32` |
| Wake Buttons | `GPIO35`, `GPIO0` |

## Bedienfolge

1. Scanner liegt im Light-Sleep, Scanner-Modul stromlos.
2. Benutzer drueckt einen Button.
3. TTGO wacht auf, Display geht an.
4. Scanner-Versorgung geht an.
5. Benutzer scannt direkt oder waehlt Modus/Lager.
6. Jeder Buttondruck und jeder Scan setzt den 30s-Timer zurueck.
7. Nach 30s Inaktivitaet: Scanner aus, TTGO in Light-Sleep.
