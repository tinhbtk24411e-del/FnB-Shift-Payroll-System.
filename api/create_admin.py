"""Tạo tài khoản QUẢN LÝ đầu tiên (chỉ cần chạy 1 lần, sau đó tạo nhân viên ngay trên web).
Dùng:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python create_admin.py ADMIN "Quản lý" matkhau123
Đăng nhập web bằng mã NV 'ADMIN' + mật khẩu vừa đặt."""
import os, sys
from supabase import create_client

if len(sys.argv) != 4:
    sys.exit('Cách dùng: python create_admin.py <mã NV> "<họ tên>" <mật khẩu >= 6 ký tự>')
code, name, pwd = sys.argv[1:]
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
uid = sb.auth.admin.create_user({"email": f"{code.lower()}@company.local", "password": pwd, "email_confirm": True}).user.id
sb.table("users").insert({"id": uid, "emp_code": code, "full_name": name, "role": "manager", "position": "Quản lý"}).execute()
print("Đã tạo quản lý:", code, uid)
