"""Rank sheet-level churn between two NS Acompanhamento workbooks.

Usage:
  python scripts/diff_xlsx.py antiga.xlsx nova.xlsx
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import openpyxl

USED_HINTS = (
    "financeiro",
    "pedidos",
    "entregues",
    "acompanhamentos",
    "rastreamento",
    "notas de intermedia",
    "cancelamentos",
    "estoque",
    "comprados",
)


def fold(name: str) -> str:
    return name.strip().lower()


def used(name: str) -> bool:
    f = fold(name)
    return any(h in f for h in USED_HINTS)


def load_rows(path: Path, sheet: str):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        if sheet not in wb.sheetnames:
            return None
        return [list(r) for r in wb[sheet].iter_rows(values_only=True)]
    finally:
        wb.close()


def fingerprint(row) -> str:
    parts = []
    for cell in row:
        parts.append("" if cell is None else str(cell).strip())
    while parts and parts[-1] == "":
        parts.pop()
    return "\x1f".join(parts)


def nonempty(rows):
    return sum(1 for row in rows if any(c is not None and str(c).strip() != "" for c in row))


def compare(old_rows, new_rows):
    if old_rows is None and new_rows is None:
        return None
    if old_rows is None:
        return {"status": "added", "score": 10_000 + nonempty(new_rows), "new": nonempty(new_rows)}
    if new_rows is None:
        return {"status": "removed", "score": 10_000 + nonempty(old_rows), "old": nonempty(old_rows)}
    old_set = Counter(fingerprint(r) for r in old_rows)
    new_set = Counter(fingerprint(r) for r in new_rows)
    only_old = sum((old_set - new_set).values())
    only_new = sum((new_set - old_set).values())
    return {
        "status": "changed" if only_old or only_new else "identical",
        "score": only_old + only_new,
        "old_rows": len(old_rows),
        "new_rows": len(new_rows),
        "old_nonempty": nonempty(old_rows),
        "new_nonempty": nonempty(new_rows),
        "only_old": only_old,
        "only_new": only_new,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("uso: python scripts/diff_xlsx.py antiga.xlsx nova.xlsx", file=sys.stderr)
        return 2
    old_path = Path(argv[1])
    new_path = Path(argv[2])
    old_wb = openpyxl.load_workbook(old_path, read_only=True)
    new_wb = openpyxl.load_workbook(new_path, read_only=True)
    old_names = list(old_wb.sheetnames)
    new_names = list(new_wb.sheetnames)
    old_wb.close()
    new_wb.close()

    print(f"antiga: {old_path.name}")
    print(f"nova:   {new_path.name}")
    only_old = sorted(set(old_names) - set(new_names))
    only_new = sorted(set(new_names) - set(old_names))
    if only_old:
        print("só na antiga:", ", ".join(only_old))
    if only_new:
        print("só na nova:", ", ".join(only_new))

    ranked = []
    for name in sorted(set(old_names) | set(new_names)):
        diff = compare(
            load_rows(old_path, name) if name in old_names else None,
            load_rows(new_path, name) if name in new_names else None,
        )
        if not diff:
            continue
        ranked.append((diff["score"], name, diff, used(name)))
    ranked.sort(reverse=True, key=lambda item: item[0])

    print("\nRanking de mudanças (maior primeiro):")
    for score, name, diff, is_used in ranked:
        flag = "USED" if is_used else "—"
        if diff["status"] == "identical":
            print(f"  [{flag}] {name}: idêntica")
            continue
        if diff["status"] == "added":
            print(f"  [{flag}] {name}: ABA NOVA (+{diff['new']} nonempty)")
            continue
        if diff["status"] == "removed":
            print(f"  [{flag}] {name}: ABA REMOVIDA (−{diff['old']} nonempty)")
            continue
        print(
            f"  [{flag}] {name}: score={score} "
            f"rows {diff['old_rows']}→{diff['new_rows']} "
            f"nonempty {diff['old_nonempty']}→{diff['new_nonempty']} "
            f"| só_antiga={diff['only_old']} só_nova={diff['only_new']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
