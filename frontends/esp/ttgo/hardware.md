# TTGO T-Display + MH-ET LIVE Scanner

Ziel: Der TTGO bleibt akkubetrieben und schaltet den 5V-Scanner nur bei Bedarf ein. Der Scanner kann per UART Barcodes an den ESP32 senden. Der ESP32 kann spaeter pro Scan Modus und Lagerort an die nomnomstock-API senden.

## Referenz und Annahmen

TTGO T-Display V1.8 Pinout laut LilyGO-Repo:

- Display/SPI belegt: `GPIO18`, `GPIO19`, `GPIO5`, `GPIO16`, `GPIO23`, `GPIO4`
- I2C frei/typisch: `GPIO21`, `GPIO22`
- Akku/ADC: `GPIO34`, ADC-Power `GPIO14`
- Buttons: `BUTTON1 = GPIO35`, `BUTTON2 = GPIO0`

Quelle: https://github.com/Xinyuan-LilyGO/TTGO-T-Display

Diese Schaltung vermeidet die Display-Pins und nutzt freie GPIOs. Falls deine TTGO-Revision abweicht, die Pinbelegung vor dem Anschluss anpassen.

## Funktionsblock

```text
LiPo am TTGO
   |
   +-- TTGO / ESP32 / Display
   |
   +-- geschalteter VBAT-Pfad -- 3V->5V Step-Up -- +5V Scanner

ESP32 UART2 RX  <--- Pegelteiler <--- Scanner TXD
ESP32 UART2 TX  --------------------> Scanner RXD
ESP32 GPIO32    ---> Power-Switch fuer Step-Up
ESP32 GPIO33    ---> optional Scanner TRIG/EN
GND gemeinsam
```

## Empfohlene Pinbelegung

| Funktion | TTGO / ESP32 | Scanner / Schaltung | Hinweis |
| --- | ---: | --- | --- |
| Scanner UART RX am ESP | `GPIO26` | Scanner `TXD` ueber Pegelteiler | 5V-TTL niemals direkt an ESP32 |
| Scanner UART TX vom ESP | `GPIO27` | Scanner `RXD` | 3.3V wird von vielen TTL-Modulen akzeptiert; sonst Level-Shifter |
| Scanner Power Enable | `GPIO32` | Gate-Treiber fuer Step-Up-Versorgung | HIGH = Scanner ein |
| Optional Trigger | `GPIO33` | Scanner `TRIG`, `KEY` oder `EN` | Nur anschliessen, wenn Modul diesen Pin hat |
| Modus/Button 1 | `GPIO35` | Board-Button | input-only, fuer UI nutzbar |
| Aktion/Button 2 | `GPIO0` | Board-Button | Boot-Strap-Pin; beim Reset nicht gedrueckt halten |
| GND | `GND` | Scanner GND, Step-Up GND | gemeinsame Masse zwingend |
| Scanner 5V | - | Step-Up `OUT+` -> Scanner `VCC` | nur geschaltet versorgen |

## Stromversorgung

Der Scanner soll nur bei Bedarf Strom bekommen. Es gibt zwei Varianten.

### Variante A: Step-Up mit EN-Pin

Wenn dein 3V->5V-Wandler einen `EN`, `CE` oder `SHDN` Pin hat, ist das die bevorzugte Variante.

```text
TTGO VBAT / BAT+  ---> Step-Up VIN+
TTGO GND          ---> Step-Up VIN-
Step-Up OUT+      ---> Scanner VCC
Step-Up OUT-      ---> Scanner GND
ESP32 GPIO32      ---> Step-Up EN/CE
```

Details:

- Step-Up-Eingang vom Akku-/`VBAT`-/`BAT+`-Pfad speisen, nicht vom TTGO-`3V3`-Regler.
- `GPIO32 HIGH`: Step-Up aktiv, Scanner bekommt 5V.
- `GPIO32 LOW`: Step-Up aus, Scanner stromlos.
- Falls `EN` active-low ist, Logik in Firmware invertieren.
- `EN` mit 100k Pulldown oder Pullup so beschalten, dass der Scanner beim Boot aus bleibt. Das haengt vom Wandler ab.

### Variante B: Step-Up ohne EN-Pin

Wenn der Wandler keinen Enable-Pin hat, den Eingang des Wandlers high-side schalten. Nicht den Scanner-GND schalten, weil dann UART-Signale ueber Schutzdioden Rueckstrom verursachen koennen.

```text
LiPo / TTGO BAT+ ----+------------------------------+
                     |                              |
                    100k                            |
                     |                              |
                     +---- P-MOS Gate               |
                          P-MOS Source <------------+
                          P-MOS Drain ---- Step-Up VIN+

ESP32 GPIO32 --1k-- N-MOS Gate
N-MOS Source ------- GND
N-MOS Drain -------- P-MOS Gate

TTGO GND ----------- Step-Up VIN- / OUT- / Scanner GND
Step-Up OUT+ ------- Scanner VCC
```

Bauteile:

- P-Kanal MOSFET als High-Side-Schalter, logic-level, niedriger `Rds(on)` bei `Vgs = -2.5V`.
- N-Kanal MOSFET oder kleiner NPN-Transistor als Gate-Pulldown.
- 100k Pullup von P-MOS-Gate nach BAT+.
- 1k Serienwiderstand vom `GPIO32` zum N-MOS-Gate.
- optional 100k Pulldown am N-MOS-Gate nach GND.

Logik:

- `GPIO32 LOW`: N-MOS aus, P-MOS-Gate wird nach BAT+ gezogen, Scanner aus.
- `GPIO32 HIGH`: N-MOS zieht P-MOS-Gate nach GND, Step-Up bekommt Akku, Scanner ein.

## UART-Pegel

ESP32-GPIOs sind nicht 5V-tolerant. Deshalb Scanner `TXD` nur ueber Pegelanpassung an `GPIO26` anschliessen.

Minimaler Pegelteiler:

```text
Scanner TXD --- 20k ---+--- ESP32 GPIO26
                       |
                      10k
                       |
                      GND
```

Damit werden 5V auf ca. 3.3V reduziert. Wenn dein Scanner-TX bereits 3.3V ausgibt, ist der Teiler trotzdem unkritisch.

ESP32 `GPIO27` zu Scanner `RXD` kann oft direkt verbunden werden, weil 3.3V als HIGH erkannt wird. Wenn das konkrete Scanner-Modul 5V-CMOS-Pegel verlangt, dazwischen einen unidirektionalen Level-Shifter oder 74AHCT-Eingang verwenden.

## Optionaler Trigger-Pin

Viele Scanner-Module koennen dauerhaft scannen, seriell getriggert werden oder haben einen `TRIG`/`KEY`/`EN` Pin. Wenn vorhanden:

```text
ESP32 GPIO33 ---> Scanner TRIG/KEY
GND gemeinsam
```

Vor Anschluss pruefen:

- Ist der Pin active-high oder active-low?
- Erwartet er 3.3V oder 5V?
- Hat das Modul internen Pullup?

Wenn unklar: erst nicht anschliessen und den Scanner nur ueber Power-Gating betreiben.

## Empfohlener Ablauf in Firmware

1. `GPIO32` als Output setzen und LOW halten.
2. Display initialisieren.
3. UART2 mit `RX=GPIO26`, `TX=GPIO27` initialisieren.
4. Wenn WLAN und Haushalt gekoppelt sind, beim Aufwachen `GPIO32 HIGH`.
5. 300-800 ms warten, bis Scanner und Step-Up stabil sind.
6. Scanner bis zum Ruhemodus eingeschaltet lassen und Barcode per UART lesen.
7. Scan an API senden:
   - `mode`: `stock_add` fuer Einchecken oder `stock_remove` fuer Auschecken
   - `locationId`: gewaehltes Lager; weglassen fuer Scanner-Default
   - `quantity`: normalerweise `1`
8. Nach 30s Inaktivitaet Scanner mit `GPIO32 LOW` ausschalten und ESP32 in Light-Sleep setzen.

## Lagerort-Override fuer Handscanner

Der Scanner bekommt beim Koppeln einen Default-Lagerort. Ein Handscanner mit Display kann diesen pro Scan ueberschreiben:

```json
{
  "barcode": "4006381333931",
  "mode": "stock_add",
  "locationId": 2,
  "quantity": 1
}
```

Ohne `locationId` nutzt das Backend den Default-Lagerort des Scanners. Falls auch der fehlt, wird `Vorrat` genutzt.

## Sicherheit und Test

- Vor dem Verbinden mit dem Scanner Step-Up-Ausgang messen: 5.0V, richtige Polaritaet.
- Scanner-`TXD` nie direkt mit ESP32 verbinden, wenn der Pegel 5V sein kann.
- Gemeinsame Masse immer zuerst verbinden.
- Beim Einschalten Stromspitzen beachten; Scanner-Module koennen kurzzeitig deutlich mehr als den Durchschnittsstrom ziehen.
- LiPo nicht direkt loeten oder kurzschliessen; nur ueber geeignete JST-/Schraub-/Steckverbinder.
- Wenn der TTGO instabil resetet, Step-Up und Scanner mit zusaetzlichem Puffer versehen:
  - 100 uF bis 470 uF Low-ESR am Step-Up-Ausgang
  - 10 uF + 100 nF nahe am Scanner-Modul

## Offene Punkte fuer konkrete Hardware

- Exakte TTGO-Revision pruefen.
- Exaktes MH-ET-LIVE-Modell und dessen UART-Baudrate pruefen.
- Scanner-Pin `TRIG`/`KEY`/`EN` nur nach Datenblatt anschliessen.
- Step-Up-Modul pruefen: mit `EN`-Pin Variante A nutzen, ohne `EN` Variante B.
