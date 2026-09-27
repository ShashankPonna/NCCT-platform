// ============================================================================
// NCCT Kiosk Terminal — ESP32 Controller Firmware (WIRELESS / WiFi build)
// RC522 (card UID) + SSD1306 OLED + buzzer + capture button
//
// This is the wireless, battery-powered revision of the "combined terminal"
// firmware from DECISIONS.md #33. The board previously talked to the browser
// over a USB serial cable; that cable is gone now (battery power via a
// 3.7V-to-5V boost converter into VIN), so the wire protocol moved to WiFi —
// the same approach ESP32-CAM/arduino/kiosk_capture_server already uses.
//
// It is still PURE I/O: it never decides whether a card is known or a face
// matched. It only reports events (card tapped, button pressed) up to the
// browser, and shows whatever verdict the browser sends back. The browser
// is "the brain" (it's the only part that can run @vladmandic/human); this
// board just taps a card, shows a name, waits for a button, and displays
// OK / FAIL / DUP / an error.
//
// Wiring (unchanged from the wired build / hardware_test.ino):
//   RC522   RST -> GPIO4   SDA/SS -> GPIO5   SPI: default (SCK18 MISO19 MOSI23)
//   OLED    SSD1306 128x64, I2C, address 0x3C (Adafruit default I2C pins)
//   Buzzer  GPIO14
//   Button  GPIO13, to GND, using the ESP32's internal pull-up (no resistor)
//   Power   3.7V LiPo -> boost converter (5V, >=1A) -> VIN + GND.
//           Do NOT feed the boost converter's output into the 3V3 pin —
//           that pin is the board's own regulated OUTPUT, not an input.
//           RC522/OLED still draw from the board's own 3V3 pin as before;
//           nothing about their wiring changes.
//
// Libraries needed: MFRC522 (GithubCommunity) | Adafruit SSD1306 |
//                    Adafruit GFX (its bundled Fonts/ are used for the big
//                    headlines) | WiFi + WebServer + ESPmDNS (all bundled
//                    with the ESP32 board package, nothing extra to install)
//
// Board settings (Arduino IDE): Tools -> Board -> "ESP32 Dev Module",
// default partition scheme (this sketch has no camera buffers, unlike
// ESP32-CAM, so it doesn't need the Huge APP scheme).
//
// Address: this board advertises itself via mDNS as
// http://ncct-kiosk-reader.local — the Kiosk Terminal's Reader field
// defaults to exactly this, so on most networks nothing needs to be typed
// in at all. Falls back to the raw numeric IP (shown on the OLED and
// printed to Serial at boot) only if mDNS is blocked on a given network.
//
// Wire protocol — plain HTTP, port 80, this board is the SERVER:
//   GET  /          -> plain-text liveness check ("NCCT kiosk reader alive")
//   GET  /events     -> browser polls this every ~300ms.
//                       Returns exactly one of:
//                         UID:<hex>     a card was tapped, not yet read again
//                         BTN:CAPTURE   the capture button was pressed
//                         NONE          nothing new since the last poll
//                       Read-once: once served, the event is cleared, so
//                       polling again immediately returns NONE.
//   POST /command    -> browser sends the verdict as a plain-text body,
//                       exactly the same vocabulary the old serial protocol
//                       used: NAME:<full name>  UNKNOWN  OK  FAIL  DUP
//                       ERR:<text>  RESET
//                       Unknown bodies are ignored, same as before, so
//                       either side can grow independently.
//
// USB is still connected to Serial.begin() purely for local debugging on
// the bench (RC522 version dump, WiFi status, state changes print there if
// you plug it into a computer) — it carries NO runtime protocol traffic
// anymore. Unplugged and running on battery, everything above still works;
// the Serial.print calls just go nowhere, which is harmless.
// ============================================================================

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Fonts/FreeSansBold9pt7b.h>   // ship with Adafruit GFX
#include <Fonts/FreeSansBold12pt7b.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

// ---- WiFi credentials ----
// Real values live in wifi_credentials.h, gitignored — never commit an
// actual WiFi password. Copy wifi_credentials.h.example to
// wifi_credentials.h (same folder) and fill it in before flashing.
#include "wifi_credentials.h"

// Left on DHCP (same as the ESP32-CAM sketch) rather than a hardcoded static
// IP, since the venue's WiFi details aren't known ahead of time — the actual
// numeric address can still change on every reboot (DHCP lease reassigned)
// or on a different network entirely, which used to mean re-reading it off
// the OLED and retyping it into the Kiosk Terminal every time.
//
// mDNS fixes that: this board advertises the fixed hostname below regardless
// of whatever numeric IP DHCP hands it, so "http://ncct-kiosk-reader.local"
// works on any network without ever needing to look up an address again —
// the Kiosk Terminal's Reader field defaults to exactly this hostname now.
// Requires the browser's OS to have mDNS/Bonjour support: built into macOS
// and Linux, and into Chrome/Edge on Windows too (they bundle their own
// mDNS resolution), so this works without any extra install on the machines
// this kiosk is actually built for. If mDNS is ever blocked on a given
// network (some locked-down corporate WiFi disables multicast), the OLED
// still prints the raw numeric IP at boot as a fallback — same as before.
//
// Change MDNS_HOSTNAME below (not just here) if you run more than one
// reader on the same network — two boards both claiming
// "ncct-kiosk-reader.local" is exactly the kind of collision mDNS can't
// resolve for you.
#define MDNS_HOSTNAME "ncct-kiosk-reader"

// If you DO want a fixed numeric address too, on a network you control, add
// a WiFi.config(local_IP, gateway, subnet) call right before WiFi.begin() —
// not required now that mDNS covers the same problem without per-network
// router configuration.

WebServer server(80);

// ---- Pins (matches the wiring table above / hardware_test.ino) ----
#define RST_PIN     4
#define SS_PIN      5
#define BUZZER_PIN  14
#define BUTTON_PIN  13

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C   // change to 0x3D if 0x3C doesn't work

MFRC522 rfid(SS_PIN, RST_PIN);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ============================================================================
// State machine: IDLE -> IDENTIFYING -> WAITING_FOR_FACE -> VERIFYING -> RESULT_HOLD -> IDLE
// Every state has its own timeout so the kiosk can never hang forever
// waiting on a browser that isn't answering (e.g. dev server down, or now
// also: WiFi dropped).
// ============================================================================
enum KioskState { IDLE, IDENTIFYING, WAITING_FOR_FACE, VERIFYING, RESULT_HOLD };

// What the OLED shows. Separate from KioskState because one state can show
// several screens (RESULT_HOLD is OK, DUP, FAIL or a warning). See setScreen().
enum ScreenKind { SCR_SPLASH, SCR_WIFI, SCR_IDLE, SCR_BUSY, SCR_FACE, SCR_SCAN,
                  SCR_OK, SCR_DUP, SCR_FAIL, SCR_WARN };
KioskState state = IDLE;
unsigned long stateEnteredAt = 0;

// These two are NOT free-choice UX numbers — they are bounded by what the
// browser half actually takes, and a board that gives up first is worse than
// a slow one: it shows "no response" and drops to IDLE while the browser is
// still working, so a verdict that arrives afterwards lands in a state that
// ignores it. The student then reads an error for a check-in that WAS
// recorded. Keep both at or above the browser's own worst case, PLUS the
// polling interval now adds up to ~300ms of extra one-way latency each
// direction versus the old instant serial write — not worth widening these
// for, but worth knowing about if you ever see a timeout that used to just
// barely pass on the wired build.
//
//   IDENTIFY: one GET /api/kiosk/nfc-lookup/:uid, which fans out to four
//   Supabase queries and may hit a cold Render instance — 8s bench-tested.
//
//   VERIFY: kioskCapture.ts's MAX_CAPTURE_ATTEMPTS (2) x CAMERA_TIMEOUT_MS
//   (20s) = 40s of camera alone in the worst case, plus Human's detect pass
//   and the check-in round trip (~10s together). See VERIFY_BUDGET_MS in
//   apps/web/src/kioskCapture.ts — change these two together or not at all.
const unsigned long IDENTIFY_TIMEOUT_MS    = 8000;   // waiting for NAME:/UNKNOWN after a tap
const unsigned long FACE_WINDOW_TIMEOUT_MS = 20000;  // waiting for the button to be pressed
const unsigned long VERIFY_TIMEOUT_MS      = 55000;  // waiting for OK/FAIL/DUP/ERR
const unsigned long RESULT_HOLD_MS         = 2500;   // how long a result stays on screen

// Belt-and-braces against one physical tap being read twice: the `state !=
// IDLE` transition below is the real guard, and PICC_HaltA() means a card
// left on the reader won't answer REQA again until it is lifted and
// re-presented, so in the normal flow this never fires. Kept anyway — it
// costs nothing and bounds the damage if a reader ever reports one tap twice.
const unsigned long CARD_COOLDOWN_MS = 1500;

String traineeName = "";
unsigned long lastCardAt = 0;

// ---- Pending event mailbox for GET /events (read-once — see protocol doc
// above). Only one event is ever outstanding at a time in practice, because
// the state machine gates when a tap vs. a button press can happen. ----
String pendingEvent = "";
void queueEvent(const String& evt) { pendingEvent = evt; }

// ---- Move to a new state. STATE: prints are debug-only now (Serial, not
// the wire protocol) — the browser never reads them over HTTP. ----
void goTo(KioskState newState) {
  state = newState;
  stateEnteredAt = millis();
  switch (state) {
    case IDLE:             Serial.println("STATE:IDLE"); break;
    case IDENTIFYING:      Serial.println("STATE:IDENTIFYING"); break;
    case WAITING_FOR_FACE: Serial.println("STATE:WAITING_FOR_FACE"); break;
    case VERIFYING:        Serial.println("STATE:VERIFYING"); break;
    case RESULT_HOLD:      Serial.println("STATE:RESULT_HOLD"); break;
  }
}

// ============================================================================
// OLED screens. Headlines use FreeSansBold (readable at arm's length and on
// camera); details use the small built-in font. A screen is fully described
// by (kind, title, detail, ms since shown), so loop() redraws it every frame
// to animate it, and setScreen() draws the first frame immediately.
//
// Drawing is display-only: nothing here reads or changes KioskState, so the
// state machine and wire protocol above/below are untouched by it.
// ============================================================================
ScreenKind screenKind = SCR_SPLASH;
String screenTitle = "";
String screenDetail = "";
unsigned long screenShownAt = 0;
bool screenSettled = false;   // result screens stop redrawing once their animation ends
unsigned long lastFrameAt = 0;

// A full-frame I2C push takes ~23ms at 400kHz and blocks, so ~25fps is the
// ceiling that still leaves loop() free to answer /events polls promptly.
const unsigned long FRAME_MS = 40;
const unsigned long RESULT_ANIM_MS = 600;  // icon pop + stroke, then static
const int SMALL_CHARS = 21;                // built-in font: 128px / 6px per char

float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
float easeOut(float t) { t = 1 - clamp01(t); return 1 - t * t * t; }
float easeOutBack(float t) {  // overshoots slightly, then settles: the "pop"
  t = clamp01(t) - 1;
  return 1 + 2.70158f * t * t * t + 1.70158f * t * t;
}
// 0 -> 1 -> 0 once per period, for things that sweep back and forth.
float pingPong(unsigned long t, unsigned long period) {
  float p = (float)(t % period) / period;
  return p < 0.5f ? p * 2 : 2 - p * 2;
}

String clip(const String& s, int maxChars) {
  return (int)s.length() <= maxChars ? s : s.substring(0, maxChars - 1) + ".";
}

// Splits a detail message over two small lines at a word boundary.
void wrapTwo(const String& s, String& first, String& second) {
  first = s;
  second = "";
  if ((int)s.length() <= SMALL_CHARS) return;
  const char* c = s.c_str();
  int cut = SMALL_CHARS;
  while (cut > 0 && c[cut] != ' ') cut--;
  if (cut == 0) cut = SMALL_CHARS;
  first = s.substring(0, cut);
  second = clip(s.substring(c[cut] == ' ' ? cut + 1 : cut), SMALL_CHARS);
}

// Draws text with its top edge at `top`, centered in [x0, x0 + w). Custom
// fonts position by baseline, so the bounds offset is what lets one helper
// top-align both kinds of font. font == NULL is the built-in 6x8 font.
void drawTextTop(const String& s, int x0, int w, int top, const GFXfont* font) {
  int16_t bx, by;
  uint16_t bw, bh;
  display.setFont(font);
  display.getTextBounds(s.c_str(), 0, 0, &bx, &by, &bw, &bh);
  display.setCursor(x0 + (w - (int)bw) / 2 - bx, top - by);
  display.print(s);
  display.setFont(NULL);
}

// Largest headline font that fits: 12pt, then 9pt, then built-in.
const GFXfont* fitFont(const String& s, int maxWidth, bool allowLarge) {
  const GFXfont* sizes[] = { &FreeSansBold12pt7b, &FreeSansBold9pt7b };
  for (int i = allowLarge ? 0 : 1; i < 2; i++) {
    int16_t bx, by;
    uint16_t bw, bh;
    display.setFont(sizes[i]);
    display.getTextBounds(s.c_str(), 0, 0, &bx, &by, &bw, &bh);
    display.setFont(NULL);
    if ((int)bw <= maxWidth) return sizes[i];
  }
  return NULL;
}

// A 3px-thick stroke, so ticks and crosses read from a distance.
void thickLine(int x0, int y0, int x1, int y1, uint16_t color) {
  for (int d = -1; d <= 1; d++) display.drawLine(x0, y0 + d, x1, y1 + d, color);
}

// Draws the first `progress` (0..1) of a polyline so a tick "writes itself".
// pts is flat x,y pairs designed around a radius-13 icon; `scale` resizes it.
void strokePath(const int8_t* pts, int n, float progress, int cx, int cy, float scale, uint16_t color) {
  float total = 0;
  for (int i = 1; i < n; i++) total += hypotf(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  float left = total * clamp01(progress);
  for (int i = 1; i < n && left > 0; i++) {
    float x0 = pts[2 * i - 2], y0 = pts[2 * i - 1];
    float dx = pts[2 * i] - x0, dy = pts[2 * i + 1] - y0;
    float len = hypotf(dx, dy);
    float f = left >= len ? 1 : left / len;
    thickLine(cx + roundf(x0 * scale), cy + roundf(y0 * scale),
              cx + roundf((x0 + dx * f) * scale), cy + roundf((y0 + dy * f) * scale), color);
    left -= len;
  }
}

const int8_t TICK[] = { -7, 0, -2, 5, 7, -5 };
const int8_t CROSS_A[] = { -6, -6, 6, 6 };
const int8_t CROSS_B[] = { 6, -6, -6, 6 };

void drawResultIcon(int cx, int cy, int r, unsigned long t) {
  int rr = (int)(r * easeOutBack(t / 220.0f));
  float stroke = clamp01(((float)t - 200) / 300);
  float scale = r / 13.0f;
  switch (screenKind) {
    case SCR_OK:    // filled disc with the tick knocked out of it
      display.fillCircle(cx, cy, rr, SSD1306_WHITE);
      strokePath(TICK, 3, stroke, cx, cy, scale, SSD1306_BLACK);
      break;
    case SCR_DUP:   // same tick, outlined: fine, but calmer than a fresh check-in
      display.drawCircle(cx, cy, rr, SSD1306_WHITE);
      display.drawCircle(cx, cy, rr - 1, SSD1306_WHITE);
      strokePath(TICK, 3, stroke, cx, cy, scale, SSD1306_WHITE);
      break;
    case SCR_FAIL:
      display.drawCircle(cx, cy, rr, SSD1306_WHITE);
      display.drawCircle(cx, cy, rr - 1, SSD1306_WHITE);
      strokePath(CROSS_A, 2, stroke * 2, cx, cy, scale, SSD1306_WHITE);
      strokePath(CROSS_B, 2, stroke * 2 - 1, cx, cy, scale, SSD1306_WHITE);
      break;
    default: {      // SCR_WARN: triangle with "!"
      int base = rr * 4 / 5;
      display.drawTriangle(cx, cy - rr, cx - rr, cy + base, cx + rr, cy + base, SSD1306_WHITE);
      display.drawTriangle(cx, cy - rr + 2, cx - rr + 2, cy + base - 1, cx + rr - 2, cy + base - 1, SSD1306_WHITE);
      if (t >= 200) {
        display.fillRect(cx - 1, cy - r / 3, 3, r / 2, SSD1306_WHITE);
        display.fillRect(cx - 1, cy + r / 3 + 1, 3, 2, SSD1306_WHITE);
      }
      break;
    }
  }
}

void drawResult(unsigned long t) {
  String line1, line2;
  wrapTwo(screenDetail, line1, line2);
  bool compact = line2.length() > 0;  // two detail lines: shrink icon + title to fit
  drawResultIcon(64, compact ? 12 : 15, compact ? 10 : 13, t);
  int rise = (int)((1 - easeOut(t / 300.0f)) * 6);
  drawTextTop(screenTitle, 0, 128, (compact ? 26 : 32) + rise, fitFont(screenTitle, 124, !compact));
  drawTextTop(line1, 0, 128, compact ? 45 : 56, NULL);
  if (compact) drawTextTop(line2, 0, 128, 55, NULL);
  if (t >= RESULT_ANIM_MS) screenSettled = true;
}

void drawSplash(unsigned long t) {
  int rise = (int)((1 - easeOut(t / 400.0f)) * 12);
  drawTextTop("EduDisha", 0, 128, 10 + rise, &FreeSansBold12pt7b);
  int w = (int)(96 * easeOut(((float)t - 200) / 500));
  display.fillRect(64 - w / 2, 33, w, 2, SSD1306_WHITE);
  drawTextTop("Attendance Kiosk", 0, 128, 44, NULL);
}

void drawWifi(unsigned long t) {
  display.fillCircle(64, 28, 2, SSD1306_WHITE);
  int arcs = (t / 300) % 4;  // 0..3 arcs light up in turn
  for (int i = 1; i <= arcs; i++) {
    display.drawCircleHelper(64, 28, i * 6, 0x1 | 0x2, SSD1306_WHITE);
    display.drawCircleHelper(64, 28, i * 6 + 1, 0x1 | 0x2, SSD1306_WHITE);
  }
  drawTextTop(screenTitle, 0, 128, 34, fitFont(screenTitle, 124, true));
  drawTextTop(clip(screenDetail, SMALL_CHARS), 0, 128, 56, NULL);
}

void drawIdle(unsigned long t) {
  // Card on the left, NFC waves pulsing out of it one ring at a time.
  display.drawRoundRect(6, 10, 24, 36, 3, SSD1306_WHITE);
  display.fillRoundRect(11, 16, 9, 7, 1, SSD1306_WHITE);  // chip
  display.drawFastHLine(11, 36, 14, SSD1306_WHITE);
  display.drawFastHLine(11, 40, 9, SSD1306_WHITE);
  int rings = (t / 300) % 4;
  for (int i = 1; i <= rings; i++) {
    display.drawCircleHelper(33, 28, i * 5, 0x2 | 0x4, SSD1306_WHITE);
    display.drawCircleHelper(33, 28, i * 5 + 1, 0x2 | 0x4, SSD1306_WHITE);
  }
  drawTextTop("TAP", 50, 78, 6, &FreeSansBold12pt7b);
  drawTextTop("CARD", 50, 78, 28, &FreeSansBold12pt7b);
  drawTextTop("EduDisha Attendance", 0, 128, 56, NULL);
}

void drawBusy(unsigned long t) {
  // Eight-dot spinner: a leading dot with a shrinking tail behind it.
  int head = (t / 90) % 8;
  for (int i = 0; i < 8; i++) {
    float a = i * 0.785398f;  // 45 degrees
    int x = 64 + (int)roundf(11 * cosf(a));
    int y = 16 + (int)roundf(11 * sinf(a));
    int behind = (head - i + 8) % 8;
    if (behind < 3) display.fillCircle(x, y, 3 - behind, SSD1306_WHITE);
    else display.drawPixel(x, y, SSD1306_WHITE);
  }
  drawTextTop(screenTitle, 0, 128, 34, fitFont(screenTitle, 124, true));
  drawTextTop(clip(screenDetail, SMALL_CHARS), 0, 128, 56, NULL);
}

void drawFace(unsigned long t) {
  // Name banner, inverted so it reads as a header.
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  drawTextTop(clip("Hi, " + screenTitle, SMALL_CHARS), 0, 128, 2, NULL);
  display.setTextColor(SSD1306_WHITE);

  // The two steps take turns, each sliding in from the right.
  const unsigned long STEP_MS = 1600;
  bool lookStep = (t / STEP_MS) % 2 == 0;
  int slide = (int)((1 - easeOut((t % STEP_MS) / 250.0f)) * 128);
  drawTextTop(lookStep ? "LOOK AT" : "PRESS", slide, 128, 16, &FreeSansBold12pt7b);
  drawTextTop(lookStep ? "CAMERA" : "BUTTON", slide, 128, 36, &FreeSansBold12pt7b);

  // Time left to press the button before FACE_WINDOW_TIMEOUT_MS.
  float left = 1 - clamp01((float)t / FACE_WINDOW_TIMEOUT_MS);
  display.drawRect(0, 58, 128, 6, SSD1306_WHITE);
  display.fillRect(2, 60, (int)(124 * left), 2, SSD1306_WHITE);
}

void drawScan(unsigned long t) {
  // Face inside viewfinder corners, with a scan line sweeping over it.
  display.drawCircle(64, 19, 12, SSD1306_WHITE);
  display.fillCircle(60, 16, 1, SSD1306_WHITE);
  display.fillCircle(68, 16, 1, SSD1306_WHITE);
  display.drawCircleHelper(64, 20, 6, 0x4 | 0x8, SSD1306_WHITE);
  const int L = 46, R = 82, T = 2, B = 36, C = 7;
  display.drawFastHLine(L, T, C, SSD1306_WHITE);         display.drawFastVLine(L, T, C, SSD1306_WHITE);
  display.drawFastHLine(R - C + 1, T, C, SSD1306_WHITE); display.drawFastVLine(R, T, C, SSD1306_WHITE);
  display.drawFastHLine(L, B, C, SSD1306_WHITE);         display.drawFastVLine(L, B - C + 1, C, SSD1306_WHITE);
  display.drawFastHLine(R - C + 1, B, C, SSD1306_WHITE); display.drawFastVLine(R, B - C + 1, C, SSD1306_WHITE);
  int y = T + 3 + (int)(pingPong(t, 1400) * (B - T - 6));
  display.drawFastHLine(L + 2, y, R - L - 3, SSD1306_WHITE);
  drawTextTop(screenTitle, 0, 128, 41, fitFont(screenTitle, 124, true));
}

void drawScreen() {
  unsigned long t = millis() - screenShownAt;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  switch (screenKind) {
    case SCR_SPLASH: drawSplash(t); break;
    case SCR_WIFI:   drawWifi(t); break;
    case SCR_IDLE:   drawIdle(t); break;
    case SCR_BUSY:   drawBusy(t); break;
    case SCR_FACE:   drawFace(t); break;
    case SCR_SCAN:   drawScan(t); break;
    default:         drawResult(t); break;  // SCR_OK / SCR_DUP / SCR_FAIL / SCR_WARN
  }
  display.display();
  lastFrameAt = millis();
}

void setScreen(ScreenKind kind, const String& title = "", const String& detail = "") {
  screenKind = kind;
  screenTitle = title;
  screenDetail = detail;
  screenShownAt = millis();
  screenSettled = false;
  drawScreen();
}

// Called every loop(): advances the current screen's animation.
void updateDisplay() {
  if (screenSettled || millis() - lastFrameAt < FRAME_MS) return;
  drawScreen();
}

// ============================================================================
// Non-blocking buzzer — unchanged from the wired build.
// ============================================================================
const int BEEP_PATTERN_MAX = 4;
unsigned long beepPattern[BEEP_PATTERN_MAX];
int beepPatternLen = 0;
int beepStepIndex = -1;           // -1 = buzzer idle, nothing playing
unsigned long beepStepStartedAt = 0;

void startBeep(const unsigned long* durations, int count) {
  if (count > BEEP_PATTERN_MAX) count = BEEP_PATTERN_MAX;
  for (int i = 0; i < count; i++) beepPattern[i] = durations[i];
  beepPatternLen = count;
  beepStepIndex = 0;
  beepStepStartedAt = millis();
  digitalWrite(BUZZER_PIN, HIGH); // step 0 is always "on"
}

void updateBeep() {
  if (beepStepIndex < 0) return;
  if (millis() - beepStepStartedAt >= beepPattern[beepStepIndex]) {
    beepStepIndex++;
    if (beepStepIndex >= beepPatternLen) {
      digitalWrite(BUZZER_PIN, LOW);
      beepStepIndex = -1;
      return;
    }
    beepStepStartedAt = millis();
    digitalWrite(BUZZER_PIN, (beepStepIndex % 2 == 0) ? HIGH : LOW);
  }
}

void beepSuccess() { unsigned long d[] = {150};           startBeep(d, 1); } // OK: one short beep
void beepFail()    { unsigned long d[] = {150, 100, 150}; startBeep(d, 3); } // FAIL: two short beeps
void beepError()   { unsigned long d[] = {400};            startBeep(d, 1); } // UNKNOWN/ERR/timeout: one long beep
void beepDup()     { unsigned long d[] = {80};             startBeep(d, 1); } // DUP: one soft beep (it's a calm "you're fine", not a failure)

// ============================================================================
// Non-blocking, debounced button read — unchanged from the wired build.
// ============================================================================
int buttonStableState  = HIGH;
int buttonLastReading   = HIGH;
unsigned long buttonLastChangeAt = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 30;

bool buttonPressed() {
  int reading = digitalRead(BUTTON_PIN);
  if (reading != buttonLastReading) {
    buttonLastChangeAt = millis();
  }
  buttonLastReading = reading;

  if ((millis() - buttonLastChangeAt) > BUTTON_DEBOUNCE_MS) {
    if (reading != buttonStableState) {
      buttonStableState = reading;
      if (buttonStableState == LOW) return true; // this is the actual press edge
    }
  }
  return false;
}

// ============================================================================
// What to do with one complete command from the browser. Identical logic to
// the wired build — only the caller changed (HTTP POST body instead of a
// terminated serial line).
// ============================================================================
void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  // RESET works from ANY state — the browser's own "cancel" escape hatch.
  if (line == "RESET") {
    digitalWrite(BUZZER_PIN, LOW);
    beepStepIndex = -1;
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    setScreen(SCR_IDLE);
    goTo(IDLE);
    return;
  }

  if (state == IDENTIFYING) {
    if (line.startsWith("NAME:")) {
      traineeName = line.substring(5);
      setScreen(SCR_FACE, traineeName);
      goTo(WAITING_FOR_FACE);
      return;
    }
    if (line == "UNKNOWN") {
      setScreen(SCR_WARN, "UNKNOWN", "Card not recognized. Ask staff for help");
      beepError();
      goTo(RESULT_HOLD);
      return;
    }
    if (line.startsWith("ERR:")) {
      setScreen(SCR_WARN, "ERROR", line.substring(4));
      beepError();
      goTo(RESULT_HOLD);
      return;
    }
    return; // anything else while identifying is ignored, not an error
  }

  if (state == VERIFYING) {
    if (line == "OK") {
      setScreen(SCR_OK, "VERIFIED", "Attendance marked");
      beepSuccess();
      goTo(RESULT_HOLD);
      return;
    }
    if (line == "FAIL") {
      setScreen(SCR_FAIL, "NO MATCH", "Ask staff for QR check-in");
      beepFail();
      goTo(RESULT_HOLD);
      return;
    }
    if (line == "DUP") {
      setScreen(SCR_DUP, "ALL SET", "Already checked in");
      beepDup();
      goTo(RESULT_HOLD);
      return;
    }
    if (line.startsWith("ERR:")) {
      setScreen(SCR_WARN, "ERROR", line.substring(4));
      beepError();
      goTo(RESULT_HOLD);
      return;
    }
    return;
  }

  // Line arrived in IDLE / WAITING_FOR_FACE / RESULT_HOLD — not expected
  // there, so it's ignored rather than treated as an error (per protocol).
}

// ============================================================================
// HTTP handlers. Kept deliberately tiny: parse nothing beyond what's needed,
// same "no JSON library needed" simplicity the old plain-text serial
// protocol had. CORS is required because the browser (http://localhost)
// and this board (http://<reader-ip>) are different origins.
// ============================================================================
void sendCommonHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Connection", "close");
  server.sendHeader("Cache-Control", "no-store");
}

void handleRootRoute() {
  sendCommonHeaders();
  server.send(200, "text/plain", "NCCT kiosk reader alive");
}

void handleEventsRoute() {
  sendCommonHeaders();
  if (pendingEvent.length() > 0) {
    server.send(200, "text/plain", pendingEvent);
    pendingEvent = ""; // read-once: clear it now so the next poll gets NONE
  } else {
    server.send(200, "text/plain", "NONE");
  }
}

void handleCommandRoute() {
  sendCommonHeaders();
  // A POST body sent as fetch(url, { method: "POST", body: text }) arrives
  // as Content-Type text/plain, which WebServer exposes via the "plain" arg.
  String body = server.arg("plain");
  handleLine(body);
  server.send(200, "text/plain", "OK");
}

// ============================================================================
// Per-state behaviour, called once per loop(). Only handleIdle() and
// handleWaitingForFace() changed — they queue an event for GET /events to
// serve instead of writing it straight to Serial.
// ============================================================================
void handleIdle() {
  if (millis() - lastCardAt < CARD_COOLDOWN_MS) return;

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    // Same UID formatting as the tested hardware_test.ino — every byte MUST
    // be two zero-padded uppercase hex chars via sprintf("%02X"). Do NOT
    // switch this to String(byte, HEX): that drops leading zeros and a
    // card whose UID has any byte below 0x10 would never match again.
    char uidStr[21] = {0}; // up to 10 UID bytes -> 20 hex chars + null
    for (byte i = 0; i < rfid.uid.size; i++) {
      sprintf(&uidStr[i * 2], "%02X", rfid.uid.uidByte[i]);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1(); // free the reader now, not later — we may sit in
                             // other states for 20+ seconds before we're back
                             // in IDLE, and we don't want the card still
                             // "held" by the reader that whole time.

    queueEvent("UID:" + String(uidStr));

    lastCardAt = millis();
    setScreen(SCR_BUSY, "CHECKING", "Finding your record");
    goTo(IDENTIFYING);
  }
}

void handleIdentifying() {
  if (millis() - stateEnteredAt > IDENTIFY_TIMEOUT_MS) {
    setScreen(SCR_WARN, "NO REPLY", "Check the kiosk PC and retry");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleWaitingForFace(bool pressedThisLoop) {
  if (pressedThisLoop) {
    queueEvent("BTN:CAPTURE");
    setScreen(SCR_SCAN, "VERIFYING");
    goTo(VERIFYING);
    return;
  }
  if (millis() - stateEnteredAt > FACE_WINDOW_TIMEOUT_MS) {
    setScreen(SCR_WARN, "TIMED OUT", "Tap your card again");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleVerifying() {
  if (millis() - stateEnteredAt > VERIFY_TIMEOUT_MS) {
    setScreen(SCR_WARN, "NO REPLY", "Check the kiosk PC and retry");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleResultHold() {
  if (millis() - stateEnteredAt > RESULT_HOLD_MS) {
    setScreen(SCR_IDLE);
    goTo(IDLE);
  }
}

// ============================================================================
// WiFi connect, non-blocking-enough for setup(): this one blocking loop only
// runs once at boot, before the kiosk is in service, so it's fine for it to
// wait here (same as ESP32-CAM's own connect loop).
// ============================================================================
void connectWiFi() {
  setScreen(SCR_WIFI, "CONNECTING", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  // Latency matters more than battery life here: WiFi modem-sleep adds up
  // to ~100ms of delay to every request, which eats directly into the
  // IDENTIFY/VERIFY budgets above. Same trade-off ESP32-CAM already made.
  // If battery runtime becomes the bigger problem at your demo, this is the
  // first thing to flip back to true.
  WiFi.setSleep(false);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(FRAME_MS);
    drawScreen();  // keeps the WiFi icon animating while we wait
    Serial.print(".");
    if (millis() - startedAt > 20000) {
      // Didn't connect in 20s — keep retrying forever rather than giving up,
      // since a battery-powered board has no other way to signal the
      // problem than the OLED, which we update below on every retry.
      setScreen(SCR_WIFI, "NO WIFI", String("Retrying ") + ssid);
      startedAt = millis();
    }
  }

  Serial.println();
  Serial.print("WiFi connected. IP address: ");
  Serial.println(WiFi.localIP());

  // Re-started on every reconnect (loop() calls connectWiFi() again if WiFi
  // drops), not just once in setup() — mDNS.begin() must be re-issued after
  // any reconnect for the advertisement to keep working, same reasoning as
  // an mDNS responder needing to re-announce itself after any address
  // change. Non-fatal if it fails: the OLED below still shows the raw IP
  // either way, so the kiosk stays usable through it.
  if (MDNS.begin(MDNS_HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("mDNS ready: http://" MDNS_HOSTNAME ".local");
  } else {
    Serial.println("mDNS.begin() failed — use the numeric IP below instead");
  }

  setScreen(SCR_OK, "ONLINE", WiFi.localIP().toString());
  // Let the person setting up actually read the IP off the screen (~1.6s),
  // drawing frames meanwhile so the tick animation plays.
  for (int i = 0; i < 40; i++) { delay(FRAME_MS); drawScreen(); }
}

// ============================================================================
void setup() {
  Serial.begin(115200); // debug-only now — see the file header

  pinMode(BUTTON_PIN, INPUT_PULLUP); // internal pull-up — no external resistor
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  SPI.begin();     // RC522 uses the ESP32's default SPI pins (SCK18 MISO19 MOSI23)
  rfid.PCD_Init();

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("ERR:OLED not found - check wiring/address");
    while (true) { delay(1000); } // stop here so the problem is obvious
  }
  // The panel is physically mounted upside down in the enclosure — rotate
  // the whole framebuffer 180° in software rather than reflow the wiring.
  // Must come after begin() (it resets rotation) and before the first
  // showStatus() call, since every draw after this uses the rotated frame.
  display.setRotation(2);
  // Headlines slide in from off-screen; without this GFX would wrap them
  // onto the next line instead of clipping.
  display.setTextWrap(false);

  // Brief boot splash (~1.2s): fixed frame count, not a millis() wait.
  setScreen(SCR_SPLASH);
  for (int i = 0; i < 30; i++) { delay(FRAME_MS); drawScreen(); }

  // Prints the RC522's own firmware register. 0x00 or 0xFF means the reader
  // isn't actually talking over SPI — worth knowing before a card tap
  // silently does nothing.
  rfid.PCD_DumpVersionToSerial();

  connectWiFi();

  server.on("/", HTTP_GET, handleRootRoute);
  server.on("/events", HTTP_GET, handleEventsRoute);
  server.on("/command", HTTP_POST, handleCommandRoute);
  server.begin();
  Serial.println("READY"); // debug-only marker, same meaning as the wired build's

  state = IDLE;
  stateEnteredAt = millis();
  Serial.println("STATE:IDLE");
  setScreen(SCR_IDLE);
}

void loop() {
  // If WiFi drops mid-shift (weak signal, AP restart), say so on the OLED
  // rather than silently going deaf to /command while still looking normal.
  // The state machine's own timeouts (handleIdentifying/handleVerifying)
  // still apply underneath this and will eventually return to IDLE on their
  // own if a transaction was in flight when the drop happened.
  if (WiFi.status() != WL_CONNECTED) {
    setScreen(SCR_WIFI, "WIFI LOST", "Reconnecting...");
    connectWiFi();
    setScreen(SCR_IDLE);
    goTo(IDLE);
    return;
  }

  server.handleClient();  // serve any pending /events or /command request
  updateBeep();            // advance any in-progress beep pattern (non-blocking)
  updateDisplay();         // next animation frame, at most every FRAME_MS
  bool pressedThisLoop = buttonPressed(); // debounced button edge, checked every loop

  switch (state) {
    case IDLE:             handleIdle(); break;
    case IDENTIFYING:      handleIdentifying(); break;
    case WAITING_FOR_FACE:  handleWaitingForFace(pressedThisLoop); break;
    case VERIFYING:        handleVerifying(); break;
    case RESULT_HOLD:      handleResultHold(); break;
  }
}
