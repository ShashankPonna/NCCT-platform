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
#define SSD1306_BLACK 0
#define SSD1306_SWITCHCAPVCC 2
extern std::string g_oled;
struct GFXfont {};
// Records every string drawn this frame into g_oled (" | "-joined) so tests
// can assert on what the screen says; shapes are no-ops. Text bounds use the
// built-in font's 6x8 cell whatever the font, which is enough for layout
// code to run, not to check it.
class Adafruit_SSD1306 {
public:
  Adafruit_SSD1306(int, int, TwoWire*, int) {}
  bool begin(int, int) { return true; }
  void setRotation(int) {} // orientation only, no effect on the logged text
  void setTextWrap(bool) {}
  void clearDisplay() { g_oled.clear(); }
  void setTextSize(int) {}
  void setTextColor(int) {}
  void setFont(const GFXfont*) {}
  void setCursor(int, int) {}
  void getTextBounds(const char* t, int16_t x, int16_t y, int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
    *x1 = x; *y1 = y; *w = (uint16_t)(strlen(t) * 6); *h = 8;
  }
  void print(const String& v) { if (!g_oled.empty()) g_oled += " | "; g_oled += v.s; }
  void println(const String& v) { print(v); }
  void drawPixel(int, int, int) {}
  void drawLine(int, int, int, int, int) {}
  void drawFastHLine(int, int, int, int) {}
  void drawFastVLine(int, int, int, int) {}
  void drawRect(int, int, int, int, int) {}
  void fillRect(int, int, int, int, int) {}
  void drawRoundRect(int, int, int, int, int, int) {}
  void fillRoundRect(int, int, int, int, int, int) {}
  void drawCircle(int, int, int, int) {}
  void fillCircle(int, int, int, int) {}
  void drawCircleHelper(int, int, int, int, int) {}
  void drawTriangle(int, int, int, int, int, int, int) {}
  void display() {}
};
