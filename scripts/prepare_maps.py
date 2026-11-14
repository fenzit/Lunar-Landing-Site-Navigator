"""Build browser assets from the three local lunar products in the repo root."""

from pathlib import Path

import numpy as np
from PIL import Image
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets"
SLOPE = ROOT / "SLDEM2015_256_SL_90S_90N_000_360_LY.JP2"
SCALE, OFFSET, NODATA = 0.0015, 45, -32768


def prepare_color():
    with rasterio.open(ROOT / "lroc_color_16bit_srgb_4k.tif") as source:
        if source.shape != (2048, 4096) or source.dtypes != ("uint16",) * 3:
            raise ValueError("Unexpected CGI Moon Kit color format")
        rgb = source.read(out_shape=(3, 1024, 2048), resampling=Resampling.average)
    rgb = np.rint(rgb / 257).astype("uint8").transpose(1, 2, 0)
    Image.fromarray(rgb).save(OUTPUT / "moon.webp", quality=91, method=6)


def prepare_elevation():
    with rasterio.open(ROOT / "ldem_4.tif") as source:
        if source.shape != (720, 1440) or source.dtypes != ("float32",):
            raise ValueError("Expected the 1440×720 float32 LOLA product")
        elevation = source.read(1)
    if not np.isfinite(elevation).all() or elevation.min() < -15 or elevation.max() > 15:
        raise ValueError("Unexpected elevation values in kilometers")
    elevation.astype("<f4").tofile(OUTPUT / "lola-km.bin")
    print(f"LOLA elevation range: {elevation.min():.3f} to {elevation.max():.3f} km")


def verify_reference(source):
    # Byte-range samples from the original float IMG, whose first column is 0°E.
    for reference in sorted((ROOT / "data" / "slope-source").glob("range-*.bin")):
        latitude, longitude = map(int, reference.stem.removeprefix("range-").rsplit("-", 1))
        expected = np.fromfile(reference, "<f4")
        east = (longitude + 180) % 360 - 180
        row = (90 - latitude) * 256
        col = (east + 180) * 256
        raw = source.read(1, window=Window(col, row, expected.size, 1)).ravel()
        rmse = np.sqrt(np.mean((expected - (raw * SCALE + OFFSET)) ** 2))
        if rmse >= 1:
            raise ValueError(f"Reference {latitude}, {east} disagrees by {rmse:.2f}° RMS")
        print(f"Slope reference {latitude}, {east}: {rmse:.2f}° RMS")


def prepare_slope():
    with rasterio.open(SLOPE) as source:
        if (source.shape != (46080, 92160) or source.dtypes != ("int16",)
                or source.transform.to_gdal() != (-180, 1 / 256, 0, 90, 0, -1 / 256)
                or 32 not in source.overviews(1)):
            raise ValueError("Unexpected JP2 layout or georeference")
        verify_reference(source)
    # Read the decoder's 32× reduced-resolution overview. Never expand 4.2B cells.
    with rasterio.open(SLOPE, overview_level=4) as overview:
        if overview.shape != (1440, 2880):
            raise ValueError("Expected the 32× JPEG2000 overview")
        raw = overview.read(1)
    valid = raw != NODATA
    degrees = np.clip(raw.astype("float32") * SCALE + OFFSET, 0, 90)
    size = (2048, 1024)
    weights = np.asarray(Image.fromarray(valid.astype("float32")).resize(size, Image.Resampling.BOX))
    sums = np.asarray(Image.fromarray(degrees * valid).resize(size, Image.Resampling.BOX))
    overview_degrees = np.divide(sums, weights, out=np.zeros_like(sums), where=weights > 0)
    colors = np.array([[84, 183, 112], [244, 212, 99], [223, 83, 77]])
    rgba = np.empty((*overview_degrees.shape, 4), dtype=np.uint8)
    for channel in range(3):
        rgba[..., channel] = np.interp(overview_degrees, [0, 10, 20], colors[:, channel])
    rgba[..., 3] = np.rint(weights * 255).astype("uint8")
    Image.fromarray(rgba).save(OUTPUT / "slope.webp", lossless=True, method=6)
    print(f"Slope overview: {overview_degrees.min():.2f}–{overview_degrees.max():.2f}°, "
          f"{int((~valid).sum())} NoData overview cells")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    prepare_color()
    prepare_elevation()
    prepare_slope()
