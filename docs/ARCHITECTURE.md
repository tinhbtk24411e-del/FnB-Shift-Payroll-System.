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
   ├── FastAPI ── openpyxl ── Excel
   │
   └── Hardware Agent ── LAN ── ZKTeco/Ronald Jack
```
