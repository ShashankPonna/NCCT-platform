#pragma once
#include "Arduino.h"

// Minimal stand-in for ESP32's WiFi.h — just enough surface for
// kiosk_controller.ino's connectWiFi() to compile and run under the
// logic-only harness. WiFi.status() always reports connected, so
// connectWiFi()'s wait loop never actually blocks a test run — this
// harness proves nothing about real WiFi timing/drops, same disclaimer
// as the RC522/OLED stubs beside it.

#define WIFI_STA 1
#define WL_CONNECTED 3
#define WL_DISCONNECTED 6

class IPAddress {
public:
  std::string s = "192.168.1.50";
  std::string toString() const { return s; }
  operator String() const { return String(s); }
};

class WiFiClass {
public:
  void mode(int) {}
  void begin(const char*, const char*) {}
  void setSleep(bool) {}
  int status() { return WL_CONNECTED; }
  IPAddress localIP() { return IPAddress(); }
};
extern WiFiClass WiFi;
