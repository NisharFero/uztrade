"""Generates the demo document pack for procedure 868 (export of tea by train).

apps/web/modules/demo/data/scenario-868.json is the single source of every demo
value; the pages are drawn by forms.py like every other pack.

    .venv/Scripts/python demo/generate_868.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_demo import main  # noqa: E402

if __name__ == "__main__":
    main(["868"])
