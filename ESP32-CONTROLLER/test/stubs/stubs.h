#pragma once
#include "Arduino.h"
class SPIClass { public: void begin() {} };
extern SPIClass SPI;
extern bool g_cardPresent;
class MFRC522 {
public:
  struct Uid { byte size; byte uidByte[10]; } uid;
  MFRC522(int, int) { uid.size = 4; uid.uidByte[0]=0x04; uid.uidByte[1]=0x0A; uid.uidByte[2]=0x2B; uid.uidByte[3]=0x9C; }
  void PCD_Init() {}
  bool PICC_IsNewCardPresent() { return g_cardPresent; }
  bool PICC_ReadCardSerial() { return g_cardPresent; }
  void PICC_HaltA() { g_cardPresent = false; }
  void PCD_StopCrypto1() {}
  void PCD_DumpVersionToSerial() {}
};
#define SSD1306_WHITE 1
#define SSD1306_SWITCHCAPVCC 2
extern std::string g_oled;
class Adafruit_SSD1306 {
public:
  Adafruit_SSD1306(int, int, TwoWire*, int) {}
  bool begin(int, int) { return true; }
  void clearDisplay() { g_oled.clear(); }
  void setTextSize(int) {}
  void setTextColor(int) {}
  void setCursor(int, int) {}
  void println(const String& v) { if (!g_oled.empty()) g_oled += " | "; g_oled += v.s; }
  void display() {}
};
