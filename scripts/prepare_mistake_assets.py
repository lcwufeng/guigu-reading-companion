from collections import deque
import os
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("GUIGU_ASSET_SOURCE", REPO_ROOT / "assets-source" / "错题屋界面"))
OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/ui/mistakes"


def trim(image: Image.Image, padding: int = 4) -> Image.Image:
    rgba = image.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    if not bounds:
        return rgba
    left, top, right, bottom = bounds
    return rgba.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(rgba.width, right + padding),
            min(rgba.height, bottom + padding),
        )
    )


def clear_checker(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size

    def is_checker(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        return alpha > 0 and min(red, green, blue) >= 226 and max(red, green, blue) - min(red, green, blue) <= 12

    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for y in range(height):
        for x in range(width):
            if not is_checker(x, y):
                continue
            touches_transparency = (
                x == 0
                or y == 0
                or x == width - 1
                or y == height - 1
                or any(
                    pixels[nx, ny][3] == 0
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                    if 0 <= nx < width and 0 <= ny < height
                )
            )
            if touches_transparency:
                queue.append((x, y))
                seen.add((x, y))

    while queue:
        x, y = queue.popleft()
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and is_checker(nx, ny):
                seen.add((nx, ny))
                queue.append((nx, ny))
    return rgba


def export_png(source: str, destination: str, max_size: tuple[int, int], clear_background: bool = False) -> None:
    image = Image.open(SOURCE / source)
    if clear_background:
        image = clear_checker(image)
    image = trim(image)
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / destination, optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    background = Image.open(SOURCE / "背景.png").convert("RGB")
    background.save(OUTPUT / "background.webp", "WEBP", quality=86, method=6)

    export_png("错题屋 LOGO.png", "title.png", (720, 240), clear_background=True)
    export_png("错题数据显示.png", "stats-panel.png", (620, 210))
    export_png("内容框.png", "content-frame.png", (1500, 850))
    export_png("记错题按钮.png", "add-button.png", (260, 96))
    export_png("ChatGPT Image 2026年7月12日 21_52_03 (9).png", "empty-turtle.png", (430, 330), clear_background=True)


if __name__ == "__main__":
    main()
