# E2E smoke test (Playwright)

ทดสอบ flow จริงบนเบราว์เซอร์: operator console (login → simulation → เล่น
fire timeline เห็นผู้อพยพเคลื่อน) และ mobile user-app (เลือกอาคาร → เลือกชั้น
→ เห็นแผนผัง) พร้อมเก็บ screenshot ใน `e2e/shots/`

## วิธีรัน

```bash
# 1. backend + seed
cd backend
RATE_LIMIT_ENABLED=0 uvicorn main:app --port 8055 &
python seed_demo.py http://localhost:8055

# 2. build ทั้ง 2 แอปให้ชี้ backend ตรงๆ (ไม่ผ่าน nginx)
cd ../frontend && REACT_APP_API_URL=http://localhost:8055 npm run build
cd ../user-app  && VITE_API_URL=http://localhost:8055 npm run build

# 3. เสิร์ฟ build แบบ SPA-fallback
node e2e/spa-server.js frontend/build 3100 &
node e2e/spa-server.js user-app/dist  3101 &

# 4. รัน smoke test
npm install --no-save playwright   # ครั้งแรก (browser: npx playwright install chromium)
node e2e/smoke.js
# ตั้ง CHROMIUM_PATH ได้ถ้าใช้ chromium ที่ติดตั้งเองนอก playwright
```

ผลลัพธ์: exit 0 = ผ่านทุกขั้น, screenshot 5 ภาพใน `e2e/shots/`
(ถูก gitignore — เป็น artifact ต่อเครื่อง)
