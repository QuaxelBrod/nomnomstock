# TTGO ESP Scanner

Hardware- und Firmware-Arbeitsbereich fuer einen TTGO-T-Display-basierten Handscanner.

## Dokumente

- [FLASHING.md](./FLASHING.md) beschreibt Build, Upload und Ersteinrichtung.
- [hardware.md](./hardware.md) beschreibt die erste Schaltung fuer TTGO T-Display, MH-ET LIVE Scanner-Modul, LiPo-Akku und 3V->5V Step-Up-Wandler.
- [wifi-provisioning.md](./wifi-provisioning.md) beschreibt die WLAN-Ersteinrichtung per Captive Portal.
- [menu.md](./menu.md) beschreibt das Zwei-Button-Menue fuer Pairing, Einchecken, Auschecken, Lagerwahl und Diagnose.
- [power-management.md](./power-management.md) beschreibt Wakeup, Scanner-Stromversorgung und 30s-Light-Sleep.

## Firmware

- [platformio.ini](./platformio.ini) definiert das PlatformIO-Projekt fuer `ttgo-t-display`.
- [ttgo_scanner/ttgo_scanner.ino](./ttgo_scanner/ttgo_scanner.ino) ist der erste Arduino-Sketch.

## Annahmen

- Board: LilyGO/TTGO T-Display ESP32 mit Display und zwei Board-Buttons.
- Scanner: MH-ET LIVE Barcode-Scanner-Modul mit UART-Pins `TXD`/`RXD` und 5V-Versorgung.
- Akku: LiPo am TTGO-Akkuanschluss.
- Step-Up: externer 3V->5V-Wandler fuer das Scanner-Modul.

Vor dem Loeten die konkrete Boardrevision und die Beschriftung am Scanner-Modul gegenpruefen.
