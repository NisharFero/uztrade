"""Renders the demo document packs from apps/web/modules/demo/data/scenario-<id>.json.

Every page is a readable A4 (150 dpi) laid out like the printed form it stands
in for (forms.py): numbered box grids, line-item tables, totals, requisites,
signatures and seals, with DEMO banners. Every company, person, number and
stamp is invented. Printed labels follow the bilingual labels of the published
specimens (and the anchors in apps/web/modules/documents/specs.ts), so the
document AI reads a demo page the way it reads a real one.

    .venv/Scripts/python demo/generate_demo.py            # every pack, 868 included
    .venv/Scripts/python demo/generate_demo.py 161 57     # just these
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from forms import render_pack  # noqa: E402

APPS = Path(__file__).resolve().parents[2]
DATA = APPS / "web" / "modules" / "demo" / "data"
PUBLIC = APPS / "web" / "public" / "demo"


def render(procedure_id: str) -> int:
    scenario = json.loads((DATA / f"scenario-{procedure_id}.json").read_text(encoding="utf-8"))
    scenario.setdefault("procedureId", procedure_id)
    return render_pack(scenario, PUBLIC / procedure_id)


def main(ids: list[str]) -> None:
    if not ids:
        ids = sorted(p.stem.split("-")[1] for p in DATA.glob("scenario-*.json"))
    for procedure_id in ids:
        count = render(procedure_id)
        print(f"{procedure_id}: {count} documents in {PUBLIC / procedure_id}")


if __name__ == "__main__":
    main(sys.argv[1:])
