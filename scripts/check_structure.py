from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
required=[
'database/01_schema_v2.sql','database/04_upgrade_v1_to_v2.sql',
'api/main.py','api/requirements.txt','agent/zk_sync_agent.py','agent/requirements.txt',
'web/package.json','web/app/page.tsx','web/app/admin/page.tsx',
'web/lib/supabase.ts','web/lib/types.ts','web/Toast.tsx',
'demo/seed_demo.py','demo/requirements.txt','web/app/demo/page.tsx','web/data/demo_employees.json']
missing=[p for p in required if not (ROOT/p).exists()]
if missing: raise SystemExit('Missing files:\n'+'\n'.join(missing))
print(f'OK: {len(required)} required files present')
