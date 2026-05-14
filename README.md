# Building Evacuation Simulation

ระบบจำลองการอพยพอาคารฉุกเฉิน โดยใช้ทฤษฎีกราฟคำนวณเส้นทางออกที่เหมาะสมภายใต้สภาวะแบบไดนามิก (ไฟไหม้, ควัน, ความหนาแน่นของฝูงชน)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Graph Engine | NetworkX |
| Pathfinding | Dijkstra, A* (custom implementation) |
| Frontend | React 18 + Cytoscape.js |
| Weather | Thai Meteorological Department Open Data API |
| Deploy | Render (Singapore region) |

---

## Architecture

```
React Frontend (Cytoscape.js)
        │
        │ HTTP (REST)
        ▼
  FastAPI Backend
  ┌─────────────────────────────────┐
  │  POST /evacuate                 │
  │    ├── graph_builder.py         │  Building graph (NetworkX)
  │    ├── pathfinding.py           │  Dijkstra / A*
  │    └── weather.py               │  TMD API → smoke spread model
  └─────────────────────────────────┘
```

---

## Building Graph Model

อาคาร 3 ชั้น แบบจำลองเป็น **undirected weighted graph**

- **21 nodes** — ห้อง (9), ทางเดิน (3), บันได (6), ทางออก (3)
- **22 edges** — การเชื่อมต่อระหว่างพื้นที่

```
Stair A ←── Corridor ──→ Stair B
              │
           (West Exit)      ← Floor 1 เท่านั้น

แนวดิ่ง: Stair A/B เชื่อม F1↔F2↔F3
```

### สูตรน้ำหนัก Edge (Edge Weight Formula)

```
weight = (distance / speed) × width_factor × crowd_penalty
```

| ตัวแปร | ความหมาย |
|---|---|
| `distance` | ความยาวเส้นทาง (เมตร) |
| `speed` | 1.4 m/s (เดินปกติ), 0.6 m/s (บันได) |
| `width_factor` | `3.0 / width` — ทางแคบ = น้ำหนักสูงขึ้น |
| `crowd_penalty` | `1 + density × 3` — ฝูงชนแน่น = ช้าลง 4× |

---

## Pathfinding Algorithms

### Dijkstra
- สำรวจ node ตามลำดับต้นทุนน้อยไปมาก (min-heap)
- รับประกันเส้นทางสั้นสุดบน non-negative weights
- ความซับซ้อน: **O((V + E) log V)**

### A*
- Dijkstra + heuristic `h(n)` = ระยะ Euclidean จาก node ถึงปลายทาง
- Admissible (h ≤ ต้นทุนจริงเสมอ) → optimal
- สำรวจ node น้อยกว่า Dijkstra ในทางปฏิบัติ

---

## Dynamic Conditions

| สภาวะ | กลไก |
|---|---|
| **ควันไฟ (Smoke)** | ตั้ง `weight = ∞` บน edge ที่ถูกควัน → ถือเป็นปิดกั้น |
| **ทิศทางควัน** | คำนวณจาก wind vector (TMD API) ว่า edge ใดอยู่ใต้ลม |
| **ฝูงชน (Crowd)** | เพิ่ม weight ผ่าน crowd_penalty ตาม occupancy ratio |
| **ทางออกพัง** | ลบ node ออกจากกราฟ → recalculate ใหม่อัตโนมัติ |

### Smoke Spread Model
```
Wind direction → คำนวณ unit vector W
For each edge midpoint M:
  if dist(fire, M) ≤ smoke_radius AND dot(M - fire, W) ≥ 0:
      → edge นั้นถูกควันปิด
```
`smoke_radius` ขยายตามความเร็วลม: `radius_px = base × (1 + wind_speed / 10)`

---

## API Endpoints

### `GET /building`
คืนข้อมูล graph ทั้งอาคาร (สำหรับ Cytoscape.js render เริ่มต้น)

```json
{
  "graph": { "nodes": [...], "edges": [...] },
  "exits": ["exit1", "exit2", "exit3"],
  "node_count": 21,
  "edge_count": 22
}
```

### `POST /evacuate`

**Request body:**
```json
{
  "fire_location": "r201",
  "algorithm": "dijkstra",
  "blocked_exits": ["exit2"],
  "crowd_densities": [
    { "node_id": "c2", "density": 0.7 }
  ],
  "use_weather_wind": true,
  "occupied_rooms": ["r101", "r201", "r301"],
  "compare_algorithms": true
}
```

**Response:**
```json
{
  "fire_location": "r201",
  "primary_routes": [
    {
      "exit": "exit1",
      "path": ["r201", "c2", "stair_a_f2", "stair_a_f1", "exit1"],
      "cost_seconds": 106.2,
      "reachable": true,
      "algorithm": "dijkstra"
    }
  ],
  "comparison": { "dijkstra": [...], "astar": [...] },
  "smoke_blocked_edges": [["r202", "c2"]],
  "removed_exits": ["exit2"],
  "weather": { "wind_speed_ms": 3.5, "wind_direction_deg": 135, ... },
  "evacuation_estimate": { "overall_seconds": 142.0, "per_room": {...} },
  "graph_state": { "nodes": [...], "edges": [...] }
}
```

### `GET /weather`
ดึงข้อมูลสภาพอากาศล่าสุดจาก Thai Meteorological Department API  
Fallback เป็น mock data อัตโนมัติหาก API ไม่ตอบสนอง

---

## Project Structure

```
Emergency/
├── render.yaml                  # Render deployment config
├── .gitignore
│
├── backend/
│   ├── main.py                  # FastAPI app + endpoints
│   ├── graph_builder.py         # Building graph (NetworkX)
│   ├── pathfinding.py           # Dijkstra + A* implementations
│   ├── weather.py               # TMD API + smoke spread model
│   └── requirements.txt
│
└── frontend/
    ├── package.json
    ├── .env                     # REACT_APP_API_URL
    └── src/
        ├── index.js
        ├── App.jsx              # Root component + API calls
        └── components/
            ├── BuildingMap.jsx  # Cytoscape.js interactive floor plan
            ├── ControlPanel.jsx # Fire/crowd/wind controls
            └── ResultsTable.jsx # Routes + comparison table
```

---

## Run Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (terminal ใหม่)
cd frontend
npm install
npm start
# เปิด http://localhost:3000
```

---

## Deploy บน Render

### 1. Deploy Backend ก่อน
1. [render.com](https://render.com) → **New → Blueprint** → เชื่อม GitHub repo
2. Render อ่าน `render.yaml` อัตโนมัติ → สร้าง 2 services
3. รอ `evacuation-backend` build เสร็จ → copy URL  
   เช่น `https://evacuation-backend.onrender.com`

### 2. ตั้งค่า Frontend
Dashboard → `evacuation-frontend` → **Environment** → เพิ่ม:

```
REACT_APP_API_URL = https://evacuation-backend.onrender.com
```

กด **Manual Deploy** → frontend rebuild พร้อม URL จริง

> **Note:** Free plan จะ spin-down หลัง 15 นาที idle  
> request แรกอาจช้า ~30 วินาที

---

## Sample Test (cURL)

```bash
# ดู building graph
curl http://localhost:8000/building | jq '.node_count'

# จำลองไฟไหม้ที่ r201 ฝูงชนแน่นในทางเดิน
curl -X POST http://localhost:8000/evacuate \
  -H "Content-Type: application/json" \
  -d '{
    "fire_location": "r201",
    "algorithm": "dijkstra",
    "crowd_densities": [{"node_id": "c2", "density": 0.8}],
    "occupied_rooms": ["r101","r201","r301"],
    "use_weather_wind": false,
    "manual_wind_direction": 90,
    "manual_wind_speed": 5.0
  }' | jq '.primary_routes[0]'
```
