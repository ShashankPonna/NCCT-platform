// F10 NFC Kiosk — Arduino IDE firmware for ESP32 + PN532 (SPI)
//
// Reads a tag's factory UID and prints it as a plain "UID:<hex>" line over
// USB serial at 115200 baud. This exact format is required — the web kiosk
// page (apps/web/src/KioskNfcReader.tsx) reads raw serial lines over the
// Web Serial API and only reacts to lines starting with "UID:".
//
// Wiring matches this repo's existing ESP-IDF firmware (PN532/src/spi.c),
// so no rewiring is needed if the board was already bench-tested with that:
//   PN532 SCK  -> ESP32 GPIO14
//   PN532 MISO -> ESP32 GPIO12
//   PN532 MOSI -> ESP32 GPIO13
//   PN532 SS   -> ESP32 GPIO26
//   PN532 VCC  -> 3.3V, GND -> GND
//   (IRQ/RSTO not needed — this sketch polls instead of using interrupts)
//
// Requires the "Adafruit PN532" library (Library Manager pulls in
// "Adafruit BusIO" as a dependency automatically).

#include <Adafruit_PN532.h>

#define PN532_SCK  14
#define PN532_MISO 12
#define PN532_MOSI 13
#define PN532_SS   26

Adafruit_PN532 nfc(PN532_SCK, PN532_MISO, PN532_MOSI, PN532_SS);

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  nfc.begin();

  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("PN532 not found — check wiring");
    while (1) delay(1000);
  }

  nfc.SAMConfig();
}

void loop() {
  uint8_t uid[7];
  uint8_t uidLength;

  bool detected = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 500);

  if (detected) {
    char uidStr[15] = {0};
    for (uint8_t i = 0; i < uidLength; i++) {
      sprintf(&uidStr[i * 2], "%02X", uid[i]);
    }

    Serial.print("UID:");
    Serial.println(uidStr);

    delay(1000); // debounce so one tap doesn't spam repeated lines
  }
}
