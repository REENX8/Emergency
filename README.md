# Building Evacuation Simulation

ระบบจำลองการอพยพอาคารฉุกเฉิน โดยใช้ทฤษฎีกราฟคำนวณเส้นทางออกที่เหมาะสมภายใต้สภาวะแบบไดนามิก (ไฟไหม้, ควัน, ความหนาแน่นของฝูงชน)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Graph Engine | NetworkX |
| Pathfinding | Dijkstra, A* (custom implementation) |
| Database | SQLite (local) / PostgreSQL (production) |
| Frontend | React 18 + Cytoscape.js |
| Weather | Thai Meteorological Department (TMD) Open Data API |
| Deploy | Render (Singapore region) |

---

## Architecture

```
React Frontend (Cytoscape.js)
        │
        │ HTTP (REST)
        ▼
  FastAPI Backend
  ┌──────────────────────────────────────────┐
  │  routers/buildings.py                    │
  │    ├── dynamic_graph.py   DB → NetworkX  │
  │    ├── pathfinding.py     Dijkstra / A*  │
  │    ├── fire_spread.py     ไฟลาม model   │
  │    ├── smoke_propagation.py  ควันไฟ      │
  │    ├── analysis.py        safety score   │
  │    └── weather.py         TMD API        │
  └──────────────────────────────────────────┘
        │
        ▼
  SQLite / PostgreSQL (buildings, nodes, edges, incidents)
```

---

## Mathematical Models

### 1. Edge Weight Formula

```
w(e) = d / (v_base × (1 − ρ(e)) × (1 − R(e)))
```

| ตัวแปร | ความหมาย |
|---|---|
| `d` | ความยาวเส้นทาง (เมตร) |
| `v_base` | 1.4 m/s (ทางเดิน — อยู่ในช่วง 1.2–1.5 ตามรายงาน), 0.6 m/s (บันได) |
| `ρ(e)` | crowd density ∈ [0, 1) |
| `R(e)` | smoke/risk level ∈ [0, 1] |

กรณีพิเศษ: `R(e) ≥ 0.9` → `w(e) = ∞` (ผ่านไม่ได้)

---

### 2. Smoke Propagation Formula

```
s(e) = s_fire × exp(−λ × dist(e, fire)) × φ(θ_wind)
```

| ตัวแปร | ค่า |
|---|---|
| `s_fire` | 1.0 (ความรุนแรงไฟเต็ม) |
| `λ` | 0.15 (decay rate ต่อเมตร) |
| `dist(e, fire)` | ระยะจาก edge midpoint ถึง fire node (เมตร) |
| `φ` | `1.0 + 0.5 × cos(angle between edge และ wind direction)` |

threshold: `s ≥ 0.9` → `w(e) = ∞`, `s < 0.9` → ส่ง R(e) = s เข้าสูตร weight

---

### 3. Safety Score

```
S = 40 × min(1, N_exit / (V_total / 5))
  + 30 × min(1, C_min_cut / (P_total / 10))
  + 30 × (λ(G) / (k + 1))
```

| ตัวแปร | ความหมาย |
|---|---|
| `N_exit` | จำนวน exit nodes |
| `V_total` | จำนวน nodes ทั้งหมด |
| `C_min_cut` | ขนาด minimum edge cut |
| `P_total` | ผลรวม capacity ของ non-exit nodes |
| `λ(G)` | edge connectivity (`nx.edge_connectivity`) |
| `k` | 1 (target fault tolerance) |

Grade: A (≥80), B (≥65), C (≥50), D (≥35), F (<35)

---

### 4. Fire Spread Formula

```
v_fire(e) = V_BASE × type_mult × width_factor × wind_factor
t_spread(e) = distance_m / v_fire(e)
```

| ตัวแปร | ค่า |
|---|---|
| `V_BASE` | 0.02 m/s |
| `type_mult` | room=1.0, corridor=1.5, stair=2.5, exit=0.5 |
| `width_factor` | `min(1.0, width_m / 2.0)` |
| `wind_factor` | `1.0 + 0.8 × max(0, cos_angle) × (wind_speed / 5.0)` |

Algorithm: Dijkstra จาก fire source — minimize cumulative `t_spread`

---

## Pathfinding Algorithms

### Dijkstra
- สำรวจ node ตามลำดับต้นทุนน้อยไปมาก (min-heap)
- รับประกันเส้นทางสั้นสุดบน non-negative weights
- ความซับซ้อน: **O((V + E) log V)**

### A*
- Dijkstra + heuristic `h(n)` = Euclidean distance จาก node ถึงปลายทาง
  (pixel → เมตร ด้วย ratio px/m สูงสุดที่วัดจากกราฟจริง → วินาที)
- Admissible: `h ≤` ต้นทุนจริงเสมอ ไม่ว่าแปลนจะวาดที่สเกลใด → optimal
- สำรวจ node ≤ Dijkstra (มี performance test ยืนยันบน grid 2000 nodes)

### Simulation timeline (operator console)
กด ▶ บน SimulationPage เพื่อเล่นเหตุการณ์ตามเวลา: ไฟ/ควันลามตาม fire-spread
model และ**จุดผู้อพยพเคลื่อนจากห้องไปยัง exit ตามเส้นทางจริง** ด้วยนาฬิกา
เดียวกับ router (ถึง exit ตรงเวลา `time_s` ของเส้นทางพอดี — `evacueePositions`
ใน `frontend/src/js/sim.js`)

---

## API Endpoints

### Multi-Building (Database-backed)

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| `POST` | `/buildings` | สร้าง building ใหม่ |
| `GET` | `/buildings` | ดู building ทั้งหมด |
| `GET` | `/buildings/summary` | dashboard rollup: nodes/edges, safety score+grade, active incidents ต่ออาคาร |
| `GET` | `/buildings/{id}` | ดู building เดียว |
| `DELETE` | `/buildings/{id}` | ลบ building |
| `POST` | `/buildings/import` | นำเข้า building + nodes + edges จาก JSON เดียว |
| `POST` | `/buildings/{id}/evacuate` | จำลองการอพยพ (Dijkstra/A*) |
| `POST` | `/buildings/{id}/evacuate/compare` | เปรียบ Dijkstra vs A* พร้อม smoke |
| `POST` | `/buildings/{id}/fire/spread` | คำนวณเวลาไฟลามถึงแต่ละ node |
| `POST` | `/buildings/{id}/smoke/propagate` | คำนวณ smoke level ทุก edge |
| `PATCH` | `/buildings/{id}` | แก้ไข building (name, total_floors, has_sprinkler, …) |
| `GET/POST` | `/buildings/{id}/nodes` | ดู/เพิ่ม node |
| `PUT/DELETE` | `/buildings/{id}/nodes/{key}` | แก้ไข/ลบ node |
| `GET/POST` | `/buildings/{id}/edges` | ดู/เพิ่ม edge |
| `DELETE` | `/buildings/{id}/edges/{id}` | ลบ edge |
| `GET` | `/buildings/{id}/graph` | ดู graph สำหรับ frontend |
| `POST` | `/buildings/{id}/floors` | อัปโหลดภาพ floor plan (≤ 10 MB) |
| `GET` | `/buildings/{id}/analysis/safety` | safety score + grade |
| `POST` | `/buildings/{id}/analysis/bottleneck` | หา bottleneck edges |
| `POST` | `/buildings/{id}/analysis/connectivity` | ตรวจ connectivity เมื่อ block edges |
| `POST` | `/buildings/{id}/evacuate/maxflow` | กระจายคนตาม max-flow |
| `GET` | `/buildings/{id}/compliance` | ตรวจกฎกระทรวง (Phase 2) |
| `GET` | `/buildings/{id}/experiments/run` | experiment สำเร็จรูป (json/csv) |
| `POST` | `/buildings/{id}/experiments/sweep` | sensitivity sweep (Phase 4) |
| `GET/POST` | `/buildings/{id}/incidents` | ดู/รายงานเหตุการณ์ (fire/smoke/crowd) |
| `PATCH` | `/buildings/{id}/incidents/{iid}` | ปิดเหตุการณ์ (resolve) |

### Meta

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| `GET` | `/weather` | ข้อมูลสภาพอากาศจาก TMD API |
| `GET` | `/health` | liveness check |
| `POST` | `/metrics/web-vitals` | รับ Core Web Vitals จาก frontend (logging only) |

### Auth (Phase 1: RBAC)

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| `POST` | `/auth/register` | สร้าง user ใหม่ — คนแรกได้ role `admin` อัตโนมัติ คนถัดมา default = `operator` |
| `POST` | `/auth/login` | คืน JWT |
| `GET` | `/auth/me` | ข้อมูล user + role ปัจจุบัน |
| `GET` | `/auth/users` | (admin) รายชื่อ user ทั้งหมด |
| `PATCH` | `/auth/users/{id}/role` | (admin) เปลี่ยน role ของ user — กันลด admin คนสุดท้าย |

---

## Phase 1 — Production Hardening (สิ่งที่เพิ่มล่าสุด)

### Role-based access control (RBAC)
3 role: `admin` (ลบ building + จัดการ user), `operator` (เขียนทั้งหมด), `viewer` (อ่านอย่างเดียว)
รายงาน incident จาก mobile user-app ยังเป็น **anonymous** (ไม่ต้อง login) เพื่อความเร่งด่วน

### Pagination
`GET /buildings`, `GET /buildings/{id}/nodes`, `GET /buildings/{id}/incidents`
รับ `?limit=&offset=` (default 100, max 500) — คืน envelope `{items, total, limit, offset}`

### Rate limiting (SlowAPI)
- `/auth/login` — 10 ครั้ง/นาที/IP
- `/auth/register` — 5 ครั้ง/นาที/IP
- `POST /buildings/{id}/incidents` (anonymous) — 10 ครั้ง/นาที/IP
- `POST /buildings/{id}/evacuate*`, `/fire/spread`, `/smoke/propagate` — 30 ครั้ง/นาที/user

ปิดได้ใน test ด้วย `RATE_LIMIT_ENABLED=0`

### Audit logging
ตาราง `audit_logs` บันทึก: register, login attempts, role change, building CRUD, node/edge mutate, incident report/resolve, floor upload

### Database migrations (Alembic)
```bash
cd backend
alembic upgrade head        # apply all migrations
alembic stamp 0001_baseline # mark existing DB as caught-up
alembic downgrade -1        # rollback one
```
Migrations อยู่ที่ `backend/alembic/versions/`

### Request validation limits
- string fields: 64–1000 ตัวอักษร (แล้วแต่ field)
- array fields: `crowd_densities`, `occupied_rooms` ≤ 500, `blocked_exits` ≤ 200
- import: `nodes` ≤ 5000, `edges` ≤ 20000
- floor image upload ≤ 10 MB

---

## Phase 2 — Thai Building Code Compliance

Rules engine at `backend/compliance.py` ตรวจ 6 ข้อจากกฎกระทรวง พ.ศ. 2535 (ฉบับ 33/55):
| ข้อ | กฎ | severity |
|---|---|---|
| `stair_width` | บันไดหนีไฟ ≥ 1.50 m | fail |
| `corridor_width` | ทางเดินอพยพ ≥ 1.50 m | warn |
| `exit_count` | อาคาร 2 ชั้นขึ้นไป ≥ 2 ทางหนีไฟ/ชั้น (exit + บันไดหนีไฟ) | fail |
| `travel_distance` | ห้อง → exit ใกล้สุด ≤ 60 m (sprinkler) / 30 m | fail |
| `dead_end` | ทางตัน ≤ 10 m | warn |
| `occupancy` | capacity ≤ พื้นที่ ÷ (9 m²/คน office) | warn |

Endpoint: `GET /buildings/{id}/compliance` คืน `{findings, summary, score, thresholds}`
ใช้ metadata `has_sprinkler` / `building_type` / `total_floors` (PATCH /buildings/{id} เพื่อตั้งค่า)

---

## Phase 3 — Real-time Collaboration

WebSocket endpoint: `WS /buildings/{id}/ws?token=<JWT?>`
รับ event เมื่อมีการเปลี่ยนแปลงในอาคารนั้น

Event types: `incident.created`, `incident.resolved`, `node.created/updated/deleted`, `edge.created/deleted`
Shape: `{type, payload, actor: {id,email,role}|null, ts}`

Frontend hook: `useBuildingEvents(buildingId, onEvent)` ใน `frontend/src/api/realtime.ts`
(ใช้ใน `SimulationPage` — refresh incidents ทันทีเมื่อมีรายงานใหม่) และ
`user-app/src/hooks/useBuildingEvents.ts` — auto-reconnect exponential backoff capped 30s
nginx ของทั้ง 2 แอป proxy WebSocket upgrade ผ่าน `/api/` แล้ว (`proxy_set_header Upgrade/Connection`)

Single-instance only. Multi-instance deploy ต้องการ Redis pub/sub (สร้างใน backend/realtime.py เอาภายหลัง)

---

## Phase 4 — Validation & Experiments

### Sensitivity sweep
`POST /buildings/{id}/experiments/sweep`
```json
{
  "fire_location": "r201",
  "variable": "wind_speed",      // wind_speed | fire_severity | crowd_density | fire_location
  "values": [0, 1, 2, 5, 10],
  "algorithms": ["dijkstra", "astar"],
  "repeats": 5,
  "seed": 42
}
```
คืน `{request, trials, summary, csv}` — reproducible เมื่อ `seed` เท่ากัน
ผ่าน `?format=csv` เพื่อโหลดเป็น CSV file

### Golden validation cases
`backend/validation/golden_*.json` — hand-computed expected times เปรียบเทียบใน `test_validation_golden.py` ภายใต้ tolerance 1 วินาที
ป้องกัน regression เมื่อ refactor สูตรน้ำหนัก

---

### ตัวอย่าง Request — สร้าง Building

```json
POST /buildings
{
  "name": "อาคาร A",
  "address": "เชียงใหม่",
  "tmd_station_id": "503201"
}
```

> `tmd_station_id` ใช้ระบุสถานีตรวจอากาศ TMD ที่ใกล้ building ที่สุด  
> ถ้าไม่ระบุ จะใช้ค่า default สถานีบางนา กรุงเทพ (`515201`)

### ตัวอย่าง Request — จำลองการอพยพ

```json
POST /buildings/{id}/evacuate
{
  "fire_location": "r201",
  "algorithm": "dijkstra",
  "blocked_exits": [],
  "crowd_densities": [{ "node_key": "c2", "density": 0.7 }],
  "occupied_rooms": ["r101", "r201", "r301"],
  "use_weather_wind": true,
  "compare_algorithms": true
}
```

---

## Weather Integration

ข้อมูลลมดึงจาก **TMD Open Data API** โดยอัตโนมัติทุก request

- แต่ละ building เก็บ `tmd_station_id` แยกกัน → ลมตรงกับที่ตั้งอาคาร
- Fallback เป็น mock data (`wind=3.5 m/s, dir=135°`) หาก API ไม่ตอบสนอง
- Override ด้วยมือได้: ส่ง `use_weather_wind: false` + `manual_wind_direction` + `manual_wind_speed`

---

## Project Structure

```
Emergency/
├── evacuation_report_final.pdf   # รายงานทางคณิตศาสตร์ (แหล่งที่มาสูตร)
├── layout_calculator.py          # วิเคราะห์อาคารจริง 4 ชั้น (standalone — ดูหัวข้อถัดไป)
├── layout_data.{json,csv}        # ข้อมูล digitize จากแปลนวาดมือ
├── layout_visualization.html     # ภาพแปลนแบบ interactive
├── render.yaml                   # Render deployment (backend + 2 static sites + Postgres)
├── docker-compose.yml            # backend :8000 + console :3000 + user-app :3001
├── pyproject.toml                # ruff / mypy / pytest / coverage config
├── .github/workflows/            # backend.yml (lint+test+audit), frontend.yml (2 แอป)
│
├── backend/
│   ├── main.py                   # FastAPI app + middleware + WebSocket endpoint
│   ├── database.py               # SQLAlchemy setup (SQLite / PostgreSQL)
│   ├── models.py                 # ORM: Building, Floor, Node, Edge, Incident, User, AuditLog
│   ├── schemas.py                # Pydantic request/response schemas
│   ├── auth.py                   # JWT + bcrypt + role dependency (RBAC)
│   ├── audit.py                  # Append-only audit log
│   ├── rate_limit.py             # SlowAPI limiter
│   ├── realtime.py               # In-memory WebSocket broadcast (per building)
│   ├── graph_builder.py          # Weight formula + reference 21-node building
│   ├── dynamic_graph.py          # DB → NetworkX graph builder (+ cache)
│   ├── pathfinding.py            # Dijkstra + A* implementations
│   ├── fire_spread.py            # Physics-based fire spread (Dijkstra)
│   ├── smoke_propagation.py      # Continuous smoke level model
│   ├── analysis.py               # Safety score, bottleneck, max-flow
│   ├── compliance.py             # กฎกระทรวง rules engine (Phase 2)
│   ├── experiments/              # Sweep runner + scenarios + metrics (Phase 4)
│   ├── validation/               # Golden test cases (hand-computed)
│   ├── weather.py                # TMD API integration
│   ├── storage.py                # File upload (local / Supabase)
│   ├── seed_demo.py              # Demo data seeder (3-floor building)
│   ├── alembic/versions/         # Migrations 0001–0005
│   ├── test_*.py                 # 259+ tests
│   └── requirements.txt
│
├── frontend/                     # Operator console (CRA + React 18)
│   └── src/
│       ├── pages/                # Login, Register, BuildingManager, FloorEditor,
│       │                         # SimulationPage, CompliancePage, ExperimentsPage
│       ├── js/                   # FloorPlan (SVG), Panels, TopBar, sim
│       ├── components/           # RequireAuth, ConfirmModal, Toast
│       └── api/                  # client.ts (axios+JWT), realtime.ts (WebSocket)
│
└── user-app/                     # Mobile evacuee PWA (Vite + TS, offline-ready, i18n)
    └── src/
        ├── routes/               # BuildingList, FloorPicker, FloorMap
        ├── components/           # FloorPlanCanvas, RouteOverlay, ReportSheet, …
        ├── hooks/                # useUserRoute, useBuildingEvents (WebSocket)
        └── api/                  # client.ts
```

---

## Standalone Deliverable — วิเคราะห์อาคารจริง (layout_*)

ไฟล์ `layout_*` ที่ root คือชุดวิเคราะห์ **อาคารทางเดินกลาง 4 ชั้น 28 ห้อง**
(digitize จากแปลนวาดมือ: ห้องกว้าง 9.14 m, ทางเดินยาว 64 m กว้าง 1.9 m,
บันได 2 ข้างกว้าง 1.6 m เป็นทางออกเดียว) — แยกจากระบบหลัก ใช้ค่าความเร็วเดียวกัน
(1.4 m/s ทางเดิน / 0.6 m/s บันได)

```bash
python layout_calculator.py   # ตารางระยะ/เวลาอพยพต่อห้อง + bottleneck + worst case
```

รายละเอียดการแปลคำอธิบายภาษาไทยในแปลน: `layout_plan_translation.md`

---

## Quick start (Docker — แนะนำ)

```bash
docker compose up --build
# Operator console:  http://localhost:3000
# Mobile user-app:   http://localhost:3001
# Backend:           http://localhost:8000   (Swagger UI: /docs)

# seed อาคาร demo 3 ชั้น (ครั้งแรก)
python backend/seed_demo.py
```

ทั้ง 2 frontend container เป็น nginx + บิ้วล์เสร็จแล้ว, proxy `/api/*` (รวม WebSocket)
ไปที่ backend container ผ่าน Docker network — เปิดเบราว์เซอร์แล้วใช้งานได้เลย
ไม่ต้องตั้ง `REACT_APP_API_URL`/`VITE_API_URL`

ตั้งค่า env ภายนอก (เช่นใช้ Supabase แทน SQLite):

```bash
# backend/.env หรือ shell env
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
JWT_SECRET=<random 32+ chars>     # ใช้กับ /auth/* (Phase 8)
```

---

## Run Locally (ไม่ใช้ Docker)

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

### Run Tests

```bash
cd backend
pip install pytest
RATE_LIMIT_ENABLED=0 pytest -v
# 259+ passed (pathfinding, fire/smoke, analysis, auth/RBAC, compliance,
#              realtime, experiments, validation, storage, weather, audit)
```

Lint/format ด้วย `ruff check backend/` และ `ruff format --check backend/`
(config อยู่ที่ `pyproject.toml`) — CI มี coverage gate ≥ 70%

Rate-limit tests run their own fresh modules so set `RATE_LIMIT_ENABLED=0`
globally — the dedicated `test_rate_limit.py` re-enables it per test.

---

## Deploy บน Render (manual)

### 1. Deploy Backend (Web Service)
1. [render.com](https://render.com) → **New → Web Service** → เชื่อม GitHub repo
2. ตั้งค่า:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3 (อ่านจาก `runtime.txt`)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Environment Variables:
   - `DATABASE_URL` — Supabase pooler URL (หรือเว้นว่างใช้ SQLite สำหรับทดสอบ)
   - `ALLOWED_ORIGINS` — เช่น `https://evacuation-frontend.onrender.com`
   - `JWT_SECRET` — random 32+ chars (ใช้กับ auth)
   - `ENV=production` — บังคับให้แอป refuse to start ถ้าลืมตั้ง `JWT_SECRET`
     (ใช้ `render.yaml` ที่ root จะตั้งค่าเหล่านี้ให้อัตโนมัติ)
4. รอ build เสร็จ → copy URL

### 2. Deploy Frontend (Static Site)
1. **New → Static Site** → ชี้ repo เดียวกัน
2. ตั้งค่า:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `build`
3. Environment Variables:
   - `REACT_APP_API_URL = https://<backend-url>.onrender.com`

### 3. (ทางเลือก) Docker
มี `Dockerfile` ทั้ง backend และ frontend + `docker-compose.yml` — Render Web Service
จะ auto-detect Dockerfile ถ้ามี

> **Note:** Free plan spin-down หลัง 15 นาที idle — request แรกอาจช้า ~30 วินาที

---

## Sample Test (cURL)

```bash
# สร้าง building พร้อม TMD station เชียงใหม่
curl -X POST http://localhost:8000/buildings \
  -H "Content-Type: application/json" \
  -d '{"name": "อาคาร A", "address": "เชียงใหม่", "tmd_station_id": "503201"}'

# จำลองไฟไหม้ที่ r201 พร้อมลมจริงจาก TMD
curl -X POST http://localhost:8000/buildings/1/evacuate \
  -H "Content-Type: application/json" \
  -d '{
    "fire_location": "r201",
    "crowd_densities": [{"node_key": "c2", "density": 0.7}],
    "occupied_rooms": ["r101", "r201", "r301"],
    "use_weather_wind": true
  }' | jq '.primary_routes[0]'

# ดู safety score
curl http://localhost:8000/buildings/1/analysis/safety | jq '.safety_score'
```
