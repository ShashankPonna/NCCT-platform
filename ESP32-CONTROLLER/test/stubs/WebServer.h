#pragma once
#include "Arduino.h"

// Minimal stand-in for ESP32's WebServer.h. The test driver calls
// handleEventsRoute()/handleCommandRoute() directly rather than exercising
// real HTTP (handleClient() is a no-op here) — that's a deliberate scope
// limit, same as the other stubs: this harness proves the state machine and
// wire-protocol *logic* work, not that the real HTTP layer does. arg()
// returns whatever the test last set on `argValue`, standing in for a real
// POST body.

typedef int HTTPMethod;
#define HTTP_GET 1
#define HTTP_POST 2

class WebServer {
public:
  int lastCode = 0;
  std::string lastSent;
  std::string argValue; // test sets this before calling a handler, to fake a POST body

  WebServer(int) {}
  void on(const char*, HTTPMethod, void (*)()) {}
  void begin() {}
  void handleClient() {}
  void sendHeader(const char*, const char*) {}
  void send(int code, const char*, const String& body) {
    lastCode = code;
    lastSent = body.s;
  }
  String arg(const char*) { return String(argValue); }
};
