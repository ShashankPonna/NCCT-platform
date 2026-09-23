# Controller firmware logic harness

Compiles `../arduino/kiosk_controller/kiosk_controller.ino` against stub
Arduino / MFRC522 / SSD1306 / WiFi / WebServer headers and drives its state
machine with fake time, fake card taps and fake HTTP calls (the board's
wire protocol moved from USB serial to WiFi — GET /events + POST /command —
when the kiosk went battery-powered; see the file header in the .ino and
DECISIONS.md for why).

```sh
g++ -std=gnu++17 -Istubs -Wno-deprecated-declarations -o simtest simtest.cpp && ./simtest
```

No toolchain, board or library install needed — just a C++17 compiler.

## What this does and does not prove

It covers the parts of the firmware that are pure logic: the
`IDLE → IDENTIFYING → WAITING_FOR_FACE → VERIFYING → RESULT_HOLD` transitions,
the wire protocol in both directions (including that unknown lines and stray
verdicts are ignored rather than acted on), the UID hex formatting, and every
timeout.

It proves **nothing** about wiring, SPI, I2C, the RC522's real card behaviour,
the OLED or the buzzer — the stubs are deliberately dumb. A green run here is a
reason to flash the board, not a substitute for doing so.

## Why it exists

The timeout that the browser half implies is not something you can eyeball.
`VERIFY_TIMEOUT_MS` has to outlast `kioskCapture.ts`'s worst case
(`MAX_CAPTURE_ATTEMPTS × CAMERA_TIMEOUT_MS` plus detect and API time), and a
board that gives up first fails in the dangerous direction: it shows "no
response" and returns to idle, so the `OK` that arrives moments later is
dropped and the student reads an error for attendance that *was* recorded.
Two checks here pin that relationship — set `VERIFY_TIMEOUT_MS` back to the
25s an early draft carried and they fail, which is how that bug was found.
See DECISIONS.md #34.
