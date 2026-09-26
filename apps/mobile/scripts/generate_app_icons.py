"""One-off script: renders the EduDisha app icon at every exact pixel size
the Android/iOS projects need, from the source artwork at
apps/web/src/assets/logo-full.png, instead of resizing once and letting the
OS scale it (each size is resampled directly from the full-resolution
source for the best quality available at that size).

The source is the symbol-only crop of the approved EduDisha logo (compass\narrow over an open book), on a transparent background. load_source() trims\nany empty margin before downsizing so the glyph doesn't look tiny and\nover-padded at small sizes; it changes nothing about the artwork itself.

Run with: python generate_app_icons.py  (needs Pillow)
"""
from PIL import Image, ImageChops

WHITE = (255, 255, 255, 255)
SOURCE = "../../web/src/assets/logo-full.png"


def load_source() -> Image.Image:
    im = Image.open(SOURCE).convert("RGBA")
    # Trim to the artwork. Transparent sources (the current logo) are trimmed on
    # their alpha channel; opaque ones on difference-from-white. Transparency is
    # kept, so the adaptive-icon foreground stays transparent and make_icon()
    # supplies the white tile where one is wanted — flattening with
    # .convert("RGB") here would turn a transparent background black.
    if im.getchannel("A").getextrema()[0] < 255:
        box = im.getchannel("A").point(lambda p: 255 if p > 10 else 0).getbbox()
    else:
        rgb = im.convert("RGB")
        diff = ImageChops.difference(rgb, Image.new("RGB", im.size, (255, 255, 255)))
        box = diff.point(lambda p: 255 if p > 10 else 0).convert("L").getbbox()
    l, t, r, b = box
    cx, cy = (l + r) / 2, (t + b) / 2
    half = max(r - l, b - t) * 1.08 / 2
    canvas = Image.new("RGBA", (round(half * 2), round(half * 2)), (0, 0, 0, 0))
    part = im.crop((l, t, r, b))
    canvas.paste(part, (round(half - (r - l) / 2), round(half - (b - t) / 2)), part)
    return canvas


def make_icon(source: Image.Image, size: int, fill_ratio: float, background) -> Image.Image:
    """A size x size icon: `background` fills the canvas (None = transparent),
    the source artwork is centered and scaled to occupy `fill_ratio` of it."""
    img = Image.new("RGBA", (size, size), background if background else (0, 0, 0, 0))
    inner = round(size * fill_ratio)
    resized = source.resize((inner, inner), Image.LANCZOS)
    offset = ((size - inner) // 2, (size - inner) // 2)
    img.paste(resized, offset, resized)
    return img


source = load_source()

ANDROID_RES = "../android/app/src/main/res"
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

for density, size in DENSITIES.items():
    legacy = make_icon(source, size, fill_ratio=0.92, background=WHITE)
    legacy.save(f"{ANDROID_RES}/mipmap-{density}/ic_launcher.png")
    legacy.save(f"{ANDROID_RES}/mipmap-{density}/ic_launcher_round.png")

    fg_size = size * 108 // 48  # matches the existing foreground canvas ratio
    # Adaptive-icon foreground: only the inner ~66% of the 108dp canvas survives
    # the system's circle/squircle mask, so the artwork is scaled down and
    # centered on a transparent canvas rather than filling it edge to edge.
    foreground = make_icon(source, fg_size, fill_ratio=0.62, background=None)
    foreground.save(f"{ANDROID_RES}/mipmap-{density}/ic_launcher_foreground.png")

ios_icon = make_icon(source, 1024, fill_ratio=1.0, background=WHITE).convert("RGB")
ios_icon.save("../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

print("Done.")
