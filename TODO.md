# Project Status & Roadmap — Building Evacuation Simulation (EVAC·OPS)

> อัปเดตล่าสุด: 2026-07 (branch `claude/code-docs-review-gxqb17`)
> เอกสารนี้ track ว่าทำอะไรเสร็จแล้วและเหลืออะไร — README.md คือเอกสารอ้างอิงหลักของระบบ

## Context

ระบบจำลองการอพยพอาคารฉุกเฉิน (FastAPI + React + NetworkX) คำนวณเส้นทางหนีไฟ
แบบไดนามิกภายใต้ไฟไหม้ / ควัน / ความหนาแน่นฝูงชน ด้วย Dijkstra & A*,
fire-spread model, smoke-propagation model, safety-score analysis และลมจริงจาก TMD API

สถาปัตยกรรม: `backend/` (FastAPI) + `frontend/` (operator console, CRA) +
`user-app/` (mobile evacuee PWA, Vite)

---

## ✅ เสร็จแล้ว

### รากฐานวิศวกรรม (P0)
- [x] CI/CD — `.github/workflows/backend.yml` (ruff, mypy, pytest+coverage ≥70%, pip-audit)
      และ `frontend.yml` (lint + type-check + build ทั้ง 2 แอป, npm audit)
- [x] Tooling — `pyproject.toml` (ruff/mypy/pytest/coverage), `.pre-commit-config.yaml`,
      `.eslintrc.json` + `npm run lint` ทั้ง 2 แอป, `ruff format` ทั้ง backend แล้ว
- [x] `render.yaml` (backend + 2 static sites + Postgres) + `docker-compose.yml` ครบ 3 services
- [x] Alembic migrations `0001`–`0005` ตรงกับ `models.py`
- [x] ลบ frontend ซ้ำซ้อน — `design/` (30 ไฟล์) และไฟล์ตายใน `frontend/src` (~16 ไฟล์)
      ถูกลบออกแล้ว เหลือ 2 แอปชัดเจน: `frontend/` (console) + `user-app/` (evacuee)

### คุณภาพ & ความถูกต้อง (P1)
- [x] เทสต์ backend 259+ ตัว ครอบ pathfinding / fire / smoke / analysis / compliance /
      auth / RBAC / realtime / experiments / golden validation / storage / weather / audit
- [x] JWT_SECRET บังคับใน production (`ENV=production` → refuse to start; ตั้งใน render.yaml แล้ว)
- [x] CORS allow-list จาก env, security headers (HSTS/nosniff/frame-deny), rate limiting
- [x] Audit log ทุก mutation, pagination ทุก list endpoint, DB indexes (migration 0005)
- [x] Bugfix: realtime broadcast จาก sync endpoint (event loop capture),
      `/buildings/import` เก็บ metadata + ไม่ 500, experiments sweep ให้ผลจริงตามตัวแปร,
      A* heuristic admissible ทุก drawing scale, nginx WebSocket upgrade ทั้ง 2 แอป

### ฟีเจอร์ (P2)
- [x] Realtime — WebSocket `/buildings/{id}/ws` + hook ใช้จริงทั้ง console (SimulationPage)
      และ user-app (FloorMap) พร้อม auto-reconnect
- [x] Thai compliance engine 6 กฎ (Phase 2) + หน้า CompliancePage
- [x] Experiments framework + sensitivity sweep + CSV export (Phase 4) + ExperimentsPage
- [x] user-app: PWA offline (service worker), i18n ไทย/อังกฤษ, รายงาน incident anonymous
- [x] Structured JSON logging + request ID, `/health` เช็ค DB

---

## 🔜 งานที่เหลือ (เรียงตามความคุ้มค่า)

### สั้น
- [ ] เทสต์ frontend ชุดแรก (Vitest + React Testing Library) — `api/client`, simulation flow
- [ ] E2E smoke test (Playwright): login → เลือกอาคาร → จำลองไฟ → เห็นเส้นทาง
- [ ] Animation การอพยพตามเวลา (คนเคลื่อนตาม timestep) บน FloorPlan

### กลาง
- [ ] Redis pub/sub ใน `realtime.py` เพื่อรองรับ multi-instance deploy
- [ ] Dashboard สรุป safety score หลายอาคาร + แนวโน้ม
- [ ] Export รายงานจำลองเป็น PDF
- [ ] Geolocation ใน user-app → แนะนำ exit ใกล้สุดอัตโนมัติ

### ยาว
- [ ] Sentry / OpenTelemetry
- [ ] Performance test อาคารใหญ่ (nodes ~5000)
- [ ] Accessibility audit (keyboard nav, ARIA, contrast) ทั้ง 2 แอป

---

## การตรวจสอบ (Verification)

- **Backend:** `cd backend && RATE_LIMIT_ENABLED=0 pytest -q` ผ่านครบ +
  `ruff check backend/ && ruff format --check backend/` สะอาด
- **Frontend:** `npm run lint && npm run build` ผ่านทั้ง `frontend/` และ `user-app/`
  (+ `npx tsc --noEmit` ใน user-app)
- **Migrations:** `alembic upgrade head` บน DB เปล่าสำเร็จ
- **E2E manual:** `docker compose up --build` → seed → จำลองไฟ → เห็นเส้นทาง + safety score;
  รายงาน incident จาก user-app (:3001) แล้วเห็น update ทันทีบน console (:3000) ผ่าน WebSocket
