from pathlib import Path
from collections import Counter

from PIL import Image


SOURCE = Path("./补充素材")
OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/ui/home-refresh"


def trim(image: Image.Image, padding: int = 8) -> Image.Image:
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


def fit(image: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    return image


def export(source: Path, destination: str, max_size: tuple[int, int], padding: int = 8) -> None:
    image = trim(Image.open(source), padding)
    fit(image, max_size)
    target = OUTPUT / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, optimize=True)


def export_nav_icon(source: Path, destination: str) -> None:
    button = trim(Image.open(source), 0)
    icon_area = button.crop(
        (
            int(button.width * 0.045),
            int(button.height * 0.12),
            int(button.width * 0.35),
            int(button.height * 0.88),
        )
    ).convert("RGBA")
    source_pixels = list(icon_area.getdata())
    colors = Counter(source_pixels)
    cream = colors.most_common(1)[0][0]
    pixels = []
    for red, green, blue, alpha in source_pixels:
        distance = abs(red - cream[0]) + abs(green - cream[1]) + abs(blue - cream[2])
        pixels.append((red, green, blue, 0 if alpha and distance < 34 else alpha))
    icon_area.putdata(pixels)
    icon = trim(icon_area, 5)
    fit(icon, (104, 82))
    target = OUTPUT / "nav" / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    icon.save(target, optimize=True)


def main() -> None:
    action_dir = SOURCE / "乌龟动作图标"
    for source_name, target_name in {
        "喂果子.png": "feed.png",
        "去游泳.png": "swim.png",
        "捉迷藏.png": "hide.png",
        "睡一会.png": "sleep.png",
    }.items():
        export(action_dir / source_name, f"actions/{target_name}", (460, 220), 10)

    status_dir = SOURCE / "乌龟状态栏"
    export(status_dir / "状态背景栏.png", "status/panel.png", (340, 425), 4)
    for source_name, target_name in {
        "乌龟脑袋.png": "turtle-head.png",
        "饱腹.png": "hunger.png",
        "干净图标.png": "cleanliness.png",
        "有趣.png": "fun.png",
        "心情.png": "mood.png",
    }.items():
        export(status_dir / source_name, f"status/{target_name}", (88, 88), 6)

    export(SOURCE / "框框图片.png", "frames/top-frame.png", (1200, 300), 5)

    nav_dir = SOURCE / "功能图标"
    for source_name, target_name in {
        "家园图标.png": "home.png",
        "我的图标.png": "reading.png",
        "错题屋图标.png": "mistakes.png",
        "聊天图标.png": "chat.png",
        "旅行图标.png": "travel.png",
        "手帐图标.png": "journal.png",
    }.items():
        export_nav_icon(nav_dir / source_name, target_name)


if __name__ == "__main__":
    main()
