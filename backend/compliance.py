"""
compliance.py — Thai building code compliance rules engine.

Reference standards (กฎกระทรวง พ.ศ. 2535):
  - ฉบับที่ 33 — อาคารสูง / อาคารขนาดใหญ่พิเศษ (high-rise buildings)
  - ฉบับที่ 55 — บันไดหนีไฟ (escape stairs)

Each rule receives the building graph + metadata and returns a list of
ComplianceFinding. Findings carry severity (`fail` / `warn` / `info`) so the
UI can surface critical issues first.

Thresholds are documented inline. If your jurisdiction uses different
values (e.g. older renovations exempted from the 1992 code), patch the
constants at the top of this file or pass overrides into evaluate().
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import networkx as nx

# ---------------------------------------------------------------------------
# Thresholds — กฎกระทรวง พ.ศ. 2535 (Thai building code)
# ---------------------------------------------------------------------------

# Minimum corridor / stair width for escape routes (metres)
MIN_STAIR_WIDTH_M = 1.50  # ฉบับที่ 55 §3 — บันไดหนีไฟกว้าง ≥ 1.50 m
MIN_CORRIDOR_WIDTH_M = 1.50  # ฉบับที่ 33 — ทางเดินอพยพ ≥ 1.50 m

# Maximum travel distance from any room to nearest exit (metres of path)
MAX_TRAVEL_DISTANCE_M_SPRINKLERED = 60.0  # อาคารมีระบบดับเพลิงอัตโนมัติ
MAX_TRAVEL_DISTANCE_M_UNSPRINKLERED = 30.0  # ไม่มี sprinkler — ฉบับที่ 33

# Maximum dead-end corridor length (metres)
MAX_DEAD_END_M = 10.0

# Minimum independent exits per floor (high-rise / large buildings)
MIN_EXITS_PER_FLOOR = 2

# Default area per person if Node.area_m2 is unset (square metres / person)
OCCUPANCY_BY_TYPE = {
    "office": 9.0,  # สำนักงาน — 9 ตร.ม./คน
    "assembly": 0.65,  # ห้องประชุม / โรงอาหาร — 0.65 ตร.ม./คน
    "residential": 18.0,  # ที่พักอาศัย — 18 ตร.ม./คน
    "mixed": 6.0,  # ผสม
}


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class ComplianceFinding:
    rule_id: str
    severity: str  # "fail" | "warn" | "info"
    message: str
    location: dict = field(default_factory=dict)  # e.g. {"node": "r201"} or {"edge": ["c1","c2"]}

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BuildingMeta:
    has_sprinkler: bool = False
    building_type: str = "office"  # office / residential / assembly / mixed
    total_floors: int = 1


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------


def _exits(G: nx.Graph) -> list[str]:
    return [n for n, d in G.nodes(data=True) if d.get("type") == "exit"]


def check_stair_width(G: nx.Graph) -> list[ComplianceFinding]:
    findings = []
    for u, v, d in G.edges(data=True):
        if not d.get("is_stair"):
            continue
        width = float(d.get("width", 0))
        if width < MIN_STAIR_WIDTH_M:
            findings.append(
                ComplianceFinding(
                    rule_id="stair_width",
                    severity="fail",
                    message=f"บันไดหนีไฟ {u}↔{v} กว้าง {width:.2f} m (ต่ำกว่า {MIN_STAIR_WIDTH_M} m ตามกฎกระทรวง ฉบับที่ 55)",
                    location={"edge": [u, v]},
                )
            )
    return findings


def check_corridor_width(G: nx.Graph) -> list[ComplianceFinding]:
    findings = []
    for u, v, d in G.edges(data=True):
        if d.get("is_stair"):
            continue
        # Treat any edge touching a corridor / exit as part of the escape route.
        u_type = G.nodes[u].get("type", "")
        v_type = G.nodes[v].get("type", "")
        if "corridor" not in (u_type, v_type) and "exit" not in (u_type, v_type):
            continue
        width = float(d.get("width", 0))
        if width < MIN_CORRIDOR_WIDTH_M:
            findings.append(
                ComplianceFinding(
                    rule_id="corridor_width",
                    severity="warn",
                    message=f"ทางเดินอพยพ {u}↔{v} กว้าง {width:.2f} m (ต่ำกว่า {MIN_CORRIDOR_WIDTH_M} m)",
                    location={"edge": [u, v]},
                )
            )
    return findings


def check_exit_count(G: nx.Graph, total_floors: int) -> list[ComplianceFinding]:
    findings = []
    has_exit = any(d.get("type") == "exit" for _, d in G.nodes(data=True))
    if not has_exit:
        findings.append(
            ComplianceFinding(
                rule_id="exit_count",
                severity="fail",
                message="ไม่มี exit node เลย — อาคารไม่มีทางออกฉุกเฉิน",
                location={},
            )
        )
        return findings
    # High-rise / large building rule: ≥ 2 escape routes per occupied floor.
    # Every floor that has nodes is checked — a floor with no exit AND no
    # fire-escape stair must not pass silently. Exits and stairs both count
    # as escape routes for the floor they are on.
    if total_floors >= 2:
        escape_routes: dict[int, int] = {}
        for _n, d in G.nodes(data=True):
            f = int(d.get("floor", 1))
            escape_routes.setdefault(f, 0)
            if d.get("type") in ("exit", "stair"):
                escape_routes[f] += 1
        for f, count in sorted(escape_routes.items()):
            if count < MIN_EXITS_PER_FLOOR:
                findings.append(
                    ComplianceFinding(
                        rule_id="exit_count",
                        severity="fail",
                        message=(
                            f"ชั้น {f} มีทางหนีไฟ {count} จุด "
                            f"(exit + บันไดหนีไฟ ต้อง ≥ {MIN_EXITS_PER_FLOOR})"
                        ),
                        location={"floor": f},
                    )
                )
    return findings


def check_travel_distance(G: nx.Graph, has_sprinkler: bool) -> list[ComplianceFinding]:
    """Use Dijkstra on the `distance` attribute (metres) to measure travel
    path from each room to the nearest reachable exit."""
    findings: list[ComplianceFinding] = []
    exits = _exits(G)
    if not exits:
        return findings  # caught by check_exit_count
    threshold = (
        MAX_TRAVEL_DISTANCE_M_SPRINKLERED if has_sprinkler else MAX_TRAVEL_DISTANCE_M_UNSPRINKLERED
    )
    label = "sprinkler" if has_sprinkler else "ไม่มี sprinkler"

    # Per-edge distance for Dijkstra (metres of physical path, not weighted time).
    for _u, _v, d in G.edges(data=True):
        d["_dist_m"] = float(d.get("distance", 0))

    rooms = [n for n, d in G.nodes(data=True) if d.get("type") == "room"]
    for room in rooms:
        best = float("inf")
        for ex in exits:
            try:
                best = min(best, nx.dijkstra_path_length(G, room, ex, weight="_dist_m"))
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
        if best == float("inf"):
            findings.append(
                ComplianceFinding(
                    rule_id="travel_distance",
                    severity="fail",
                    message=f"ห้อง {room} ไม่มีทางเชื่อมไป exit ใด ๆ",
                    location={"node": room},
                )
            )
        elif best > threshold:
            findings.append(
                ComplianceFinding(
                    rule_id="travel_distance",
                    severity="fail",
                    message=(
                        f"ห้อง {room} ห่าง exit ที่ใกล้สุด {best:.1f} m (เกิน {threshold} m, {label})"
                    ),
                    location={"node": room, "distance_m": round(best, 1)},
                )
            )
    return findings


def check_dead_end(G: nx.Graph) -> list[ComplianceFinding]:
    """A corridor node with degree=1 is a dead end. The dead-end length is
    the length of the single edge leading to it."""
    findings = []
    for n, d in G.nodes(data=True):
        if d.get("type") != "corridor":
            continue
        if G.degree(n) != 1:
            continue
        # The single incident edge:
        u, v, edata = next(iter(G.edges(n, data=True)))
        length = float(edata.get("distance", 0))
        if length > MAX_DEAD_END_M:
            findings.append(
                ComplianceFinding(
                    rule_id="dead_end",
                    severity="warn",
                    message=f"ทางตัน {n} ยาว {length:.1f} m (เกิน {MAX_DEAD_END_M} m)",
                    location={"node": n, "length_m": round(length, 1)},
                )
            )
    return findings


def check_occupancy(G: nx.Graph, building_type: str) -> list[ComplianceFinding]:
    """If a node has `area_m2` set, flag when its declared capacity exceeds
    what the area can hold per the building-type allowance.

    Without per-node area data we skip silently (returns []) — better to
    say nothing than false-flag every node.
    """
    findings = []
    sqm_per_person = OCCUPANCY_BY_TYPE.get(building_type, OCCUPANCY_BY_TYPE["office"])
    for n, d in G.nodes(data=True):
        if d.get("type") != "room":
            continue
        area = d.get("area_m2")
        if not area:
            continue
        max_people = int(float(area) / sqm_per_person)
        cap = int(d.get("capacity", 0))
        if cap > max_people:
            findings.append(
                ComplianceFinding(
                    rule_id="occupancy",
                    severity="warn",
                    message=(
                        f"ห้อง {n} ความจุ {cap} คน เกินค่าที่อนุญาตจากพื้นที่ "
                        f"({max_people} คน @ {sqm_per_person} ตร.ม./คน, ประเภท {building_type})"
                    ),
                    location={"node": n, "capacity": cap, "max_allowed": max_people},
                )
            )
    return findings


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def evaluate(G: nx.Graph, meta: BuildingMeta) -> dict:
    """Run every rule and produce a compliance report.

    Returns:
        {
          "findings": [...],
          "summary": {"fail": n, "warn": n, "info": n},
          "score": 0-100,         # 100 = no findings; -10 per fail, -3 per warn
          "thresholds": {...}     # echo of constants in effect for clarity
        }
    """
    findings: list[ComplianceFinding] = []
    findings += check_stair_width(G)
    findings += check_corridor_width(G)
    findings += check_exit_count(G, meta.total_floors)
    findings += check_travel_distance(G, meta.has_sprinkler)
    findings += check_dead_end(G)
    findings += check_occupancy(G, meta.building_type)

    summary = {"fail": 0, "warn": 0, "info": 0}
    for f in findings:
        summary[f.severity] = summary.get(f.severity, 0) + 1

    score = max(0, 100 - summary["fail"] * 10 - summary["warn"] * 3)

    return {
        "findings": [f.to_dict() for f in findings],
        "summary": summary,
        "score": score,
        "thresholds": {
            "min_stair_width_m": MIN_STAIR_WIDTH_M,
            "min_corridor_width_m": MIN_CORRIDOR_WIDTH_M,
            "max_travel_distance_m": (
                MAX_TRAVEL_DISTANCE_M_SPRINKLERED
                if meta.has_sprinkler
                else MAX_TRAVEL_DISTANCE_M_UNSPRINKLERED
            ),
            "max_dead_end_m": MAX_DEAD_END_M,
            "min_exits_per_floor": MIN_EXITS_PER_FLOOR,
            "sqm_per_person": OCCUPANCY_BY_TYPE.get(
                meta.building_type, OCCUPANCY_BY_TYPE["office"]
            ),
        },
        "meta": {
            "has_sprinkler": meta.has_sprinkler,
            "building_type": meta.building_type,
            "total_floors": meta.total_floors,
        },
    }
