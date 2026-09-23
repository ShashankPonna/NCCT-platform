#pragma once
// Fallback used only when the real ESP32-CONTROLLER/arduino/kiosk_controller/
// wifi_credentials.h (gitignored, real values) doesn't exist — e.g. a fresh
// clone that's never been set up for actual flashing. A quoted #include
// searches the including file's own directory first, so this stub is only
// ever reached via -Istubs when that real file is absent; the harness never
// actually connects to WiFi either way (see WiFi.h's own stub), so these
// values are never used for anything but letting the compile succeed.
const char* ssid = "unused-in-the-logic-harness";
const char* password = "unused-in-the-logic-harness";
