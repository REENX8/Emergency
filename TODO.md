# TODO List — Building Evacuation Simulation (EVAC·OPS)

## Context

โปรเจกต์นี้คือ **ระบบจำลองการอพยพอาคารฉุกเฉิน** (FastAPI + React + NetworkX) ที่คำนวณ
เส้นทางหนีไฟแบบไดนามิกภายใต้สภาวะไฟไหม้ / ควัน / ความหนาแน่นฝูงชน โดยใช้ Dijkstra & A*,
fire-spread model, smoke-propagation model และ safety-score analysis ดึงลมจริงจาก TMD API

จาก git log ระบบผ่าน **Phase 1 — Production Hardening** มาแล้ว (RBAC, pagination, rate limit,
audit log, Alembic, validation limits, ~160 backend tests) ตัว backend ค่อนข้างสมบูรณ์

ปัญหา/ช่องว่างหลักที่พบจากการสำรวจ tree + README ที่ต้องแก้เพื่อยกระดับเป็น "งานที่ดีที่สุด":
1. **มี frontend ซ้ำซ้อน 3 ตัว** (`frontend/`, `design/`, `user-app/`) — `design/` ปนทั้ง `.jsx` เก่า
   และ `.tsx` ใหม่ + ไฟล์ `.html` prototype ดิบ → สับสน ไม่รู้ตัวไหน canonical
2. **ไม่มี CI/CD** เลย (ไม่มี `.github/`) — 160 tests ไม่ถูกรันอัตโนมัติ
3. **ไม่มี linter/formatter config** (ไม่มี ruff/black/eslint/prettier)
4. **`render.yaml` หาย** ทั้งที่ README อ้างถึง — เป็น documentation drift
5. **`alembic/versions/` ดูเหมือนว่าง** (มีแค่ `env.py` + `script.py.mako`) แม้ README อ้างว่ามี `0001_baseline`
6. **ไม่มี frontend test เลย** สักตัว
7. ฟีเจอร์ realtime / observability / accessibility ยังขาด

> เป้าหมายเอกสารนี้: เป็น **todo list ฉบับเต็ม** จัดลำดับความสำคัญ เพื่อพัฒนาต่อให้ครบและมีคุณภาพระดับ production

---

## P0 — รากฐานวิศวกรรม (ต้องทำก่อน เพราะทุกอย่างพึ่งพา)

### 0.1 จัดบ้าน Repository & ลดความซ้ำซ้อนของ Frontend
- [ ] ตัดสินใจสถาปัตยกรรม frontend ให้ชัด: **2 แอป** = `console/` (operator dashboard) + `user-app/` (mobile evacuee)
- [ ] เลือก `design/` (เวอร์ชัน hi-fi TS) เป็นฐานของ operator console แล้ว **ลบ/archive `frontend/`** (CRA เก่า) และลบไฟล์ `.jsx` ที่ซ้ำใน `design/`
- [ ] ย้าย/แปลงไฟล์ `.jsx` ที่ยังใช้ใน `design/` (`BuildingMap.jsx`, `ControlPanel.jsx`, `AnalysisPanel.jsx`, `ResultsTable.jsx`, `IncidentPanel.jsx`, `pages/FloorEditor.jsx`, `pages/BuildingManager.jsx`, `pages/SimulationPage.jsx`) ให้เป็น `.tsx`
- [ ] ลบไฟล์ prototype ดิบ `design/EVAC·OPS Prototype.html` และโฟลเดอร์ `design/js/*.jsx` (tokens/data/panels/screens/floorplan/sim/app/tweaks-panel/simulation) ที่เป็น prototype ไม่ build
- [ ] รวม design tokens ให้เป็นแหล่งเดียว (`user-app/public/design-tokens.css` ↔ `design/styles.css`) เป็น shared package หรือไฟล์กลาง
- [ ] เขียน `CONTRIBUTING.md` + อัปเดต README ให้ตรงโครงสร้างจริงหลังจัดบ้าน

### 0.2 Tooling — Lint / Format / Type-check
- [ ] **Backend:** เพิ่ม `pyproject.toml` ตั้งค่า `ruff` (lint+format) + `mypy` (type check) + รวม config ของ `pytest`/coverage
- [ ] **Frontend (ทั้ง 2 แอป):** เพิ่ม `eslint` + `prettier` + เปิด `tsconfig` strict mode
- [ ] เพิ่ม `pre-commit` hooks (ruff, prettier, end-of-file-fixer, trailing-whitespace)
- [ ] รัน format/lint ทั้ง repo รอบแรกแล้ว commit แยก ("style: initial lint pass")

### 0.3 CI/CD (GitHub Actions)
- [ ] `.github/workflows/backend.yml` — รัน `ruff check`, `mypy`, `pytest` (`RATE_LIMIT_ENABLED=0`) + รายงาน coverage บน PR
- [ ] `.github/workflows/frontend.yml` — `eslint`, `tsc --noEmit`, `vitest`, `npm run build` ของทั้ง console และ user-app
- [ ] เพิ่ม branch protection + status checks บน `main`
- [ ] (ทางเลือก) workflow build & push Docker images

### 0.4 แก้ Documentation Drift & Deploy config
- [ ] สร้าง `render.yaml` จริงให้ตรง README (backend web service + 2 static sites + env vars) **หรือ** ลบการอ้างถึงออกจาก README/Project Structure
- [ ] ตรวจ `backend/alembic/versions/` — ถ้าว่างจริง ให้ `alembic revision --autogenerate -m baseline` สร้าง `0001_baseline` แล้ว commit (ปัจจุบัน README อ้างว่ามีแต่ tree ไม่เห็น)
- [ ] ตรวจ `docker-compose.yml` ให้ครอบ backend + console + user-app + (ทางเลือก) postgres ครบ

---

## P1 — คุณภาพ & ความถูกต้อง

### 1.1 ปิดช่องว่างเทสต์
- [ ] เพิ่มเทสต์ที่ยังขาดฝั่ง backend: `weather.py` (mock TMD API + fallback), `storage.py` (upload local/Supabase), `audit.py`, `auth.py` (token expiry/invalid), `analysis.py` edge cases (graph แยกส่วน, ไม่มี exit)
- [ ] เพิ่ม **frontend test ชุดแรก** (Vitest + React Testing Library) — `api/client` (auth header, error handling), components หลัก, simulation flow
- [ ] เพิ่ม coverage gate ใน CI (เช่น backend ≥ 80%)
- [ ] (ทางเลือก) E2E smoke test ด้วย Playwright: login → เลือก building → จำลองไฟ → เห็นเส้นทาง

### 1.2 ความทนทานของ Backend
- [ ] ตรวจสอบ error handling ครบทุก endpoint (404/422/409) + คืน error envelope รูปแบบเดียวกัน
- [ ] ตรวจ N+1 query ใน `dynamic_graph.py` / routers — ใส่ eager loading ตามจำเป็น
- [ ] เพิ่ม index ที่ FK / คอลัมน์ที่ filter บ่อย (`incidents.building_id`, `nodes.building_id`, `audit_logs.created_at`)
- [ ] ตรวจ pagination ให้ครอบ list endpoint ทุกตัวอย่างสม่ำเสมอ

### 1.3 ความปลอดภัย (Security Review)
- [ ] บังคับ `JWT_SECRET` ต้องตั้งใน production (ถ้าไม่ตั้ง → refuse to start แทน default ที่เดาได้)
- [ ] ตรวจ CORS: README บอกเคย "allow all origins" → ต้อง allow-list จาก env เท่านั้นใน prod
- [ ] เพิ่ม security headers (HSTS, X-Content-Type-Options, CSP) ที่ nginx / FastAPI middleware
- [ ] ตรวจ rate-limit anonymous incident endpoint กัน spam/abuse จาก mobile
- [ ] รัน `/security-review` กับ diff สุดท้าย + เพิ่ม `pip-audit` / `npm audit` ใน CI

---

## P2 — ฟีเจอร์ที่ยกระดับคุณค่าจริง

### 2.1 Realtime สำหรับสถานการณ์ฉุกเฉิน
- [ ] เพิ่ม **WebSocket** (หรือ SSE) ดัน incident/fire/smoke update ไปยัง operator console และ user-app แบบ live (แทน polling)
- [ ] user-app แสดงเส้นทางหนีไฟอัปเดตอัตโนมัติเมื่อสถานการณ์เปลี่ยน
- [ ] แสดง "live status" ของแต่ละ building บน dashboard

### 2.2 Simulation & Visualization
- [ ] **Animation การอพยพตามเวลา** บน BuildingMap (เห็นคนเคลื่อน + ควัน/ไฟลามตาม timestep)
- [ ] เปรียบเทียบ Dijkstra vs A* แบบ visual (เส้นทาง + node ที่สำรวจ + เวลา/ความเร็ว)
- [ ] Heatmap ความหนาแน่น/ควัน บน floor plan
- [ ] Floor editor ที่สมบูรณ์: วาด node/edge/exit, อัปโหลด floor plan, set capacity/width

### 2.3 ประสบการณ์ผู้ใช้ (Mobile evacuee — user-app)
- [ ] Geolocation / เลือกชั้นปัจจุบัน → แนะนำ exit ที่ใกล้และปลอดภัยที่สุด
- [ ] รองรับ offline (PWA + service worker) เพราะตอนไฟไหม้เน็ตอาจล่ม
- [ ] ภาษาไทย/อังกฤษ (i18n) + โหมดความเปรียบต่างสูง
- [ ] เสียง/สั่นเตือนทิศทาง

### 2.4 Analytics & Reporting
- [ ] หน้า dashboard สรุป safety score หลาย building + แนวโน้ม
- [ ] Export รายงานการจำลองเป็น PDF (เชื่อมกับ `evacuation_report_final.pdf` เป็น template)
- [ ] บันทึกประวัติการจำลอง (scenario) เพื่อเทียบผลก่อน/หลังปรับปรุงอาคาร

---

## P3 — Observability, Performance & ขัดเงา

- [ ] **Logging แบบ structured** (JSON) + request ID; ตอนนี้ `/metrics/web-vitals` แค่ log เฉยๆ
- [ ] เพิ่ม `/health` ให้ลึกขึ้น (เช็ค DB) + เพิ่ม readiness probe
- [ ] (ทางเลือก) Sentry / OpenTelemetry สำหรับ error & trace
- [ ] **Cache** ผลลัพธ์ graph build / pathfinding (มี `test_dynamic_graph_cache.py` อยู่แล้ว — ตรวจว่าครอบคลุมและขยาย)
- [ ] Performance test: จำลองอาคารใหญ่ (nodes ใกล้ลิมิต 5000) วัดเวลา response
- [ ] Accessibility audit (a11y) ทั้งสองแอป (keyboard nav, ARIA, contrast)
- [ ] อัปเดต README ให้สะท้อนสถาปัตยกรรม frontend ใหม่ + เพิ่ม diagram

---

## ไฟล์/จุดสำคัญที่จะแตะ (อ้างอิง)

| งาน | ไฟล์/โฟลเดอร์ |
|---|---|
| รวม frontend | `frontend/` (ลบ), `design/` → `console/`, `design/js/*` (ลบ), `design/*.jsx` → `.tsx` |
| Tooling | สร้าง `pyproject.toml`, `.eslintrc`, `.prettierrc`, `.pre-commit-config.yaml` |
| CI/CD | สร้าง `.github/workflows/backend.yml`, `frontend.yml` |
| Deploy | สร้าง `render.yaml`, ตรวจ `docker-compose.yml` |
| Migrations | `backend/alembic/versions/` (สร้าง baseline ถ้าว่าง) |
| Security | `backend/auth.py`, `backend/main.py` (CORS/secret), `*/nginx.conf` |
| Realtime | `backend/main.py` หรือ router ใหม่, `backend/routers/incidents.py` |
| Tests | `backend/test_weather.py` (ใหม่), `backend/test_storage.py` (ใหม่), frontend `*.test.tsx` (ใหม่) |

---

## การตรวจสอบ (Verification)

- **Backend:** `cd backend && RATE_LIMIT_ENABLED=0 pytest -v` → ต้องผ่านครบ + `ruff check .` + `mypy .` ไม่มี error
- **Migrations:** `alembic upgrade head` บน DB เปล่าแล้วสำเร็จ
- **Frontend:** `npm run lint && tsc --noEmit && npm test && npm run build` ผ่านทั้ง console และ user-app
- **CI:** เปิด PR ทดสอบ → ทุก workflow เขียว
- **E2E manual:** `docker compose up --build` → login → สร้าง/เลือก building → จำลองไฟ → เห็นเส้นทาง + safety score; รายงาน incident จาก user-app แล้วเห็นอัปเดตบน console
- **Security:** รัน `/security-review` กับ diff รวม + `pip-audit` / `npm audit` ไม่มีช่องโหว่ระดับ high

---

## หมายเหตุการ scope

> เอกสารนี้คือ todo list/แผนแบบครบ ถ้าต้องการ ผมสามารถ **commit เป็น `TODO.md`** ลง repo
> (branch `claude/todo-list-project-Lgt12`) ให้ได้หลังออกจาก plan mode
> และจะ **ลงมือทำทีละ P0 → P3** ตามที่คุณยืนยัน ไม่ทำรวดเดียวทั้งหมดโดยไม่ถาม
