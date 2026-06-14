#include <Arduino.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <WebServer.h>
#include <WiFi.h>
#include <driver/gpio.h>
#include <esp_sleep.h>

static const char *FIRMWARE_VERSION = "0.1.0";

static const int BUTTON1_PIN = 35;
static const int BUTTON2_PIN = 0;
static const int SCANNER_POWER_PIN = 32;
static const int SCANNER_RX_PIN = 26;
static const int SCANNER_TX_PIN = 27;
static const int TFT_BACKLIGHT_PIN = 4;

static const uint32_t SCANNER_BAUD = 9600;
static const uint32_t SCANNER_STABILIZE_MS = 500;
static const uint32_t DEFAULT_IDLE_TIMEOUT_MS = 30000;
static const uint32_t SETUP_PORTAL_TIMEOUT_MS = 10UL * 60UL * 1000UL;

static const byte DNS_PORT = 53;

enum AppState {
  STATE_BOOT,
  STATE_WIFI_SETUP,
  STATE_WIFI_ERROR,
  STATE_UNPAIRED,
  STATE_READY,
  STATE_MENU,
  STATE_MESSAGE,
};

enum MenuPage {
  MENU_MAIN,
  MENU_LOCATION,
  MENU_MODE,
  MENU_SYNC,
  MENU_CONNECTION,
  MENU_ENERGY,
  MENU_PAIRING,
  MENU_INFO,
};

struct LocationEntry {
  int id;
  String name;
};

static const int MAX_LOCATIONS = 10;

TFT_eSPI tft;
Preferences prefs;
DNSServer dnsServer;
WebServer setupServer(80);

AppState state = STATE_BOOT;
MenuPage menuPage = MENU_MAIN;

String wifiSsid;
String wifiPass;
String apiBase;
String token;
String deviceName = "TTGO Scanner";
String currentMode = "stock_add";
String selectedLocationName = "Scanner-Default";
int defaultLocationId = 0;
int selectedLocationId = 0;

LocationEntry locations[MAX_LOCATIONS];
int locationCount = 0;

uint32_t idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
uint32_t lastActivityMs = 0;
uint32_t messageUntilMs = 0;
uint32_t setupStartedMs = 0;
uint32_t scannerPoweredAtMs = 0;

bool button1WasDown = false;
bool button2WasDown = false;
bool scannerPowered = false;
bool wifiConnected = false;
bool portalRunning = false;

int menuIndex = 0;
String scannerBuffer;

String normalizeApiBase(String value) {
  value.trim();
  while (value.endsWith("/")) value.remove(value.length() - 1);
  if (!value.endsWith("/api/v1")) value += "/api/v1";
  return value;
}

String jsonEscape(const String &value) {
  String out;
  out.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i += 1) {
    char c = value[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else if (c == '\r') {
      out += "\\r";
    } else {
      out += c;
    }
  }
  return out;
}

String extractJsonString(const String &json, const String &key) {
  String needle = "\"" + key + "\"";
  int keyPos = json.indexOf(needle);
  if (keyPos < 0) return "";
  int colon = json.indexOf(':', keyPos + needle.length());
  if (colon < 0) return "";
  int firstQuote = json.indexOf('"', colon + 1);
  if (firstQuote < 0) return "";

  String out;
  bool escaped = false;
  for (int i = firstQuote + 1; i < (int)json.length(); i += 1) {
    char c = json[i];
    if (escaped) {
      out += c;
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      return out;
    } else {
      out += c;
    }
  }
  return "";
}

int extractJsonInt(const String &json, const String &key, int fallback = 0) {
  String needle = "\"" + key + "\"";
  int keyPos = json.indexOf(needle);
  if (keyPos < 0) return fallback;
  int colon = json.indexOf(':', keyPos + needle.length());
  if (colon < 0) return fallback;
  int start = colon + 1;
  while (start < (int)json.length() && isspace((unsigned char)json[start])) start += 1;
  if (json.substring(start, start + 4) == "null") return fallback;
  return json.substring(start).toInt();
}

void saveConfig() {
  prefs.putString("wifi_ssid", wifiSsid);
  prefs.putString("wifi_pass", wifiPass);
  prefs.putString("api_base", apiBase);
  prefs.putString("token", token);
  prefs.putString("dev_name", deviceName);
  prefs.putString("mode", currentMode);
  prefs.putInt("def_loc", defaultLocationId);
  prefs.putInt("sel_loc", selectedLocationId);
  prefs.putString("sel_name", selectedLocationName);
  prefs.putUInt("timeout", idleTimeoutMs);
}

void loadConfig() {
  wifiSsid = prefs.getString("wifi_ssid", "");
  wifiPass = prefs.getString("wifi_pass", "");
  apiBase = prefs.getString("api_base", "");
  token = prefs.getString("token", "");
  deviceName = prefs.getString("dev_name", "TTGO Scanner");
  currentMode = prefs.getString("mode", "stock_add");
  defaultLocationId = prefs.getInt("def_loc", 0);
  selectedLocationId = prefs.getInt("sel_loc", 0);
  selectedLocationName = prefs.getString("sel_name", "Scanner-Default");
  idleTimeoutMs = prefs.getUInt("timeout", DEFAULT_IDLE_TIMEOUT_MS);
  if (currentMode != "stock_add" && currentMode != "stock_remove") currentMode = "stock_add";
}

void forgetPairing() {
  token = "";
  defaultLocationId = 0;
  selectedLocationId = 0;
  selectedLocationName = "Scanner-Default";
  prefs.remove("token");
  prefs.remove("def_loc");
  prefs.remove("sel_loc");
  prefs.remove("sel_name");
}

void forgetWifi() {
  wifiSsid = "";
  wifiPass = "";
  prefs.remove("wifi_ssid");
  prefs.remove("wifi_pass");
}

void noteActivity() {
  lastActivityMs = millis();
}

bool buttonDown(int pin) {
  return digitalRead(pin) == LOW;
}

void syncButtonState() {
  button1WasDown = buttonDown(BUTTON1_PIN);
  button2WasDown = buttonDown(BUTTON2_PIN);
}

void scannerPower(bool on) {
  digitalWrite(SCANNER_POWER_PIN, on ? HIGH : LOW);
  if (on && !scannerPowered) {
    scannerPoweredAtMs = millis();
    scannerBuffer = "";
  }
  scannerPowered = on;
}

void displayBacklight(bool on) {
  digitalWrite(TFT_BACKLIGHT_PIN, on ? HIGH : LOW);
}

void drawLines(const String &title, const String &l1 = "", const String &l2 = "", const String &l3 = "", const String &l4 = "") {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(4, 4);
  tft.println(title);

  tft.setTextSize(1);
  tft.setCursor(4, 38);
  if (l1.length()) tft.println(l1);
  if (l2.length()) tft.println(l2);
  if (l3.length()) tft.println(l3);
  if (l4.length()) tft.println(l4);
}

void showMessage(const String &title, const String &l1 = "", const String &l2 = "", uint32_t ms = 1600) {
  state = STATE_MESSAGE;
  messageUntilMs = millis() + ms;
  drawLines(title, l1, l2);
}

String modeLabel() {
  return currentMode == "stock_remove" ? "Auschecken" : "Einchecken";
}

void renderReady() {
  String action = currentMode == "stock_remove" ? "B1: Einchecken" : "B1: Auschecken";
  drawLines(modeLabel(), "Lager: " + selectedLocationName, action, "B2: Menue");
}

void renderUnpaired() {
  drawLines("Haushalt koppeln", "Pairing-Code scannen", "Scanner ist an", "B2: WLAN Setup");
}

String menuItemForCurrentPage(int index) {
  static const char *mainItems[] = {"Lager", "Modus", "Synchronisieren", "Verbindung", "Energie", "Pairing", "Info", "Zurueck"};
  static const char *modeItems[] = {"Zurueck", "Einchecken", "Auschecken"};
  static const char *syncItems[] = {"Zurueck", "Lager neu laden", "API pruefen"};
  static const char *connectionItems[] = {"Zurueck", "WLAN Status", "API Status", "WLAN Setup", "WLAN vergessen"};
  static const char *energyItems[] = {"Zurueck", "Scanner aus", "Sleep jetzt", "Timeout 30s", "Timeout 60s"};
  static const char *pairingItems[] = {"Zurueck", "Neu koppeln", "Haushalt vergessen"};
  static const char *infoItems[] = {"Zurueck", "Geraet", "Firmware", "Akku/Pins"};

  if (menuPage == MENU_MAIN) return mainItems[index];
  if (menuPage == MENU_MODE) return modeItems[index];
  if (menuPage == MENU_SYNC) return syncItems[index];
  if (menuPage == MENU_CONNECTION) return connectionItems[index];
  if (menuPage == MENU_ENERGY) return energyItems[index];
  if (menuPage == MENU_PAIRING) return pairingItems[index];
  if (menuPage == MENU_INFO) return infoItems[index];

  if (menuPage == MENU_LOCATION) {
    if (index == 0) return "Zurueck";
    if (index == 1) return "Scanner-Default";
    if (index >= 2 && index < 2 + locationCount) return locations[index - 2].name;
    return "Lager neu laden";
  }

  return "";
}

int menuCountForCurrentPage() {
  if (menuPage == MENU_MAIN) return 8;
  if (menuPage == MENU_MODE) return 3;
  if (menuPage == MENU_SYNC) return 3;
  if (menuPage == MENU_CONNECTION) return 5;
  if (menuPage == MENU_ENERGY) return 5;
  if (menuPage == MENU_PAIRING) return 3;
  if (menuPage == MENU_INFO) return 4;
  if (menuPage == MENU_LOCATION) return 3 + locationCount;
  return 1;
}

String titleForCurrentPage() {
  if (menuPage == MENU_MAIN) return "Menue";
  if (menuPage == MENU_LOCATION) return "Lager";
  if (menuPage == MENU_MODE) return "Modus";
  if (menuPage == MENU_SYNC) return "Sync";
  if (menuPage == MENU_CONNECTION) return "Verbindung";
  if (menuPage == MENU_ENERGY) return "Energie";
  if (menuPage == MENU_PAIRING) return "Pairing";
  if (menuPage == MENU_INFO) return "Info";
  return "Menue";
}

void renderMenu() {
  int count = menuCountForCurrentPage();
  if (menuIndex >= count) menuIndex = 0;

  String current = "> " + menuItemForCurrentPage(menuIndex);
  String next = "  " + menuItemForCurrentPage((menuIndex + 1) % count);
  String hint = "B2 weiter  B1 OK";
  drawLines(titleForCurrentPage(), current, next, hint);
}

void openMenu(MenuPage page) {
  state = STATE_MENU;
  menuPage = page;
  menuIndex = 0;
  renderMenu();
}

bool connectWifi(uint32_t timeoutMs = 15000) {
  if (!wifiSsid.length()) return false;

  drawLines("WLAN", "Verbinde...", wifiSsid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      return true;
    }
    delay(250);
  }

  wifiConnected = false;
  return false;
}

bool apiGet(const String &path, String &response, bool auth = true) {
  if (WiFi.status() != WL_CONNECTED || !apiBase.length()) return false;

  HTTPClient http;
  http.setTimeout(6000);
  http.begin(apiBase + path);
  if (auth && token.length()) http.addHeader("Authorization", "Bearer " + token);
  int code = http.GET();
  response = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

bool apiPost(const String &path, const String &body, String &response, bool auth = true) {
  if (WiFi.status() != WL_CONNECTED || !apiBase.length()) return false;

  HTTPClient http;
  http.setTimeout(8000);
  http.begin(apiBase + path);
  http.addHeader("Content-Type", "application/json");
  if (auth && token.length()) http.addHeader("Authorization", "Bearer " + token);
  int code = http.POST(body);
  response = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

bool checkApi() {
  String response;
  return apiGet("/health", response, false);
}

bool loadLocations() {
  if (!token.length()) return false;
  String response;
  if (!apiGet("/locations", response, true)) return false;

  locationCount = 0;
  int pos = 0;
  while (locationCount < MAX_LOCATIONS) {
    int idPos = response.indexOf("\"id\"", pos);
    if (idPos < 0) break;
    int namePos = response.indexOf("\"name\"", idPos);
    if (namePos < 0) break;

    int id = extractJsonInt(response.substring(idPos, namePos), "id", 0);
    String name = extractJsonString(response.substring(namePos), "name");
    if (id > 0 && name.length()) {
      locations[locationCount].id = id;
      locations[locationCount].name = name;
      locationCount += 1;
    }
    pos = namePos + 6;
  }
  return true;
}

bool pairWithKey(const String &pairingKey) {
  String body = "{";
  body += "\"pairingKey\":\"" + jsonEscape(pairingKey) + "\",";
  body += "\"device\":{\"name\":\"" + jsonEscape(deviceName) + "\",\"type\":\"ttgo-t-display\",\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\"}";
  body += "}";

  String response;
  if (!apiPost("/devices/pair", body, response, false)) {
    showMessage("Pairing Fehler", "API abgelehnt", "", 2500);
    return false;
  }

  String newToken = extractJsonString(response, "token");
  if (!newToken.length()) {
    showMessage("Pairing Fehler", "Kein Token", "", 2500);
    return false;
  }

  token = newToken;
  defaultLocationId = extractJsonInt(response, "defaultLocationId", 0);
  String responseMode = extractJsonString(response, "defaultMode");
  if (responseMode == "stock_remove") currentMode = "stock_remove";
  else currentMode = "stock_add";
  selectedLocationId = 0;
  selectedLocationName = "Scanner-Default";
  saveConfig();
  loadLocations();
  return true;
}

bool sendScan(const String &barcode) {
  String body = "{";
  body += "\"barcode\":\"" + jsonEscape(barcode) + "\",";
  body += "\"mode\":\"" + currentMode + "\",";
  if (selectedLocationId > 0) {
    body += "\"locationId\":" + String(selectedLocationId) + ",";
  }
  body += "\"quantity\":1";
  body += "}";

  String response;
  if (!apiPost("/scanner/events", body, response, true)) {
    showMessage("Scan Fehler", "Nicht gesendet", barcode, 2500);
    return false;
  }

  if (response.indexOf("\"status\":\"processed\"") >= 0) {
    showMessage("OK", modeLabel(), barcode, 900);
  } else {
    showMessage("Pending", "Web pruefen", barcode, 1600);
  }
  return true;
}

void handleScannerLine(const String &rawLine) {
  String line = rawLine;
  line.trim();
  if (!line.length()) return;

  noteActivity();

  if (!token.length()) {
    drawLines("Pairing", "Sende Code...", line);
    if (pairWithKey(line)) {
      state = STATE_READY;
      scannerPower(true);
      showMessage("Gekoppelt", "Bereit", "", 1500);
    }
    return;
  }

  drawLines("Scan", line, "Sende...");
  sendScan(line);
}

void pollScanner() {
  if (!scannerPowered) return;
  if (millis() - scannerPoweredAtMs < SCANNER_STABILIZE_MS) return;

  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\r' || c == '\n') {
      if (scannerBuffer.length()) {
        String line = scannerBuffer;
        scannerBuffer = "";
        handleScannerLine(line);
      }
    } else if (isPrintable(c)) {
      scannerBuffer += c;
      if (scannerBuffer.length() > 96) scannerBuffer = "";
    }
  }
}

String htmlPage() {
  String html = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>nomnomstock Scanner Setup</title>";
  html += "<style>body{font-family:sans-serif;margin:2rem;max-width:36rem}label{display:block;margin:.8rem 0}.i{width:100%;padding:.6rem}button{padding:.7rem 1rem}</style>";
  html += "</head><body><h1>Scanner WLAN Setup</h1>";
  html += "<form method='post' action='/save'>";
  html += "<label>WLAN SSID<input class='i' name='ssid' value='" + wifiSsid + "'></label>";
  html += "<label>WLAN Passwort<input class='i' name='pass' type='password'></label>";
  html += "<label>API Base URL<input class='i' name='api' placeholder='http://192.168.178.50:3001/api/v1' value='" + apiBase + "'></label>";
  html += "<label>Geraetename<input class='i' name='name' value='" + deviceName + "'></label>";
  html += "<button type='submit'>Speichern</button></form>";
  html += "</body></html>";
  return html;
}

String setupApName() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return "nomnomstock-" + mac.substring(mac.length() - 4);
}

void startProvisioning() {
  scannerPower(false);
  portalRunning = true;
  state = STATE_WIFI_SETUP;
  setupStartedMs = millis();
  wifiConnected = false;

  WiFi.mode(WIFI_AP);
  String apName = setupApName();
  WiFi.softAP(apName.c_str(), "nomnom1234");
  IPAddress apIp = WiFi.softAPIP();
  dnsServer.start(DNS_PORT, "*", apIp);

  setupServer.on("/", HTTP_GET, []() {
    setupServer.send(200, "text/html", htmlPage());
  });

  setupServer.on("/save", HTTP_POST, []() {
    wifiSsid = setupServer.arg("ssid");
    wifiPass = setupServer.arg("pass");
    apiBase = normalizeApiBase(setupServer.arg("api"));
    deviceName = setupServer.arg("name");
    if (!deviceName.length()) deviceName = "TTGO Scanner";
    saveConfig();
    setupServer.send(200, "text/html", "<html><body><h1>Gespeichert</h1><p>Scanner startet neu.</p></body></html>");
    delay(700);
    ESP.restart();
  });

  setupServer.onNotFound([]() {
    setupServer.sendHeader("Location", "/", true);
    setupServer.send(302, "text/plain", "");
  });

  setupServer.begin();
  drawLines("WLAN einrichten", "AP: " + apName, "Pass: nomnom1234", "http://192.168.4.1");
}

void stopProvisioning() {
  if (!portalRunning) return;
  setupServer.stop();
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  portalRunning = false;
}

bool waitConfirm(const String &title) {
  drawLines(title, "B1: Ja", "B2: Nein");
  uint32_t start = millis();
  while (millis() - start < 10000) {
    bool b1 = buttonDown(BUTTON1_PIN);
    bool b2 = buttonDown(BUTTON2_PIN);
    if (b1) {
      while (buttonDown(BUTTON1_PIN)) delay(10);
      noteActivity();
      return true;
    }
    if (b2) {
      while (buttonDown(BUTTON2_PIN)) delay(10);
      noteActivity();
      return false;
    }
    delay(20);
  }
  return false;
}

void wakeToActive() {
  displayBacklight(true);
  noteActivity();
  syncButtonState();
  wifiConnected = WiFi.status() == WL_CONNECTED;
  if (wifiSsid.length() && !wifiConnected) {
    connectWifi(6000);
  }

  if (wifiConnected && token.length()) {
    scannerPower(true);
    state = STATE_READY;
    renderReady();
  } else if (wifiConnected) {
    scannerPower(true);
    state = STATE_UNPAIRED;
    renderUnpaired();
  } else if (wifiSsid.length()) {
    state = STATE_WIFI_ERROR;
    drawLines("WLAN Fehler", wifiSsid, "B1: erneut", "B2: Setup");
  } else {
    startProvisioning();
  }
}

void enterIdleSleep() {
  scannerPower(false);
  displayBacklight(false);
  tft.fillScreen(TFT_BLACK);
  delay(50);

  while (buttonDown(BUTTON1_PIN) || buttonDown(BUTTON2_PIN)) delay(10);

  gpio_wakeup_enable((gpio_num_t)BUTTON1_PIN, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)BUTTON2_PIN, GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();
  esp_light_sleep_start();
  gpio_wakeup_disable((gpio_num_t)BUTTON1_PIN);
  gpio_wakeup_disable((gpio_num_t)BUTTON2_PIN);

  wakeToActive();
}

void handleMenuSelect();

void handleButton1() {
  noteActivity();

  if (state == STATE_READY) {
    currentMode = currentMode == "stock_remove" ? "stock_add" : "stock_remove";
    prefs.putString("mode", currentMode);
    renderReady();
    return;
  }

  if (state == STATE_MENU) {
    handleMenuSelect();
    return;
  }

  if (state == STATE_WIFI_ERROR) {
    if (connectWifi()) wakeToActive();
    else drawLines("WLAN Fehler", wifiSsid, "B1: erneut", "B2: Setup");
    return;
  }
}

void handleButton2() {
  noteActivity();

  if (state == STATE_READY) {
    openMenu(MENU_MAIN);
    return;
  }

  if (state == STATE_UNPAIRED) {
    startProvisioning();
    return;
  }

  if (state == STATE_WIFI_ERROR) {
    startProvisioning();
    return;
  }

  if (state == STATE_MENU) {
    menuIndex = (menuIndex + 1) % menuCountForCurrentPage();
    renderMenu();
    return;
  }
}

void pollButtons() {
  bool b1 = buttonDown(BUTTON1_PIN);
  bool b2 = buttonDown(BUTTON2_PIN);

  if (b1 && !button1WasDown) handleButton1();
  if (b2 && !button2WasDown) handleButton2();

  button1WasDown = b1;
  button2WasDown = b2;
}

void selectLocationItem(int index) {
  if (index == 0) {
    openMenu(MENU_MAIN);
    return;
  }

  if (index == 1) {
    selectedLocationId = 0;
    selectedLocationName = "Scanner-Default";
    saveConfig();
    state = STATE_READY;
    renderReady();
    return;
  }

  if (index >= 2 && index < 2 + locationCount) {
    LocationEntry &location = locations[index - 2];
    selectedLocationId = location.id;
    selectedLocationName = location.name;
    saveConfig();
    state = STATE_READY;
    renderReady();
    return;
  }

  showMessage("Lager", loadLocations() ? "Neu geladen" : "Fehler", "", 1200);
}

void handleMenuSelect() {
  if (menuPage == MENU_MAIN) {
    if (menuIndex == 0) {
      openMenu(MENU_LOCATION);
      return;
    }
    if (menuIndex == 1) {
      openMenu(MENU_MODE);
      return;
    }
    if (menuIndex == 2) {
      openMenu(MENU_SYNC);
      return;
    }
    if (menuIndex == 3) {
      openMenu(MENU_CONNECTION);
      return;
    }
    if (menuIndex == 4) {
      openMenu(MENU_ENERGY);
      return;
    }
    if (menuIndex == 5) {
      openMenu(MENU_PAIRING);
      return;
    }
    if (menuIndex == 6) {
      openMenu(MENU_INFO);
      return;
    }
    state = STATE_READY;
    renderReady();
    return;
  }

  if (menuPage == MENU_LOCATION) {
    selectLocationItem(menuIndex);
    return;
  }

  if (menuPage == MENU_MODE) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    currentMode = menuIndex == 2 ? "stock_remove" : "stock_add";
    saveConfig();
    state = STATE_READY;
    renderReady();
    return;
  }

  if (menuPage == MENU_SYNC) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    if (menuIndex == 1) {
      showMessage("Lager", loadLocations() ? "Neu geladen" : "Fehler", "", 1200);
      return;
    }
    if (menuIndex == 2) {
      showMessage("API", checkApi() ? "OK" : "Fehler", "", 1200);
      return;
    }
  }

  if (menuPage == MENU_CONNECTION) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    if (menuIndex == 1) {
      showMessage("WLAN", WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "getrennt", "", 1600);
      return;
    }
    if (menuIndex == 2) {
      showMessage("API", checkApi() ? "OK" : "Fehler", "", 1600);
      return;
    }
    if (menuIndex == 3) {
      startProvisioning();
      return;
    }
    if (menuIndex == 4 && waitConfirm("WLAN vergessen?")) {
      forgetWifi();
      saveConfig();
      ESP.restart();
    }
    renderMenu();
    return;
  }

  if (menuPage == MENU_ENERGY) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    if (menuIndex == 1) {
      scannerPower(false);
      showMessage("Scanner", "Aus", "", 1000);
      return;
    }
    if (menuIndex == 2) {
      enterIdleSleep();
      return;
    }
    if (menuIndex == 3) {
      idleTimeoutMs = 30000;
      saveConfig();
      showMessage("Timeout", "30s", "", 1000);
      return;
    }
    if (menuIndex == 4) {
      idleTimeoutMs = 60000;
      saveConfig();
      showMessage("Timeout", "60s", "", 1000);
      return;
    }
  }

  if (menuPage == MENU_PAIRING) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    if (menuIndex == 1) {
      forgetPairing();
      saveConfig();
      state = STATE_UNPAIRED;
      scannerPower(true);
      renderUnpaired();
      return;
    }
    if (menuIndex == 2 && waitConfirm("Haushalt vergessen?")) {
      forgetPairing();
      saveConfig();
      state = STATE_UNPAIRED;
      scannerPower(true);
      renderUnpaired();
      return;
    }
    renderMenu();
    return;
  }

  if (menuPage == MENU_INFO) {
    if (menuIndex == 0) {
      openMenu(MENU_MAIN);
      return;
    }
    if (menuIndex == 1) {
      showMessage("Geraet", deviceName, selectedLocationName, 2200);
      return;
    }
    if (menuIndex == 2) {
      showMessage("Firmware", FIRMWARE_VERSION, apiBase, 2200);
      return;
    }
    if (menuIndex == 3) {
      showMessage("Pins", "RX26 TX27 PWR32", "B1 35 B2 0", 2200);
      return;
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON1_PIN, INPUT);
  pinMode(BUTTON2_PIN, INPUT_PULLUP);
  pinMode(SCANNER_POWER_PIN, OUTPUT);
  pinMode(TFT_BACKLIGHT_PIN, OUTPUT);
  syncButtonState();
  scannerPower(false);
  displayBacklight(true);

  Serial2.begin(SCANNER_BAUD, SERIAL_8N1, SCANNER_RX_PIN, SCANNER_TX_PIN);

  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  tft.setTextFont(2);

  prefs.begin("nomnom", false);
  loadConfig();
  noteActivity();

  drawLines("nomnomstock", "Boot...");

  if (!wifiSsid.length()) {
    startProvisioning();
    return;
  }

  if (!connectWifi()) {
    state = STATE_WIFI_ERROR;
    drawLines("WLAN Fehler", wifiSsid, "B1: erneut", "B2: Setup");
    return;
  }

  if (!apiBase.length() || !checkApi()) {
    state = STATE_WIFI_ERROR;
    drawLines("API Fehler", apiBase, "B2: Setup");
    return;
  }

  if (!token.length()) {
    state = STATE_UNPAIRED;
    scannerPower(true);
    renderUnpaired();
    return;
  }

  loadLocations();
  state = STATE_READY;
  scannerPower(true);
  renderReady();
}

void loop() {
  if (state == STATE_WIFI_SETUP) {
    dnsServer.processNextRequest();
    setupServer.handleClient();
    if (millis() - setupStartedMs > SETUP_PORTAL_TIMEOUT_MS) {
      ESP.restart();
    }
    delay(2);
    return;
  }

  pollButtons();
  pollScanner();

  if (state == STATE_MESSAGE && millis() > messageUntilMs) {
    if (token.length() && wifiConnected) {
      state = STATE_READY;
      renderReady();
    } else if (wifiConnected) {
      state = STATE_UNPAIRED;
      renderUnpaired();
    } else {
      state = STATE_WIFI_ERROR;
      drawLines("WLAN Fehler", wifiSsid, "B1: erneut", "B2: Setup");
    }
  }

  if (state != STATE_WIFI_ERROR && state != STATE_WIFI_SETUP && millis() - lastActivityMs > idleTimeoutMs) {
    enterIdleSleep();
  }

  delay(10);
}
