"""Shared loader for packages/shared/src/ai/semantic-intents.json."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..core.vi_text import strip_vi

_FALLBACK_SPEC: dict[str, Any] = {
    "version": 1,
    "botAliases": ["lona", "lona ai", "lona bot", "tro ly", "bot oi", "pos_lona_bot"],
    "negativeGuards": [
        {"id": "why_reason", "phrases": ["tai sao", "vi sao", "nguyen nhan", "ly do gi", "do dau"]},
        {"id": "deep_analysis", "phrases": ["phan tich chi tiet", "phan tich sau", "xu huong", "du bao"]},
        {"id": "advisory", "phrases": ["de xuat", "goi y cai thien", "nen lam gi", "chien luoc"]},
    ],
    "periodRules": [
        {"period": "homqua", "label": "Hôm qua", "phrases": ["hom qua", "hqua", "ngay hom qua"]},
        {"period": "tuantruoc", "label": "Tuần trước", "phrases": ["tuan truoc", "tuan roi"]},
        {"period": "thangtruoc", "label": "Tháng trước", "phrases": ["thang truoc", "thang roi"]},
        {"period": "30ngay", "label": "30 ngày gần nhất", "phrases": ["30 ngay", "ba muoi ngay", "thang qua"]},
        {"period": "7ngay", "label": "7 ngày gần nhất", "phrases": ["7 ngay", "bay ngay", "tuan qua"]},
        {"period": "tuan", "label": "Tuần này", "phrases": ["tuan nay", "trong tuan", "ca tuan"]},
        {"period": "thang", "label": "Tháng này", "phrases": ["thang nay", "trong thang", "ca thang"]},
        {"period": "nam", "label": "Năm nay", "phrases": ["nam nay", "trong nam", "ca nam"]},
        {"period": "homnay", "label": "Hôm nay", "phrases": ["hom nay", "hnay", "ngay nay", "sang nay"]},
    ],
    "entities": {
        "product": {"keywords": ["mon an", "do an", "do uong", "mon nuoc", "san pham", "best seller", "mon"]},
        "hour": {"keywords": ["khung gio", "gio nao", "may gio", "cao diem", "gio"]},
        "staff": {"keywords": ["thu ngan", "nhan vien", "nhan su", "ai huy", "ai ban"]},
        "table": {"keywords": ["ban an", "ban so", "may ban", "ban trong", "ban dang", "mang ve"]},
        "order": {"keywords": ["hoa don", "don hang", "order", "bill"]},
    },
    "metrics": {
        "popularity_high": ["ban chay", "ban nhieu", "goi nhieu", "duoc goi nhieu", "dat nhieu", "order nhieu"],
        "popularity_low": ["ban cham", "ban it", "it goi", "it khach goi", "e nhat", "cham nhat"],
        "revenue_high": ["doanh thu cao", "mang lai nhieu tien", "thu nhieu", "cao nhat"],
        "density_high": ["dong nhat", "dong khach", "cao diem", "nhieu don"],
        "density_low": ["vang nhat", "it khach nhat"],
        "void_action": ["huy nhieu", "void nhieu"],
        "status_active": ["dang phuc vu", "con trong", "hien tai"],
        "recent_list": ["gan nhat", "moi nhat", "vua tao"],
    },
    "cardinality": {
        "superlativeCues": ["nhat", "top 1", "dung dau", "quan quan", "so 1"],
        "listCues": ["danh sach", "liet ke", "top 3", "top 5", "top 10", "nhung mon", "cac mon"],
    },
    "systemDocCues": ["huong dan", "cach dung", "may in", "rawbt", "imin", "invariant", "quy tac"],
    "intentDefinitions": [],
}


def resolve_semantic_spec_path() -> Path | None:
    """Locate semantic-intents.json across repo checkout or VPS deployment layout."""
    here = Path(__file__).resolve()
    candidates = [
        here.parents[4] / "packages" / "shared" / "src" / "ai" / "semantic-intents.json",
        here.parents[2] / "semantic-intents.json",
        Path("/opt/fnb-pos/packages/shared/src/ai/semantic-intents.json"),
        Path("/opt/fnb-pos/scripts/monitoring/semantic-intents.json"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=1)
def load_semantic_spec() -> dict[str, Any]:
    path = resolve_semantic_spec_path()
    if path is None:
        return dict(_FALLBACK_SPEC)
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict) and loaded.get("entities") and loaded.get("metrics"):
            return loaded
    except Exception:
        pass
    return dict(_FALLBACK_SPEC)


def has_phrase(haystack: str, phrases: list[str] | tuple[str, ...]) -> bool:
    """Boundary-aware substring/token match over normalized lowercase ASCII text."""
    padded = f" {haystack} "
    for raw in phrases:
        phrase = strip_vi(str(raw or ""))
        if not phrase:
            continue
        if " " in phrase:
            if phrase in haystack:
                return True
        elif f" {phrase} " in padded:
            return True
    return False
