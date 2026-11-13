import os
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("GUIGU_ASSET_SOURCE", REPO_ROOT / "assets-source"))
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

if __name__ == "__main__":
    main()
