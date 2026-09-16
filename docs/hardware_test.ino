// Hardware wiring test for: RC522 + OLED (SSD1306, I2C) + Buzzer + Button
// This does NOT talk to WiFi, the browser, or the server -
// it only checks that the RFID, OLED, buzzer and button are wired correctly.
//
// Libraries needed (Arduino IDE > Tools > Manage Libraries):
//   - MFRC522 (by GithubCommunity)
//   - Adafruit SSD1306
//   - Adafruit GFX Library

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---- Pins (matches the wiring table) ----
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

// Small helper so we don't repeat the same 5 lines everywhere
void showMessage(String line1, String line2 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(line1);
  if (line2 != "") {
    display.setCursor(0, 35);
    display.println(line2);
  }
  display.display();
}

void setup() {
  Serial.begin(115200);

  // Button uses the ESP32's internal pull-up, so no external resistor needed
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);

  // RC522 - uses the ESP32's default SPI pins (SCK18, MISO19, MOSI23)
  SPI.begin();
  rfid.PCD_Init();

  // OLED - stop here if it's not found, so the problem is obvious
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED not found - check wiring/address");
    while (true) { delay(1000); }
  }

  showMessage("SCAN YOUR CARD");
  Serial.println("Setup done. Waiting for card tap...");
}

void loop() {
  // Step 1: wait for a card tap
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {

    // Build the UID as a hex string (this is what the real system sends to
    // the browser). Every byte MUST be two zero-padded uppercase characters:
    // String(b, HEX) drops the leading zero, so byte 0x0A would print as "a"
    // and a card reading 04 0A 2B 9C would come out "40a2b9c" instead of
    // "040A2B9C". The backend strips non-hex and uppercases, but it cannot
    // put a missing digit back — so a card whose UID contains any byte below
    // 0x10 would simply never match. sprintf("%02X") is what the production
    // sketch (RC522/arduino/kiosk_uid_reader) uses, so keep the two in step.
    char uidStr[21] = {0}; // up to 10 UID bytes -> 20 hex chars + null
    for (byte i = 0; i < rfid.uid.size; i++) {
      sprintf(&uidStr[i * 2], "%02X", rfid.uid.uidByte[i]);
    }
    Serial.print("UID:");
    Serial.println(uidStr);

    // Step 2: prompt for camera
    showMessage("Look at camera");

    // Step 3: wait for the button press (10 second window so it doesn't hang forever)
    unsigned long start = millis();
    bool pressed = false;
    while (millis() - start < 10000) {
      if (digitalRead(BUTTON_PIN) == LOW) {
        delay(20); // settle: contacts bounce for a few ms on a real switch
        if (digitalRead(BUTTON_PIN) == LOW) {
          pressed = true;
          break;
        }
      }
      delay(5); // don't spin the CPU flat out while waiting
    }

    if (pressed) {
      Serial.println("BUTTON_PRESSED");
      showMessage("Checking...");
      // In the full system this is where the browser would send back PASS/FAIL.
      // Here we just buzz once, to confirm the buzzer wire works.
      digitalWrite(BUZZER_PIN, HIGH);
      delay(300);
      digitalWrite(BUZZER_PIN, LOW);
      showMessage("Test OK");
    } else {
      showMessage("No button press", "Try again");
    }

    delay(1500);
    showMessage("SCAN YOUR CARD");

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1(); // pairs with HaltA; without it some cards won't
                            // be read again on the next tap
  }
}
