#!/usr/bin/env python3
"""Crop a character portrait down to a consistent poker-table headshot.

The seat portrait box on the live table (`features/hrc/components/Seat.tsx`) is a
fixed square that's meant to show face-only — no shoulders/gear. A single hardcoded
CSS zoom can't do that reliably because source art isn't composed consistently
(some images have the face fill the top 58% of the frame, others closer to 45%,
with wildly different amounts of shoulder/armor below). This script finds the
actual face in each image (OpenCV's YuNet face detector) and crops a square around
it, so the output is consistent regardless of how the source was framed.

Use this for:
  - Regenerating `public/avatars/*.webp` (the poker-table seat portraits).
  - Any new avatar dropped in later — a player-selected image, or a Tripo3D-generated
    character render — needs this SAME poker-table crop; keep the full-body/original
    version separately for the profile page (this script only ever produces the
    table-seat crop, it does not touch or replace a full-body asset).

Usage:
    python3 crop_avatar_headshot.py <input_file_or_dir> <output_file_or_dir> [--size 240]

Requires: opencv-python-headless, numpy (pip install opencv-python-headless numpy)
"""

import argparse
import sys
from pathlib import Path

import cv2

MODEL_PATH = Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"

# Tuned against the current 24-character set (see scratchpad grid comparisons this
# session) — chin lands well inside the frame with only a sliver of collar visible,
# consistently, across very differently-framed source art.
HEIGHT_FACTOR = 1.7  # crop square side = detected face height * this
TOP_FRACTION = 0.45  # fraction of the crop square above the face box's top edge


def crop_headshot(img, height_factor: float = HEIGHT_FACTOR, top_fraction: float = TOP_FRACTION):
    """Return a square headshot crop of `img` (BGR numpy array), or None if no face found."""
    h, w = img.shape[:2]
    detector = cv2.FaceDetectorYN_create(str(MODEL_PATH), "", (w, h), score_threshold=0.6)
    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0:
        return None
    face = max(faces, key=lambda f: f[-1])  # highest-confidence detection
    fx, fy, fw, fh = face[0], face[1], face[2], face[3]
    side = fh * height_factor
    cx = fx + fw / 2
    top = fy - side * top_fraction
    left = cx - side / 2
    # Clamp into image bounds (keeps it square even if that shifts off-center near an edge).
    side = min(side, h, w)
    top = max(0, min(top, h - side))
    left = max(0, min(left, w - side))
    x0, y0 = int(left), int(top)
    x1, y1 = int(left + side), int(top + side)
    return img[y0:y1, x0:x1]


def process_file(src: Path, dst: Path, size: int) -> bool:
    img = cv2.imread(str(src))
    if img is None:
        print(f"  SKIP {src.name}: could not read image", file=sys.stderr)
        return False
    crop = crop_headshot(img)
    if crop is None:
        print(f"  SKIP {src.name}: no face detected", file=sys.stderr)
        return False
    out = cv2.resize(crop, (size, size), interpolation=cv2.INTER_LANCZOS4)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), out)
    print(f"  OK   {src.name} -> {dst}")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="Source image file, or a directory of images")
    ap.add_argument("output", help="Output file, or output directory (mirrors input names)")
    ap.add_argument("--size", type=int, default=240, help="Output square size in px (default 240)")
    args = ap.parse_args()

    src = Path(args.input)
    dst = Path(args.output)

    if src.is_dir():
        files = sorted([p for p in src.iterdir() if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")])
        if not files:
            print(f"No images found in {src}", file=sys.stderr)
            sys.exit(1)
        ok = 0
        for f in files:
            if process_file(f, dst / f.name, args.size):
                ok += 1
        print(f"\n{ok}/{len(files)} cropped successfully.")
        if ok < len(files):
            sys.exit(1)
    else:
        if not process_file(src, dst, args.size):
            sys.exit(1)


if __name__ == "__main__":
    main()
