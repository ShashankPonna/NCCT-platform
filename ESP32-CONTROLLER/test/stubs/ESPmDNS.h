#pragma once
#include "Arduino.h"

// Minimal stand-in for ESP32's ESPmDNS.h — just enough surface for
// kiosk_controller.ino's connectWiFi() to compile and run under the
// logic-only harness. begin() always reports success, so this proves
// nothing about real mDNS resolution/advertisement — same disclaimer as
// the WiFi/RC522/OLED stubs beside it (see this directory's README).

class MDNSResponder {
public:
  bool begin(const char*) { return true; }
  void addService(const char*, const char*, uint16_t) {}
};
extern MDNSResponder MDNS;
