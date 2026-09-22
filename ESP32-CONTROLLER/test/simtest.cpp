// Logic-only harness for kiosk_controller.ino. Compiles the real sketch
// against stub Arduino/RC522/SSD1306 headers and drives its state machine
// with fake time, fake card taps and fake serial input.
//
// This is NOT a substitute for a bench test: it proves nothing about
// wiring, SPI, I2C, the RC522's real behaviour or the buzzer. What it does
// prove is that the state machine transitions, the wire protocol and the
// timeouts behave as DECISIONS.md #33/#34 say they do -- which is worth
// having, because a firmware timing bug found on the bench costs a reflash
// and a student standing at the kiosk.
//
//   cd ESP32-CONTROLLER/test
//   g++ -std=gnu++17 -Istubs -Wno-deprecated-declarations -o simtest simtest.cpp && ./simtest

#include "stubs.h"

SerialClass Serial; SPIClass SPI; TwoWire Wire;
bool g_cardPresent = false; std::string g_oled; static int g_button = HIGH;
static unsigned long _t = 1;
unsigned long millis() { return _t; }
void delay(unsigned long) {}
void pinMode(int,int) {}
void digitalWrite(int,int) {}
int digitalRead(int) { return g_button; }
void handleLine(String line);
void showMessage(String, String, String);
#include "../arduino/kiosk_controller/kiosk_controller.ino"

// ---- test driver ----------------------------------------------------------
#include <iostream>
static int failures = 0;
void advance(unsigned long ms) { for (unsigned long i = 0; i < ms; i++) { _t++; loop(); } }
void feed(const char* line) { Serial.in += std::string(line) + "\n"; advance(2); }
void press() { g_button = LOW; advance(60); g_button = HIGH; advance(60); }
std::string lastUp() { return Serial.out.empty() ? "" : Serial.out.back(); }
bool sentSince(size_t from, const char* needle) {
  for (size_t i = from; i < Serial.out.size(); i++) if (Serial.out[i] == needle) return true;
  return false;
}
void check(const char* name, bool ok) {
  std::cout << (ok ? "  PASS  " : "  FAIL  ") << name << "\n";
  if (!ok) failures++;
}
int main() {
  setup();
  check("boots into IDLE showing the tap prompt", state == IDLE && g_oled == "TAP YOUR CARD");

  // --- happy path -----------------------------------------------------
  size_t mark = Serial.out.size();
  g_cardPresent = true; advance(2000);
  check("tap emits the zero-padded uppercase UID", sentSince(mark, "UID:040A2B9C"));
  check("tap moves to IDENTIFYING", state == IDENTIFYING);
  feed("NAME:Priya Sharma");
  check("NAME: moves to WAITING_FOR_FACE", state == WAITING_FOR_FACE);
  check("OLED greets by name", g_oled.find("Priya Sharma") != std::string::npos);
  mark = Serial.out.size();
  press();
  check("button emits BTN:CAPTURE", sentSince(mark, "BTN:CAPTURE"));
  check("button moves to VERIFYING", state == VERIFYING);
  feed("OK");
  check("OK shows Verified", state == RESULT_HOLD && g_oled.find("Verified!") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);
  check("returns to IDLE after the hold", state == IDLE && g_oled == "TAP YOUR CARD");

  // --- unknown card: never reaches the camera stage --------------------
  g_cardPresent = true; advance(2000);
  feed("UNKNOWN");
  check("UNKNOWN never reaches WAITING_FOR_FACE", state == RESULT_HOLD);
  check("UNKNOWN says so on the OLED", g_oled.find("not recognized") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);

  // --- the consent gate: ERR: during IDENTIFYING ------------------------
  g_cardPresent = true; advance(2000);
  feed("ERR:face not enrolled");
  check("ERR: during identify skips the capture stage entirely", state == RESULT_HOLD);
  check("ERR: text reaches the OLED", g_oled.find("face not enrolled") != std::string::npos);
  mark = Serial.out.size();
  press();
  check("a button press after the refusal emits no BTN:CAPTURE", !sentSince(mark, "BTN:CAPTURE"));
  advance(RESULT_HOLD_MS + 50);

  // --- DUP is a calm success, not an error ------------------------------
  g_cardPresent = true; advance(2000); feed("NAME:Priya Sharma"); press(); feed("DUP");
  check("DUP shows the all-set message", g_oled.find("Already checked in") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);

  // --- the timing fix: verify window must outlast the browser's budget --
  const unsigned long BROWSER_WORST_CASE_MS = 2 * 20000 + 10000; // kioskCapture VERIFY_BUDGET_MS
  g_cardPresent = true; advance(2000); feed("NAME:Priya Sharma"); press();
  check("still VERIFYING at the browser's worst case", (advance(BROWSER_WORST_CASE_MS), state == VERIFYING));
  mark = Serial.out.size();
  feed("OK");
  check("a verdict that slow is still accepted", state == RESULT_HOLD && g_oled.find("Verified!") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);

  // --- but it does eventually give up -----------------------------------
  g_cardPresent = true; advance(2000); feed("NAME:Priya Sharma"); press();
  advance(VERIFY_TIMEOUT_MS + 100);
  check("verify still times out eventually", state == RESULT_HOLD && g_oled.find("kiosk PC") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);

  // --- face window / identify timeouts ----------------------------------
  g_cardPresent = true; advance(2000); feed("NAME:Priya Sharma");
  advance(FACE_WINDOW_TIMEOUT_MS + 100);
  check("face window times out if nobody presses", state == RESULT_HOLD && g_oled.find("Timed out") != std::string::npos);
  advance(RESULT_HOLD_MS + 50);
  g_cardPresent = true; advance(2000);
  advance(IDENTIFY_TIMEOUT_MS + 100);
  check("identify times out if the browser is silent", state == RESULT_HOLD);
  advance(RESULT_HOLD_MS + 50);

  // --- RESET works from anywhere ----------------------------------------
  g_cardPresent = true; advance(2000); feed("NAME:Priya Sharma");
  feed("RESET");
  check("RESET from WAITING_FOR_FACE returns to IDLE", state == IDLE && g_oled == "TAP YOUR CARD");

  // --- stray verdicts at idle change nothing -----------------------------
  feed("OK");
  check("a stray OK at IDLE is ignored", state == IDLE && g_oled == "TAP YOUR CARD");
  feed("WHAT:IS:THIS");
  check("an unknown line is ignored, not an error", state == IDLE);

  std::cout << (failures ? "\nFAILURES: " : "\nALL PASSED (") << failures << (failures ? "\n" : ")\n");
  return failures ? 1 : 0;
}
