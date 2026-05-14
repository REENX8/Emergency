#!/usr/bin/env python3
"""
seed_demo.py — Load a 3-floor demo building into the running API.

Usage:
    python seed_demo.py                        # localhost:8000
    python seed_demo.py https://your-app.onrender.com
"""
import json
import sys
import httpx

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")

DEMO = {
    "name": "อาคาร IT (Demo)",
    "address": "คณะวิทยาศาสตร์และเทคโนโลยี",
    "description": "อาคาร 3 ชั้น 90 คน — ข้อมูลตัวอย่าง",
    "nodes": [
        # ── ชั้น 1 ──────────────────────────────────────────────────────
        {"node_key": "r101", "type": "room",     "label": "ห้อง 101",    "x": 80,  "y": 470, "capacity": 30, "floor_number": 1},
        {"node_key": "r102", "type": "room",     "label": "ห้อง 102",    "x": 80,  "y": 560, "capacity": 30, "floor_number": 1},
        {"node_key": "c1",   "type": "corridor", "label": "ทางเดิน ชั้น 1","x": 260, "y": 515, "capacity": 0,  "floor_number": 1},
        {"node_key": "s1",   "type": "stair",    "label": "บันได ชั้น 1", "x": 400, "y": 515, "capacity": 0,  "floor_number": 1},
        {"node_key": "e1",   "type": "exit",     "label": "ทางออก A",    "x": 540, "y": 470, "capacity": 0,  "floor_number": 1},
        {"node_key": "e2",   "type": "exit",     "label": "ทางออก B",    "x": 540, "y": 560, "capacity": 0,  "floor_number": 1},
        # ── ชั้น 2 ──────────────────────────────────────────────────────
        {"node_key": "r201", "type": "room",     "label": "ห้อง 201",    "x": 80,  "y": 270, "capacity": 30, "floor_number": 2},
        {"node_key": "r202", "type": "room",     "label": "ห้อง 202",    "x": 80,  "y": 355, "capacity": 30, "floor_number": 2},
        {"node_key": "c2",   "type": "corridor", "label": "ทางเดิน ชั้น 2","x": 260, "y": 310, "capacity": 0,  "floor_number": 2},
        {"node_key": "s2",   "type": "stair",    "label": "บันได ชั้น 2", "x": 400, "y": 310, "capacity": 0,  "floor_number": 2},
        # ── ชั้น 3 ──────────────────────────────────────────────────────
        {"node_key": "r301", "type": "room",     "label": "ห้อง 301",    "x": 80,  "y": 80,  "capacity": 30, "floor_number": 3},
        {"node_key": "r302", "type": "room",     "label": "ห้อง 302",    "x": 80,  "y": 160, "capacity": 20, "floor_number": 3},
        {"node_key": "c3",   "type": "corridor", "label": "ทางเดิน ชั้น 3","x": 260, "y": 120, "capacity": 0,  "floor_number": 3},
        {"node_key": "s3",   "type": "stair",    "label": "บันได ชั้น 3", "x": 400, "y": 120, "capacity": 0,  "floor_number": 3},
    ],
    "edges": [
        # ชั้น 1
        {"u_key": "r101", "v_key": "c1",  "distance_m": 12, "width_m": 2.0, "is_stair": False},
        {"u_key": "r102", "v_key": "c1",  "distance_m": 10, "width_m": 2.0, "is_stair": False},
        {"u_key": "c1",   "v_key": "s1",  "distance_m": 8,  "width_m": 2.0, "is_stair": False},
        {"u_key": "c1",   "v_key": "e1",  "distance_m": 18, "width_m": 3.0, "is_stair": False},
        {"u_key": "c1",   "v_key": "e2",  "distance_m": 18, "width_m": 3.0, "is_stair": False},
        # ชั้น 2
        {"u_key": "r201", "v_key": "c2",  "distance_m": 12, "width_m": 2.0, "is_stair": False},
        {"u_key": "r202", "v_key": "c2",  "distance_m": 10, "width_m": 2.0, "is_stair": False},
        {"u_key": "c2",   "v_key": "s2",  "distance_m": 8,  "width_m": 2.0, "is_stair": False},
        # ชั้น 3
        {"u_key": "r301", "v_key": "c3",  "distance_m": 12, "width_m": 2.0, "is_stair": False},
        {"u_key": "r302", "v_key": "c3",  "distance_m": 10, "width_m": 2.0, "is_stair": False},
        {"u_key": "c3",   "v_key": "s3",  "distance_m": 8,  "width_m": 2.0, "is_stair": False},
        # บันไดเชื่อมชั้น
        {"u_key": "s1",   "v_key": "s2",  "distance_m": 15, "width_m": 1.5, "is_stair": True},
        {"u_key": "s2",   "v_key": "s3",  "distance_m": 15, "width_m": 1.5, "is_stair": True},
    ],
}


def main():
    print(f"Seeding demo building to {API} ...")
    with httpx.Client(timeout=30) as client:
        # Health check
        try:
            client.get(f"{API}/health").raise_for_status()
        except Exception as e:
            print(f"✗ Cannot reach {API}: {e}")
            sys.exit(1)

        # Import building
        r = client.post(f"{API}/buildings/import", json=DEMO)
        if r.status_code not in (200, 201):
            print(f"✗ Import failed ({r.status_code}): {r.text}")
            sys.exit(1)

        data = r.json()
        print(f"✓ Building created: id={data['id']} name=\"{data['name']}\"")
        print(f"  nodes: {data['nodes_created']}  edges: {data['edges_created']}")

        # Quick simulation test
        sim = client.post(
            f"{API}/buildings/{data['id']}/evacuate",
            json={"fire_location": "r301", "use_weather_wind": False,
                  "manual_wind_direction": 90, "manual_wind_speed": 2},
        )
        if sim.status_code == 200:
            routes = sim.json().get("primary_routes", [])
            best = next((r for r in routes if r["reachable"]), None)
            if best:
                print(f"  best route → {best['exit']} in {best['cost_seconds']}s via {' → '.join(best['path'])}")
        else:
            print(f"  (simulation returned {sim.status_code})")

        print(f"\nเปิด http://localhost:3000 แล้วกด จำลองอพยพ ที่อาคาร id={data['id']}")


if __name__ == "__main__":
    main()
