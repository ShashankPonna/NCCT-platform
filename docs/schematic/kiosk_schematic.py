"""NCCT attendance kiosk — controller board schematic.

Draws the ESP32 DevKit and everything wired to it. The ESP32-CAM is a
separate board on its own 5V supply that talks over WiFi, so it is not
part of this circuit.

RC522 and OLED are off-board modules on jumper leads, so they are drawn
the usual way for that: labelled connector stubs rather than placed
blocks.

Regenerate after any wiring change:
    pip install schemdraw
    python kiosk_schematic.py
"""
import schemdraw
import schemdraw.elements as elm

GREEN, RED, AMBER = "#2e9e5b", "#d23b30", "#e0a21a"

# Row spacing is deliberately loose: the speaker and LED symbols carry
# labels above and below, and tighter rows make those collide.
SLOTS = 18

with schemdraw.Drawing(file="kiosk.svg", show=False) as d:
    d.config(fontsize=12, unit=2.2, lw=1.6)

    esp = d.add(
        elm.Ic(
            pins=[
                # left — power in, then the RC522 SPI bus
                elm.IcPin(name="3V3", side="left", slot=f"18/{SLOTS}"),
                elm.IcPin(name="GND", side="left", slot=f"17/{SLOTS}"),
                elm.IcPin(name="21", side="left", slot=f"13/{SLOTS}"),
                elm.IcPin(name="18", side="left", slot=f"11/{SLOTS}"),
                elm.IcPin(name="23", side="left", slot=f"9/{SLOTS}"),
                elm.IcPin(name="19", side="left", slot=f"7/{SLOTS}"),
                elm.IcPin(name="22", side="left", slot=f"5/{SLOTS}"),
                # right — I2C display, then the local feedback parts
                elm.IcPin(name="25", side="right", slot=f"18/{SLOTS}"),
                elm.IcPin(name="26", side="right", slot=f"17/{SLOTS}"),
                elm.IcPin(name="32", side="right", slot=f"13/{SLOTS}"),
                elm.IcPin(name="33", side="right", slot=f"10/{SLOTS}"),
                elm.IcPin(name="27", side="right", slot=f"7/{SLOTS}"),
                elm.IcPin(name="14", side="right", slot=f"4/{SLOTS}"),
                elm.IcPin(name="13", side="right", slot=f"1/{SLOTS}"),
            ],
            w=4.8,
            h=18.0,
            plblsize=12,
        ).label("U1   ESP32 DevKit", loc="top", ofst=0.5, fontsize=15)
    )

    # ---- RC522 NFC reader, SPI — off-board module -----------------------
    for gpio, sig in (
        ("21", "SDA / SS"),
        ("18", "SCK"),
        ("23", "MOSI"),
        ("19", "MISO"),
        ("22", "RST"),
    ):
        d += (
            elm.Line().left(3.2).at(esp.anchors[gpio])
            .label(f"RC522  {sig}", loc="left", halign="right", fontsize=11)
        )
        d += elm.Dot(open=True)

    # ---- OLED SSD1306, I2C — off-board module ---------------------------
    for gpio, sig in (("25", "SDA"), ("26", "SCL")):
        d += (
            elm.Line().right(3.2).at(esp.anchors[gpio])
            .label(f"OLED  {sig}", loc="right", halign="left", fontsize=11)
        )
        d += elm.Dot(open=True)

    # ---- buzzer ----------------------------------------------------------
    d += elm.Line().right(1.3).at(esp.anchors["32"])
    d += elm.Speaker().right().label("BZ1  active buzzer", loc="top", ofst=0.7, fontsize=11)
    d += elm.Ground()

    # ---- capture button --------------------------------------------------
    # INPUT_PULLUP in firmware, so the switch pulls the pin down to GND.
    d += elm.Line().right(1.3).at(esp.anchors["33"])
    d += elm.Button().right().label("SW1  capture", loc="bottom", ofst=0.5, fontsize=11)
    d += elm.Ground()

    # ---- status LEDs -----------------------------------------------------
    for gpio, colour, ref, meaning in (
        ("27", GREEN, "D1", "pass"),
        ("14", RED, "D2", "fail"),
        ("13", AMBER, "D3", "ready"),
    ):
        d += elm.Line().right(1.3).at(esp.anchors[gpio])
        d += elm.Resistor().right().label("220Ω", loc="top", ofst=0.25, fontsize=10)
        d += (
            elm.LED().right().fill(colour)
            .label(f"{ref}  {meaning}", loc="bottom", ofst=0.28, fontsize=11)
        )
        d += elm.Ground()

    # ---- supply ----------------------------------------------------------
    d += elm.Line().left(1.9).at(esp.anchors["3V3"])
    d += elm.Vdd().label("+3.3V", fontsize=12)
    d += elm.Line().left(1.9).at(esp.anchors["GND"])
    d += elm.Ground()

    d.save("kiosk.png", dpi=200)

print("wrote kiosk.svg + kiosk.png")
