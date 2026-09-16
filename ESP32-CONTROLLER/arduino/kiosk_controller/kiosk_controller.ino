// NCCT attendance kiosk — ESP32 DevKit controller firmware.
//
// Drives the student-facing half of the kiosk: RC522 card reader, SSD1306
// OLED, buzzer and capture button. Talks to the browser over USB serial
// (Web Serial), which is what actually reaches the backend.
//
// This board never decides whether a face matched. It reports events up and
// renders whatever verdict comes back down — the match is recomputed
// server-side (CLAUDE.md: never trust a client-reported face-match result).
//
// ---------------------------------------------------------------------------
// SERIAL PROTOCOL — newline-terminated ASCII lines, 115200 baud, both ways.
//
//   ESP32  ->  browser
//     UID:040A2B9C     a card was tapped (uppercase, zero-padded hex)
//     BTN:CAPTURE      capture button pressed while waiting for a face
//     STATE:<name>     state changed (diagnostic; the browser may ignore it)
//
//   browser ->  ESP32
//     NAME:Asha Patil  card resolved to this trainee; show the name
//     UNKNOWN          card is not registered to anyone
//     OK               attendance recorded
//     FAIL             face did not match
//     DUP              already checked in for this session
//     ERR:<text>       something went wrong; text is shown on the OLED
//     RESET            abandon the transaction, return to idle
//
// Unknown lines are ignored rather than treated as errors, so the protocol
// can grow without breaking older firmware.
// ---------------------------------------------------------------------------
//
// Wiring (see docs/ and the published wiring guide):
//   RC522  SDA/SS -> GPIO5   SCK -> GPIO18   MOSI -> GPIO23
//          MISO   -> GPIO19  RST -> GPIO4    3.3V only, never 5V
//   OLED   SDA    -> GPIO21  SCL -> GPIO22   (ESP32 default I2C pins)
//   Buzzer +      -> GPIO14
//   Button        -> GPIO13 and GND (uses the internal pull-up)
//
// Board settings: Tools -> Board -> "ESP32 Dev Module", default partition.
//
// Libraries: MFRC522 (GithubCommunity), Adafruit SSD1306, Adafruit GFX.

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---- pins -----------------------------------------------------------------
#define RST_PIN     4
#define SS_PIN      5
#define BUZZER_PIN  14
#define BUTTON_PIN  13

// Status LEDs are optional — this kiosk uses the OLED instead, which says
// more than a coloured light can. Set these to real GPIOs if you fit them.
#define LED_GREEN   -1
#define LED_RED     -1
#define LED_YELLOW  -1

// ---- display --------------------------------------------------------------
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C   // some modules are 0x3D

MFRC522 rfid(SS_PIN, RST_PIN);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---- state machine --------------------------------------------------------
// Every wait is bounded. A student who taps and walks away must not leave the
// kiosk stuck for the next person.
enum State {
  IDLE,            // waiting for a card
  IDENTIFYING,     // UID sent, waiting for the browser to name the trainee
  READY_FOR_FACE,  // trainee known, waiting for the capture button
  VERIFYING,       // capture requested, waiting for a verdict
  RESULT           // showing PASS/FAIL/DUP, then auto-returns to IDLE
};

State state = IDLE;
unsigned long stateSince = 0;

const unsigned long IDENTIFY_TIMEOUT_MS = 8000;   // browser lookup
const unsigned long FACE_TIMEOUT_MS     = 30000;  // student positioning
const unsigned long VERIFY_TIMEOUT_MS   = 40000;  // capture + upload + match
const unsigned long RESULT_HOLD_MS      = 3500;   // how long a verdict shows
const unsigned long CARD_COOLDOWN_MS    = 1500;   // ignore re-reads of one tap

String traineeName = "";
unsigned long lastCardAt = 0;

// ---- non-blocking buzzer --------------------------------------------------
// A blocking delay() here would make the board deaf to incoming serial while
// it beeped, which is exactly when a verdict tends to arrive.
int  beepsLeft = 0;
bool beepOn = false;
unsigned long beepNextChange = 0;
unsigned int beepOnMs = 0, beepOffMs = 0;

void startBeeps(int count, unsigned int onMs, unsigned int offMs) {
  beepsLeft = count;
  beepOnMs = onMs;
  beepOffMs = offMs;
  beepOn = false;
  beepNextChange = 0; // fire immediately on the next service call
}

void serviceBuzzer() {
  if (beepsLeft <= 0 && !beepOn) return;
  if (millis() < beepNextChange) return;

  if (beepOn) {
    digitalWrite(BUZZER_PIN, LOW);
    beepOn = false;
    beepNextChange = millis() + beepOffMs;
    if (beepsLeft <= 0) return;
  } else {
    if (beepsLeft <= 0) return;
    digitalWrite(BUZZER_PIN, HIGH);
    beepOn = true;
    beepsLeft--;
    beepNextChange = millis() + beepOnMs;
  }
}

void setLed(int pin, bool on) {
  if (pin >= 0) digitalWrite(pin, on ? HIGH : LOW);
}

void setLeds(bool green, bool red, bool yellow) {
  setLed(LED_GREEN, green);
  setLed(LED_RED, red);
  setLed(LED_YELLOW, yellow);
}

// ---- display helpers ------------------------------------------------------
void showMessage(const String& line1, const String& line2 = "", int textSize = 1) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(textSize);
  display.setCursor(0, line2.length() ? 16 : 24);
  display.println(line1);
  if (line2.length()) {
    display.setTextSize(1);
    display.setCursor(0, 40);
    display.println(line2);
  }
  display.display();
}

// ---- state transitions ----------------------------------------------------
void enterState(State next) {
  state = next;
  stateSince = millis();

  switch (next) {
    case IDLE:
      traineeName = "";
      setLeds(false, false, false);
      showMessage("SCAN YOUR CARD");
      Serial.println("STATE:IDLE");
      break;

    case IDENTIFYING:
      setLeds(false, false, true);
      showMessage("Reading card", "please wait");
      Serial.println("STATE:IDENTIFYING");
      break;

    case READY_FOR_FACE:
      setLeds(false, false, true);
      // String(...) on both arms: a String/const char* ternary is ambiguous
      // for some Arduino core versions and fails to compile.
      showMessage(traineeName.length() ? traineeName : String("Look at camera"),
                  "Press the button");
      Serial.println("STATE:READY_FOR_FACE");
      break;

    case VERIFYING:
      setLeds(false, false, true);
      showMessage("Checking...", "hold still");
      Serial.println("STATE:VERIFYING");
      break;

    case RESULT:
      Serial.println("STATE:RESULT");
      break;
  }
}

// Shows a verdict, then RESULT_HOLD_MS later the main loop returns to IDLE.
void showResult(const String& line1, const String& line2,
                bool green, bool red, int beeps, unsigned int onMs) {
  setLeds(green, red, false);
  showMessage(line1, line2);
  startBeeps(beeps, onMs, 120);
  enterState(RESULT);
}

// ---- incoming serial commands ---------------------------------------------
void handleCommand(const String& line) {
  if (line.length() == 0) return;

  if (line == "RESET") {
    enterState(IDLE);
    return;
  }

  if (line.startsWith("NAME:")) {
    traineeName = line.substring(5);
    if (state == IDENTIFYING) enterState(READY_FOR_FACE);
    return;
  }

  // Verdicts only mean something while a transaction is actually in flight.
  // A stray OK arriving at idle would otherwise flash "ATTENDANCE marked" at
  // whoever happened to be standing there, having recorded nothing.
  bool inTransaction = (state == IDENTIFYING || state == VERIFYING);
  if (!inTransaction) return;

  if (line == "UNKNOWN") {
    showResult("Card not", "registered", false, true, 2, 400);
    return;
  }

  if (line == "OK") {
    showResult("ATTENDANCE", "marked - thank you", true, false, 1, 500);
    return;
  }

  if (line == "FAIL") {
    showResult("Not recognised", "please try again", false, true, 2, 300);
    return;
  }

  if (line == "DUP") {
    showResult("Already marked", "no action needed", true, false, 2, 120);
    return;
  }

  if (line.startsWith("ERR:")) {
    showResult("Error", line.substring(4), false, true, 3, 200);
    return;
  }

  // Unknown command — ignored on purpose so the protocol can grow.
}

void readSerial() {
  static String buffer = "";
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buffer.trim();
      handleCommand(buffer);
      buffer = "";
    } else if (c != '\r') {
      if (buffer.length() < 120) buffer += c; // bound it; drop overlong lines
    }
  }
}

// ---- card reading ---------------------------------------------------------
void readCard() {
  // Only a card tapped while genuinely idle starts a transaction. Taps during
  // an in-flight check-in are ignored rather than queued, so two students in
  // quick succession can't interleave into one another's attendance.
  if (state != IDLE) return;
  if (millis() - lastCardAt < CARD_COOLDOWN_MS) return;
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  // Two zero-padded uppercase hex chars per byte. String(b, HEX) would drop
  // the leading zero on any byte below 0x10, producing a UID the backend
  // could never match — it normalises case but cannot restore a lost digit.
  char uidStr[21] = {0}; // up to 10 UID bytes -> 20 chars + null
  for (byte i = 0; i < rfid.uid.size; i++) {
    sprintf(&uidStr[i * 2], "%02X", rfid.uid.uidByte[i]);
  }

  Serial.print("UID:");
  Serial.println(uidStr);

  lastCardAt = millis();
  startBeeps(1, 60, 0); // short acknowledging blip
  enterState(IDENTIFYING);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1(); // pairs with HaltA, or the next tap may not read
}

// ---- button ---------------------------------------------------------------
void readButton() {
  static bool lastStable = HIGH;      // INPUT_PULLUP: HIGH = released
  static bool lastRead = HIGH;
  static unsigned long lastChange = 0;

  bool now = digitalRead(BUTTON_PIN);
  if (now != lastRead) {
    lastRead = now;
    lastChange = millis();
    return;
  }
  if (millis() - lastChange < 30) return; // still bouncing
  if (now == lastStable) return;

  lastStable = now;
  if (now != LOW) return; // act on press, not release

  if (state == READY_FOR_FACE) {
    Serial.println("BTN:CAPTURE");
    enterState(VERIFYING);
  } else {
    // Pressed at the wrong moment (before a card, or mid-verification).
    // A short double blip says "not now" without changing state.
    startBeeps(2, 40, 60);
  }
}

// ---- timeouts -------------------------------------------------------------
void serviceTimeouts() {
  unsigned long elapsed = millis() - stateSince;

  switch (state) {
    case IDENTIFYING:
      if (elapsed > IDENTIFY_TIMEOUT_MS) {
        showResult("No response", "check the kiosk PC", false, true, 2, 300);
      }
      break;

    case READY_FOR_FACE:
      if (elapsed > FACE_TIMEOUT_MS) {
        showResult("Timed out", "tap your card again", false, true, 1, 400);
      }
      break;

    case VERIFYING:
      if (elapsed > VERIFY_TIMEOUT_MS) {
        showResult("No response", "please try again", false, true, 2, 300);
      }
      break;

    case RESULT:
      if (elapsed > RESULT_HOLD_MS) enterState(IDLE);
      break;

    case IDLE:
      break;
  }
}

// ---- setup / loop ---------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  for (int pin : {LED_GREEN, LED_RED, LED_YELLOW}) {
    if (pin >= 0) {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
    }
  }

  SPI.begin(); // VSPI defaults: SCK 18, MISO 19, MOSI 23
  rfid.PCD_Init();

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    // Halting is deliberate: a kiosk with no display cannot tell a student
    // anything, so failing loudly beats running half-blind.
    Serial.println("ERR:OLED not found - check wiring/address");
    while (true) delay(1000);
  }

  // Reports the RC522's own firmware register. 0x00 or 0xFF means the reader
  // isn't really talking over SPI, which is worth knowing before a card tap
  // silently does nothing.
  rfid.PCD_DumpVersionToSerial();

  Serial.println("READY");
  enterState(IDLE);
}

void loop() {
  readSerial();
  readCard();
  readButton();
  serviceTimeouts();
  serviceBuzzer();
}
