// F10 NFC Kiosk — Arduino IDE firmware for ESP32 + RC522 (SPI)
//
// Reads a tag's factory UID and prints it as a plain "UID:<hex>" line over
// USB serial at 115200 baud. This exact format is required — the web kiosk
// page (apps/web/src/KioskNfcReader.tsx) reads raw serial lines over the
// Web Serial API and only reacts to lines starting with "UID:".
//
// Wiring (ESP32 default VSPI pins for SCK/MISO/MOSI, arbitrary GPIOs for
// SS/RST — RC522 is 3.3V-only, do not power it from 5V):
//   RC522 SDA(SS) -> ESP32 GPIO21
//   RC522 SCK     -> ESP32 GPIO18
//   RC522 MOSI    -> ESP32 GPIO23
//   RC522 MISO    -> ESP32 GPIO19
//   RC522 RST     -> ESP32 GPIO22
//   RC522 3.3V    -> 3.3V,  GND -> GND
//   RC522 IRQ     -> not connected (unused by this sketch)
//
// Requires the "MFRC522" library by GithubCommunity/miguelbalboa
// (Arduino IDE: Tools -> Manage Libraries -> search "MFRC522").

#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN  21
#define RST_PIN 22

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  SPI.begin(); // default VSPI: SCK=18, MISO=19, MOSI=23
  rfid.PCD_Init();

  // Diagnostic only — reads the RC522's own firmware version register over
  // SPI. Prints "0x00" or "0xFF" (and the library's own wiring warning) if
  // the module isn't actually wired/powered correctly, vs. a real version
  // byte (commonly 0x91 or 0x92) if SPI communication is working. This is
  // independent of ever tapping a card, so it tells you wiring is good
  // before you rely on card taps to prove anything.
  rfid.PCD_DumpVersionToSerial();
  Serial.println("Ready — tap a tag.");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  char uidStr[21] = {0}; // rfid.uid.size can be up to 10 bytes -> 10*2 hex chars + null
  for (byte i = 0; i < rfid.uid.size; i++) {
    sprintf(&uidStr[i * 2], "%02X", rfid.uid.uidByte[i]);
  }

  Serial.print("UID:");
  Serial.println(uidStr);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(1000); // debounce so one tap doesn't spam repeated lines
}
