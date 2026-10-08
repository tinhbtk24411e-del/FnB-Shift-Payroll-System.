"""Xoá attendance/demo workflow tháng 10/2026 theo device_id DEMO-ZK01.
Không xoá Auth user và không xoá hồ sơ nhân viên.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT=Path(__file__).resolve().parent
load_dotenv(ROOT.parent/'api'/'.env')
load_dotenv(ROOT/'.env')
url=os.environ['SUPABASE_URL']; key=os.environ['SUPABASE_SERVICE_KEY']
sb=create_client(url,key)

sb.table('attendance_punches').delete().eq('device_id','DEMO-ZK01').execute()
sb.table('attendance_logs').delete().eq('device_id','DEMO-ZK01').execute()
print('Đã xoá dữ liệu chấm công DEMO-ZK01. Hồ sơ/Auth user vẫn giữ nguyên.')
