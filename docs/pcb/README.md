# Kiosk controller PCB — schematic design

Design input for turning the breadboard kiosk controller into a board. This is
the schematic-level design (components, nets, and the reasoning behind the few
places the PCB deliberately differs from the breadboard). Layout/routing is
done in KiCad — see "Doing the layout" at the end.

Firmware this must stay compatible with:
`ESP32-CONTROLLER/arduino/kiosk_controller/kiosk_controller.ino`.
Pin assignments below are read from that sketch, not chosen fresh — changing
one means editing the `#define`s too.

## Scope: what is and isn't on this board

**On the board**: ESP32 DevKit, RC522 reader, SSD1306 OLED, buzzer, button.

**Not on the board — the ESP32-CAM.** It reaches the kiosk over WiFi
(`GET /capture`, DECISIONS.md #32), not over any wire to this controller. It
needs its own 5V supply near wherever it is physically aimed. Putting it on
this PCB would mean running a cable to it for no electrical reason. It is a
separate, independently-powered unit; the only thing tying the two together is
that the browser talks to both.

**Power**: from the DevKit's USB, which is already connected to the kiosk PC
for Web Serial. 3V3 comes from the DevKit's on-board regulator. No barrel jack
or separate supply — a second power path would be one more thing to go wrong
at a demo, and total draw is well inside what the DevKit's regulator handles.

## Bill of materials

| Ref | Part | Footprint | Notes |
|---|---|---|---|
| U1 | ESP32 DevKit v1 (30-pin) | 2×15, 2.54mm, 25.4mm rows | Socketed, not soldered — see below |
| U2 | RC522 RFID module | 1×8, 2.54mm | Socketed |
| U3 | SSD1306 OLED 0.96" I²C | 1×4, 2.54mm | Socketed; addr 0x3C (some are 0x3D) |
| BZ1 | Active buzzer, 5V, 12mm | TH buzzer 12mm, 7.6mm pitch | Active, not passive — firmware drives a level, not a tone |
| Q1 | MMBT3904 / 2N3904 NPN | SOT-23 or TO-92 | Buzzer driver — see below |
| R1 | 1 kΩ | 0805 or axial | Q1 base resistor |
| D1 | 1N4148 | SOD-123 or axial | Flyback across BZ1 |
| SW1 | Tactile button, 12mm | 12×12mm TH, 4-pin | Student-facing — full size, not 6mm |
| C1 | 100 µF electrolytic | D6.3mm, 2.5mm pitch | Bulk on 3V3 |
| C2–C4 | 100 nF ceramic | 0805 | One per module, close to its pins |

**Socket every module on female headers.** The DevKit, RC522 and OLED are all
sold as pin-header modules, and socketing means a dead RC522 is a 10-second
swap instead of a desolder — worth it for hardware that gets handled at a
demo. It also lets you pull the DevKit out to reflash it on another machine.

## Net list

`3V3` — U1 3V3, U2 3.3V, U3 VCC, C1+, C2, C3, C4
`5V` — U1 VIN(5V), BZ1+, D1 cathode
`GND` — U1 GND, U2 GND, U3 GND, SW1, Q1 emitter, C1−, C2–C4

| Net | From | To | Notes |
|---|---|---|---|
| `SPI_SCK` | U1 GPIO18 | U2 SCK | VSPI default |
| `SPI_MISO` | U1 GPIO19 | U2 MISO | VSPI default |
| `SPI_MOSI` | U1 GPIO23 | U2 MOSI | VSPI default |
| `RC522_SS` | U1 GPIO5 | U2 SDA | Strapping pin — see cautions |
| `RC522_RST` | U1 GPIO4 | U2 RST | |
| `I2C_SDA` | U1 GPIO21 | U3 SDA | ESP32 default I²C |
| `I2C_SCL` | U1 GPIO22 | U3 SCL | ESP32 default I²C |
| `BUZZ_DRV` | U1 GPIO14 | R1 → Q1 base | Active high |
| `BUZZ_OUT` | Q1 collector | BZ1−, D1 anode | |
| `BTN` | U1 GPIO13 | SW1 → GND | Internal pull-up; no external resistor |

U2 `IRQ` is left unconnected — the firmware polls (`PICC_IsNewCardPresent()`)
and never uses the interrupt line.

## Where the PCB deliberately differs from the breadboard

**The buzzer gets a transistor (Q1/R1/D1); on the breadboard it is driven
straight from GPIO14.** An active buzzer draws roughly 25–35 mA. The ESP32's
absolute maximum per GPIO is 40 mA and the recommended continuous figure is
20 mA, so direct drive sits between "works on the bench" and "within spec" —
which is exactly the kind of thing that survives testing and then fails after
an hour of a demo. Three components fix it permanently. D1 catches the
inductive kick from a magnetic buzzer; harmless if yours is piezo.

This changes nothing in firmware: GPIO14 high still means "beep", because an
NPN in this configuration is non-inverting from the pin's point of view.

**Decoupling caps are added.** The RC522's RF field draws in bursts, which is
the classic cause of "the reader works until the OLED is also active". A
breadboard's stray capacitance hides this; a PCB's short traces don't.

## Layout cautions

- **GPIO5 (`RC522_SS`) is a strapping pin.** It is sampled at boot and must not
  be held low at reset. The RC522 releases it, so this works — but do not add
  a pull-down, and keep the net clear of anything that could load it.
- **GPIO12 must stay unused.** It is the flash-voltage strapping pin; pulled
  high at boot, the board won't start. Nothing here uses it — keep it that way.
- **Keep the RC522 antenna area clear.** No ground pour, no traces under the
  module's antenna coil, and ideally a cutout or keep-out zone. Copper under
  the coil detunes it and shortens read range noticeably.
- **Mount the button and OLED for the student, not the assembler.** They are
  the only two student-facing parts; the reader needs its antenna face
  accessible. Everything else can go wherever routing prefers.
- 2-layer board, 1 oz copper, default JLCPCB rules are fine. No trace here
  carries more than ~100 mA; 0.3mm signal / 0.6mm power is generous.

## Doing the layout

The netlist above is the input. Once KiCad 9+ and a KiCad MCP server are
installed (see the repo conversation / `.mcp.json`), the flow is: create the
project, place the symbols, assign the footprints in the BOM table, import the
netlist, place, route, then DRC.

Nothing here is verified against a fabricated board — this is a design on
paper, derived from a breadboard build that does work. Treat the first
assembled unit as a prototype to test, not a known-good spare.
