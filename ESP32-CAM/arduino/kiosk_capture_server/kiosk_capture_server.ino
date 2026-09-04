// F5 kiosk face check-in — Arduino IDE firmware for AI-Thinker ESP32-CAM
// (flashed via an ESP32-CAM-MB USB programmer board).
//
// Deliberately NOT the stock "CameraWebServer" example — this is a trimmed
// sketch that only serves single JPEG frames, since the kiosk web page
// polls a still frame every ~1s and runs face detection client-side
// (@vladmandic/human), it does not need MJPEG streaming, resolution UI,
// or any of the other CameraWebServer extras.
//
// Endpoints (plain HTTP, port 80 — see docs/DECISIONS.md #21's open note
// on the kiosk page needing to be served over http:// too, to avoid a
// mixed-content block loading this from an https:// page):
//   GET /          -> plain-text liveness check
//   GET /capture   -> one JPEG frame, Content-Type: image/jpeg
//
// Board settings (Arduino IDE):
//   Tools -> Board            -> "AI Thinker ESP32-CAM"
//   Tools -> Partition Scheme -> "Huge APP (3MB No OTA/1MB SPIFFS)"
//   Tools -> Upload Speed     -> 115200
//
// Wiring: none needed beyond the ESP32-CAM-MB programmer's own 4-pin
// header (5V/GND/U0R/U0T) — the camera ribbon is already attached to the
// board from the factory.

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// ---- Edit these before flashing ----
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

// ---- AI-Thinker ESP32-CAM pin map (fixed by the board, do not edit) ----
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

WebServer server(80);

void handleCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "text/plain", "Camera capture failed");
    return;
  }
  // Force a fresh TCP connection per request and forbid caching — without
  // this, browsers can sit on a lingering keep-alive connection or a
  // cached response instead of issuing a real new request each poll,
  // which is what produces "one frame every 15-20s" instead of per-second.
  server.sendHeader("Connection", "close");
  server.sendHeader("Cache-Control", "no-store");
  // The kiosk page (served from its own local origin) fetches this frame
  // and draws it to a <canvas> for face detection — without an explicit
  // CORS allow-origin here, the browser taints that canvas as
  // cross-origin and refuses to let @vladmandic/human read its pixels at
  // all, failing with a SecurityError rather than a visible bug.
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  WiFiClient client = server.client();
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
  client.stop();
}

void handleRoot() {
  server.send(200, "text/plain", "ESP32-CAM alive. GET /capture for a JPEG frame.");
}

void setupCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Dropped from VGA to QVGA (and more compression) after real-world testing
  // on weak WiFi: a 640x480 frame (~18KB) was observed taking 4.5-15+
  // seconds to transfer and sometimes arriving truncated (a real, repeated
  // symptom, not a hypothetical one — the browser's createImageBitmap()
  // failed to decode a partial JPEG from a signal-limited transfer).
  // Face-detection accuracy doesn't need 640x480; a smaller frame that
  // reliably arrives whole beats a bigger one that sometimes doesn't.
  if (psramFound()) {
    config.frame_size = FRAMESIZE_QVGA; // 320x240
    config.jpeg_quality = 20;           // higher number = smaller file, more compression
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QQVGA; // 160x120 fallback, no PSRAM
    config.jpeg_quality = 25;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    while (true) delay(1000); // halt — nothing useful to do without a camera
  }
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);

  setupCamera();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  // ESP32 WiFi defaults to modem-sleep power saving, which adds noticeable
  // latency to every new connection while the radio wakes from sleep
  // between beacons. A kiosk running off wall power has no reason to save
  // power — disabling sleep trades a little extra current draw for a much
  // more responsive server.
  WiFi.setSleep(false);

  Serial.print("Camera ready. IP address: ");
  Serial.println(WiFi.localIP());
  Serial.println("Frame endpoint: http://" + WiFi.localIP().toString() + "/capture");

  server.on("/", handleRoot);
  server.on("/capture", handleCapture);
  server.begin();
}

void loop() {
  server.handleClient();
}
