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
| `v_base` | 1.4 m/s (ทางเดิน), 0.6 m/s (บันได) |
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
- Dijkstra + heuristic `h(n)` = Euclidean distance จาก node ถึงปลายทาง (pixel → เมตร → วินาที)
- Admissible: `h ≤` ต้นทุนจริงเสมอ → optimal
- สำรวจ node น้อยกว่า Dijkstra ในทางปฏิบัติ

---

## API Endpoints

### Multi-Building (Database-backed)

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| `POST` | `/buildings` | สร้าง building ใหม่ |
| `GET` | `/buildings` | ดู building ทั้งหมด |
| `GET` | `/buildings/{id}` | ดู building เดียว |
| `DELETE` | `/buildings/{id}` | ลบ building |
| `POST` | `/buildings/import` | นำเข้า building + nodes + edges จาก JSON เดียว |
| `POST` | `/buildings/{id}/evacuate` | จำลองการอพยพ (Dijkstra/A*) |
| `POST` | `/buildings/{id}/evacuate/compare` | เปรียบ Dijkstra vs A* พร้อม smoke |
| `POST` | `/buildings/{id}/fire/spread` | คำนวณเวลาไฟลามถึงแต่ละ node |
| `POST` | `/buildings/{id}/smoke/propagate` | คำนวณ smoke level ทุก edge |
| `POST` | `/buildings/{id}/nodes` | เพิ่ม node |
| `POST` | `/buildings/{id}/edges` | เพิ่ม edge |
| `GET` | `/buildings/{id}/graph` | ดู graph สำหรับ Cytoscape.js |
| `GET` | `/buildings/{id}/analysis` | safety score + bottleneck + max-flow |
| `POST` | `/buildings/{id}/incidents` | รายงานเหตุการณ์ (fire/smoke/crowd) |

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
├── render.yaml                   # Render deployment config
│
├── backend/
│   ├── main.py                   # FastAPI app + legacy endpoints
│   ├── database.py               # SQLAlchemy setup (SQLite / PostgreSQL)
│   ├── models.py                 # ORM: Building, Floor, Node, Edge, Incident
│   ├── schemas.py                # Pydantic request/response schemas
│   ├── graph_builder.py          # Building graph + weight formula
│   ├── dynamic_graph.py          # DB → NetworkX graph builder
│   ├── pathfinding.py            # Dijkstra + A* implementations
│   ├── fire_spread.py            # Physics-based fire spread (Dijkstra)
│   ├── smoke_propagation.py      # Continuous smoke level model
│   ├── analysis.py               # Safety score, bottleneck, max-flow
│   ├── weather.py                # TMD API integration
│   ├── storage.py                # File upload (local / Supabase)
│   ├── seed_demo.py              # Demo data seeder
│   ├── routers/
│   │   ├── buildings.py          # Building CRUD + simulation endpoints
│   │   ├── incidents.py          # Incident reporting
│   │   └── analysis.py           # Analysis endpoints
│   ├── test_graph_builder.py
│   ├── test_pathfinding.py
│   ├── test_smoke_propagation.py
│   ├── test_analysis.py
│   ├── test_fire_spread.py
│   └── requirements.txt
│
└── frontend/
    ├── package.json
    ├── .env                      # REACT_APP_API_URL
    └── src/
        ├── App.jsx
        └── components/
            ├── BuildingMap.jsx   # Cytoscape.js interactive floor plan
            ├── ControlPanel.jsx  # Fire/crowd/wind controls
            ├── IncidentPanel.jsx # Incident reporting UI
            ├── AnalysisPanel.jsx # Safety score + bottleneck display
            └── ResultsTable.jsx  # Routes + comparison table
```

---

## Quick start (Docker — แนะนำ)

```bash
docker compose up --build
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000   (Swagger UI: /docs)
```

Frontend container เป็น nginx + บิ้วล์ของ React มาเสร็จแล้ว, proxy `/api/*`
ไปที่ backend container ผ่าน Docker network — เปิดเบราว์เซอร์แล้วใช้งานได้
เลย ไม่ต้องตั้ง `REACT_APP_API_URL`

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
# 160 passed (พื้นฐาน 114 + auth + RBAC + API integration + pagination + rate limit)
```

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
curl http://localhost:8000/buildings/1/analysis | jq '.safety_score'
```
