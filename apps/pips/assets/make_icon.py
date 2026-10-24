# make_icon.py - renders the Pips icon.
#
# Produces, next to this script (so it works from any CWD):
#   assets/widget.ico  (16 / 32 / 48 / 64 / 128 / 256 px)
#   assets/widget.png  (256 px)
#
# Design: rounded square with a subtle indigo->violet gradient, a white
# circular clock ring, and a small white "stopwatch" hand + centre dot.
# Transparent background, supersampled then downscaled so it stays crisp at 16px.
#
# Run from the project folder:   python assets\make_icon.py
# Only dependency: Pillow.

from pathlib import Path

from PIL import Image, ImageDraw

# Everything is drawn at this size then downscaled for anti-aliased, crisp edges.
SS = 1024  # supersample resolution

# Palette.
INDIGO = (79, 70, 229)     # #4F46E5
VIOLET = (139, 92, 246)    # #8B5CF6
WHITE = (255, 255, 255)


def _rounded_mask(size: int) -> Image.Image:
    """White-on-black rounded-square alpha mask (app-icon squircle footprint)."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    pad = int(size * 0.031)          # ~8px margin at 256
    radius = int(size * 0.218)       # ~56px corner radius at 256
    d.rounded_rectangle([pad, pad, size - 1 - pad, size - 1 - pad],
                        radius=radius, fill=255)
    return m


def _gradient(size: int) -> Image.Image:
    """Vertical indigo(top) -> violet(bottom) gradient, subtle."""
    # Pillow's built-in horizontal 0..255 gradient, rotated to vertical.
    g = Image.linear_gradient("L").resize((size, size)).transpose(Image.ROTATE_90)
    top = Image.new("RGB", (size, size), INDIGO)
    bot = Image.new("RGB", (size, size), VIOLET)
    # composite: mask=0 -> top(indigo), mask=255 -> bot(violet).
    return Image.composite(bot, top, g)


def render_base(size: int = SS) -> Image.Image:
    """Draw the full icon at `size` with a transparent background."""
    grad = _gradient(size).convert("RGBA")
    grad.putalpha(_rounded_mask(size))

    d = ImageDraw.Draw(grad)
    cx = cy = size // 2

    # White clock ring.
    ring_r = int(size * 0.293)              # ~75px radius at 256
    ring_w = int(size * 0.074)              # ~19px line at 256
    d.ellipse([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
              outline=WHITE + (255,), width=ring_w)

    # Stopwatch hand: a short white hand pointing to ~1-2 o'clock + centre dot.
    import math
    ang = math.radians(55)                  # from 12 o'clock, clockwise
    L = int(size * 0.185)
    ex = int(cx + L * math.sin(ang))
    ey = int(cy - L * math.cos(ang))
    hand_w = max(2, int(size * 0.052))
    d.line([cx, cy, ex, ey], fill=WHITE + (255,), width=hand_w, joint="curve")

    dot_r = int(size * 0.038)
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=WHITE + (255,))

    return grad


def _resized(base: Image.Image, px: int) -> Image.Image:
    if px == base.size[0]:
        return base
    return base.resize((px, px), Image.LANCZOS)


def main() -> None:
    here = Path(__file__).resolve().parent
    base = render_base(SS)

    png_path = here / "widget.png"
    _resized(base, 256).save(png_path, format="PNG")

    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_path = here / "widget.ico"
    base.save(ico_path, format="ICO",
              sizes=[(s, s) for s in ico_sizes])

    print(f"wrote {png_path} ({png_path.stat().st_size} bytes)")
    print(f"wrote {ico_path} ({ico_path.stat().st_size} bytes, {len(ico_sizes)} sizes: {ico_sizes})")


if __name__ == "__main__":
    main()
