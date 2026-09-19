"""Assembles the Hugging Face model repository for the hosted DocAI endpoint.

    .venv/Scripts/python -m scripts.build_hf_repo --out ../../.hf-repo
    .venv/Scripts/python -m scripts.build_hf_repo --out ../../.hf-repo --no-weights

Copies the handler, the pipeline package and the model card into the output
directory, then downloads the EasyOCR and LayoutLM weights into `models/` so the
endpoint boots without reaching the network. Push the result to the private
model repository; `git lfs` handles the weights via the generated
`.gitattributes`.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from docai import pipeline

ROOT = Path(__file__).resolve().parents[1]  # apps/docai
SOURCE = ROOT / "hf_endpoint"

# Repository root on the endpoint -> file in this working tree.
CODE = {
    "handler.py": SOURCE / "handler.py",
    "requirements.txt": SOURCE / "requirements.txt",
    "README.md": SOURCE / "README.md",
    "docai/__init__.py": ROOT / "docai" / "__init__.py",
    "docai/pipeline.py": ROOT / "docai" / "pipeline.py",
}

GITATTRIBUTES = """*.pth filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
*.safetensors filter=lfs diff=lfs merge=lfs -text
"""


def copy_code(out: Path) -> None:
    for target, source in CODE.items():
        destination = out / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        print(f"  {target}")
    (out / ".gitattributes").write_text(GITATTRIBUTES, encoding="utf-8")
    print("  .gitattributes")


def download_weights(out: Path) -> None:
    """Fills models/ so the endpoint never downloads at boot. Skips what it has."""
    import easyocr
    from huggingface_hub import snapshot_download

    easyocr_dir = out / "models" / "easyocr"
    easyocr_dir.mkdir(parents=True, exist_ok=True)
    print(f"  EasyOCR {'+'.join(pipeline.OCR_LANGS)} -> models/easyocr")
    easyocr.Reader(
        pipeline.OCR_LANGS,
        gpu=False,
        model_storage_directory=str(easyocr_dir),
        user_network_directory=str(easyocr_dir / "user"),
        verbose=False,
    )

    print(f"  {pipeline.QA_MODEL} -> models/qa")
    snapshot_download(
        pipeline.QA_MODEL,
        local_dir=str(out / "models" / "qa"),
        token=pipeline.hf_token(),
        # The pipeline runs on PyTorch; the other framework dumps double the size.
        ignore_patterns=["*.msgpack", "*.h5", "*.ot", "*.onnx"],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="model repository working copy")
    parser.add_argument(
        "--no-weights",
        action="store_true",
        help="copy code only and let the endpoint download weights at boot",
    )
    arguments = parser.parse_args()

    out = arguments.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    print(f"building {out}")
    copy_code(out)
    if arguments.no_weights:
        print("skipping weights (--no-weights); the endpoint downloads them at boot")
    else:
        download_weights(out)
    print("done")


if __name__ == "__main__":
    main()
