# Kiến trúc

```text
Next.js PWA
   │
   ├── Supabase Auth/RLS/Realtime ── PostgreSQL
   │                                  ├─ users
   │                                  ├─ shifts
   │                                  ├─ attendance_punches
   │                                  ├─ attendance_logs
   │                                  ├─ daily_notes
   │                                  └─ v_payroll_days
   │
   ├── Next.js APIs (/api/admin/payroll/export, /api/admin/schedule/export) ── ExcelJS ── Excel
   ├── FastAPI ── admin API / legacy export
   │
   └── Hardware Agent ── LAN ── ZKTeco/Ronald Jack
```
