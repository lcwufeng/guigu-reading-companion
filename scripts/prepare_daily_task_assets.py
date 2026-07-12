from collections import deque
from pathlib import Path

from PIL import Image


SOURCE = Path("./补充素材/今日任务")
OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/ui/daily-tasks"


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
        return alpha > 0 and min(red, green, blue) >= 225 and max(red, green, blue) - min(red, green, blue) <= 14

    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for x in range(width):
        for y in (0, height - 1):
            if is_checker(x, y):
                queue.append((x, y))
                seen.add((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if is_checker(x, y) and (x, y) not in seen:
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


def export(source: str, destination: str, max_size: tuple[int, int], clear_background: bool = False) -> None:
    image = Image.open(SOURCE / source)
    if clear_background:
        image = clear_checker(image)
    image = trim(image)
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / destination, optimize=True)


def main() -> None:
    export("ChatGPT Image 2026年7月12日 22_37_53 (1).png", "panel.png", (340, 470))
    export("ChatGPT Image 2026年7月12日 22_37_54 (2).png", "title.png", (320, 90), clear_background=True)
    export("ChatGPT Image 2026年7月12日 22_37_56 (3).png", "task-row.png", (330, 72), clear_background=True)
    export("ChatGPT Image 2026年7月12日 22_37_57 (4).png", "counter.png", (72, 50))
    export("ChatGPT Image 2026年7月12日 22_37_57 (5).png", "fruit.png", (72, 72))
    export("ChatGPT Image 2026年7月12日 22_37_57 (6).png", "clean.png", (72, 72))
    export("ChatGPT Image 2026年7月12日 22_37_58 (7).png", "mistake.png", (72, 72))
    export("ChatGPT Image 2026年7月12日 22_37_58 (8).png", "reading.png", (72, 72))
    export("ChatGPT Image 2026年7月12日 22_37_59 (9).png", "reward-star.png", (72, 72))


if __name__ == "__main__":
    main()
