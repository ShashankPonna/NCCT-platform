// ============================================================================
// NCCT Kiosk Terminal — ESP32 Controller Firmware
// RC522 (card UID) + SSD1306 OLED + buzzer + capture button
//
// This is the "combined terminal" firmware described in DECISIONS.md #33.
// It is PURE I/O: it never decides whether a card is known or a face
// matched. It only reports events (card tapped, button pressed) up to the
// browser, and shows whatever verdict the browser sends back. The browser
// is "the brain" (it's the only part that can run @vladmandic/human);
// this board just taps a card, shows a name, waits for a button, and
// displays OK / FAIL / DUP / an error.
//
// Wiring (identical to the already-tested hardware_test.ino — do not
// change these without re-running that wiring test):
//   RC522   RST -> GPIO4   SDA/SS -> GPIO5   SPI: default (SCK18 MISO19 MOSI23)
//   OLED    SSD1306 128x64, I2C, address 0x3C (Adafruit default I2C pins)
//   Buzzer  GPIO14
//   Button  GPIO13, to GND, using the ESP32's internal pull-up (no resistor)
//
// Libraries needed (same as hardware_test.ino):
//   MFRC522 (GithubCommunity) | Adafruit SSD1306 | Adafruit GFX
//
// Wire protocol (DECISIONS.md #33) — newline-terminated ASCII, 115200 baud:
//   UP   (device -> browser): UID:<hex>   BTN:CAPTURE   STATE:<name>
//   DOWN (browser -> device): NAME:<full name>   UNKNOWN   OK   FAIL
//                             DUP   ERR:<text>   RESET
//   Unknown lines are ignored on both sides, so either side can grow
//   independently without a lockstep firmware/browser release.
// ============================================================================

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

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
// waiting on a browser that isn't answering (e.g. dev server down).
// ============================================================================
enum KioskState { IDLE, IDENTIFYING, WAITING_FOR_FACE, VERIFYING, RESULT_HOLD };
KioskState state = IDLE;
unsigned long stateEnteredAt = 0;

// These two are NOT free-choice UX numbers — they are bounded by what the
// browser half actually takes, and a board that gives up first is worse than
// a slow one: it shows "no response" and drops to IDLE while the browser is
// still working, so a verdict that arrives afterwards lands in a state that
// ignores it. The student then reads an error for a check-in that WAS
// recorded. Keep both at or above the browser's own worst case:
//
//   IDENTIFY: one GET /api/kiosk/nfc-lookup/:uid, which fans out to four
//   Supabase queries and may hit a cold Render instance — 5s was observed to
//   be tight enough to matter, so this stays at the previously-bench-tested
//   8s.
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
// re-presented, so in the normal flow this never fires. Kept from the
// bench-tested sketch anyway — it costs nothing (we are never in IDLE during
// the window it covers) and it bounds the damage if a reader ever does
// report the same tap twice before the state change lands.
const unsigned long CARD_COOLDOWN_MS = 1500;

String traineeName = "";
unsigned long lastCardAt = 0;

// ---- Move to a new state and announce it up the serial link ----
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
// OLED helper — same call shape as hardware_test.ino's showMessage(), with
// one optional third line for longer messages (e.g. error text).
// ============================================================================
void showMessage(String line1, String line2 = "", String line3 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 12);
  display.println(line1);
  if (line2 != "") { display.setCursor(0, 30); display.println(line2); }
  if (line3 != "") { display.setCursor(0, 48); display.println(line3); }
  display.display();
}

// ============================================================================
// Non-blocking buzzer. A "beep pattern" is just a list of (duration, on/off)
// steps; updateBeep() advances through it using millis() so it never calls
// delay() — the RC522/serial/button polling in loop() never stalls for it.
// These exact durations aren't specified anywhere in your docs, so treat
// them as defaults you can retune by ear, not a fixed spec.
// ============================================================================
// Each pattern is just a list of durations (ms). The buzzer always starts
// ON and alternates: step 0 = on, step 1 = off, step 2 = on, ... so no
// separate on/off flag (and no custom struct type) is needed at all.
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
// Non-blocking, debounced button read. Returns true exactly once, on the
// confirmed press edge (HIGH -> LOW), not repeatedly while held down.
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
// Non-blocking serial line reader. Characters are appended to a buffer as
// they arrive; a complete line is handed to handleLine() only once '\n'
// shows up. This avoids Serial.readStringUntil(), which blocks.
// ============================================================================
String rxBuffer = "";

void readSerialLines() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;          // ignore CR, only LF ends a line
    if (c == '\n') {
      handleLine(rxBuffer);
      rxBuffer = "";
    } else {
      rxBuffer += c;
      if (rxBuffer.length() > 200) rxBuffer = ""; // guard against a stuck/garbage line
    }
  }
}

// ---- What to do with one complete line from the browser ----
void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  // RESET works from ANY state — the browser's own "cancel" escape hatch.
  if (line == "RESET") {
    digitalWrite(BUZZER_PIN, LOW);
    beepStepIndex = -1;
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    showMessage("TAP YOUR CARD");
    goTo(IDLE);
    return;
  }

  if (state == IDENTIFYING) {
    if (line.startsWith("NAME:")) {
      traineeName = line.substring(5);
      showMessage("Hi, " + traineeName, "Look at the camera", "then press the button");
      goTo(WAITING_FOR_FACE);
      return;
    }
    if (line == "UNKNOWN") {
      showMessage("Card not recognized", "Ask staff for help");
      beepError();
      goTo(RESULT_HOLD);
      return;
    }
    if (line.startsWith("ERR:")) {
      showMessage("Error", line.substring(4));
      beepError();
      goTo(RESULT_HOLD);
      return;
    }
    return; // anything else while identifying is ignored, not an error
  }

  if (state == VERIFYING) {
    if (line == "OK") {
      showMessage("Verified!", "Attendance marked");
      beepSuccess();
      goTo(RESULT_HOLD);
      return;
    }
    if (line == "FAIL") {
      showMessage("Not matched", "Ask staff for QR check-in");
      beepFail();
      goTo(RESULT_HOLD);
      return;
    }
    if (line == "DUP") {
      showMessage("Already checked in", "You're all set");
      beepDup();
      goTo(RESULT_HOLD);
      return;
    }
    if (line.startsWith("ERR:")) {
      showMessage("Error", line.substring(4));
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
// Per-state behaviour, called once per loop().
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

    Serial.print("UID:");
    Serial.println(uidStr);

    lastCardAt = millis();
    showMessage("Identifying...", "Please wait");
    goTo(IDENTIFYING);
  }
}

void handleIdentifying() {
  if (millis() - stateEnteredAt > IDENTIFY_TIMEOUT_MS) {
    showMessage("Check the kiosk PC", "No response - retry");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleWaitingForFace(bool pressedThisLoop) {
  if (pressedThisLoop) {
    Serial.println("BTN:CAPTURE");
    showMessage("Checking...", "Please hold still");
    goTo(VERIFYING);
    return;
  }
  if (millis() - stateEnteredAt > FACE_WINDOW_TIMEOUT_MS) {
    showMessage("Timed out", "Tap your card again");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleVerifying() {
  if (millis() - stateEnteredAt > VERIFY_TIMEOUT_MS) {
    showMessage("Check the kiosk PC", "No response - retry");
    beepError();
    goTo(RESULT_HOLD);
  }
}

void handleResultHold() {
  if (millis() - stateEnteredAt > RESULT_HOLD_MS) {
    showMessage("TAP YOUR CARD");
    goTo(IDLE);
  }
}

// ============================================================================
void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT_PULLUP); // internal pull-up — no external resistor
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  SPI.begin();     // RC522 uses the ESP32's default SPI pins (SCK18 MISO19 MOSI23)
  rfid.PCD_Init();

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("ERR:OLED not found - check wiring/address");
    while (true) { delay(1000); } // stop here so the problem is obvious, same as hardware_test.ino
  }

  // Prints the RC522's own firmware register. 0x00 or 0xFF means the reader
  // isn't actually talking over SPI — worth knowing before a card tap
  // silently does nothing. The browser ignores unknown lines, so these extra
  // diagnostic lines cost nothing on the wire.
  rfid.PCD_DumpVersionToSerial();

  Serial.println("READY"); // "firmware booted" marker; KioskTerminal.tsx filters it
  state = IDLE;
  stateEnteredAt = millis();
  Serial.println("STATE:IDLE");
  showMessage("TAP YOUR CARD");
}

void loop() {
  updateBeep();          // advance any in-progress beep pattern (non-blocking)
  readSerialLines();      // pull in any complete browser->device lines
  bool pressedThisLoop = buttonPressed(); // debounced button edge, checked every loop

  switch (state) {
    case IDLE:             handleIdle(); break;
    case IDENTIFYING:      handleIdentifying(); break;
    case WAITING_FOR_FACE:  handleWaitingForFace(pressedThisLoop); break;
    case VERIFYING:        handleVerifying(); break;
    case RESULT_HOLD:      handleResultHold(); break;
  }
}
