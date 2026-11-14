"""Prepare local LOLA polar textures and NASA Blue Marble for the browser."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
SIZE = 1024  # 1024 km across at the polar stereographic map's native scale.


def prepare_pole(source, hemisphere):
    pole = 1 if hemisphere == "north" else -1
    filename = f"ldam_50{hemisphere[0]}_1000m_float.lbl"
    with rasterio.open(source / filename) as raster:
        if (raster.shape != (2532, 2532)
                or raster.transform.to_gdal() != (-1266000, 1000, 0, 1266000, 0, -1000)):
            raise ValueError(f"Unexpected LOLA registration for {filename}")
        center = (raster.width - SIZE) // 2
        albedo = raster.read(1, window=Window(center, center, SIZE, SIZE))
    if not np.isfinite(albedo).all() or np.any((albedo <= 0) | (albedo > 1)):
        raise ValueError(f"Invalid albedo in {filename}")

    # Match overall display brightness in the overlap with the Moon Kit,
    # preserving the native polar samples and their relative brightness.
    globe = np.asarray(Image.open(ASSETS / "moon.webp").convert("L"))
    axis = np.arange(SIZE) + .5 - SIZE / 2
    x, y = np.meshgrid(axis, -axis)
    latitude = 90 - np.degrees(2 * np.arctan(np.hypot(x, y) / (2 * 1737.4)))
    longitude = np.degrees(np.arctan2(x, -pole * y))
    overlap = (latitude >= 76) & (latitude <= 80)
    row = ((90 - pole * latitude[overlap]) / 180 * globe.shape[0]).astype(int)
    col = ((longitude[overlap] + 180) / 360 * globe.shape[1]).astype(int) % globe.shape[1]
    old = globe[row, col]
    new = albedo[overlap]
    display = (albedo - np.median(new)) * (np.std(old) / np.std(new)) + np.median(old)
    Image.fromarray(np.rint(np.clip(display, 0, 255)).astype("uint8")).save(
        ASSETS / f"lola-{hemisphere}.webp", quality=92, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory containing the two IMG/LBL pairs and earth.png")
    args = parser.parse_args()
    prepare_pole(args.source, "north")
    prepare_pole(args.source, "south")
    Image.open(args.source / "earth.png").convert("RGB").save(ASSETS / "earth.webp", quality=89, method=6)
