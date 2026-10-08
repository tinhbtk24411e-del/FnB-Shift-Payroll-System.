"""Seed demo F&B data vào Supabase để trình diễn khi chưa có máy chấm công.

Nguồn dữ liệu attendance: web/data/demo_attendance_october_2026.json.
Các dữ liệu demo khác: demo/data/*.json.
Tài khoản demo: mã NV @company.local, mật khẩu mặc định Demo123!

Chạy lần đầu trên database demo trống:
    python seed_demo.py

Chạy lại / làm mới toàn bộ dữ liệu demo tháng 10/2026:
    python seed_demo.py --force

Script cố ý KHÔNG xoá auth user thật. --force chỉ làm mới các bản ghi demo của
tháng 10/2026 và cập nhật hồ sơ theo bộ nhân sự demo.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / "api" / ".env.local")
load_dotenv(ROOT.parent / "api" / ".env")
load_dotenv(ROOT / ".env")

DEMO_DEVICE = "DEMO-ZK01"
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Demo123!")
TZ = "+07:00"
ATTENDANCE_FILE = ROOT.parent / "web" / "data" / "demo_attendance_october_2026.json"


def sb_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY. Có thể dùng api/.env.")
    if key.startswith("sb_secret_"):
        is_service_key = True
    else:
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload))
            is_service_key = claims.get("role") == "service_role"
        except (IndexError, ValueError, binascii.Error):
            is_service_key = False
    if not is_service_key:
        raise SystemExit(
            "SUPABASE_SERVICE_KEY phải là khóa bí mật service_role; "
            "publishable/anon key không đủ quyền để nạp dữ liệu."
        )
    return create_client(url, key)


def load_json(name: str):
    import json
    path = ATTENDANCE_FILE if name == "attendance_october_2026.json" else ROOT / "data" / name
    return json.loads(path.read_text(encoding="utf-8"))


def auth_users_map(sb):
    try:
        resp = sb.auth.admin.list_users(page=1, per_page=100)
    except TypeError:
        resp = sb.auth.admin.list_users()
    users = getattr(resp, "users", None)
    if users is None and isinstance(resp, dict):
        users = resp.get("users", [])
    return {u.email.lower(): u for u in (users or []) if getattr(u, "email", None)}


def ensure_auth_user(sb, code: str, password: str, existing):
    email = f"{code.lower()}@company.local"
    if email in existing:
        uid = existing[email].id
        sb.auth.admin.update_user_by_id(uid, {"password": password, "email_confirm": True})
        return uid
    created = sb.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
    return created.user.id


def main(force: bool = False):
    staff = load_json("staff.json")
    attendance = load_json("attendance_october_2026.json")
    notes = load_json("daily_notes.json")
    pending = load_json("pending_workflows.json")
    codes = [x["code"] for x in staff]

    sb = sb_client()
    existing_rows = sb.table("users").select("id,emp_code,full_name,role").in_("emp_code", codes).execute().data or []
    if existing_rows and not force:
        codes_found = ", ".join(x["emp_code"] for x in existing_rows)
        raise SystemExit(
            "Đã có nhân viên trùng mã: " + codes_found +
            ". Nếu đây là database DEMO và muốn làm mới, chạy: python seed_demo.py --force"
        )

    if force:
        print("[1/6] Xoá dữ liệu demo tháng 10/2026...")
        demo_ids = [x["id"] for x in existing_rows]
        if demo_ids:
            sb.table("attendance_punches").delete().eq("device_id", DEMO_DEVICE).execute()
            sb.table("attendance_logs").delete().eq("device_id", DEMO_DEVICE).execute()
            sb.table("shifts").delete().gte("work_date", "2026-10-01").lte("work_date", "2026-10-31").in_("user_id", demo_ids).execute()
            sb.table("daily_notes").delete().gte("note_date", "2026-10-01").lte("note_date", "2026-10-31").in_("user_id", demo_ids).execute()
            sb.table("leave_requests").delete().gte("leave_date", "2026-10-01").lte("leave_date", "2026-10-31").in_("user_id", demo_ids).execute()

    print("[2/6] Tạo/cập nhật 33 tài khoản demo...")
    existing_auth = auth_users_map(sb)
    user_ids = {}
    for i, s in enumerate(staff, start=1):
        uid = ensure_auth_user(sb, s["code"], DEMO_PASSWORD, existing_auth)
        user_ids[s["code"]] = uid
        profile = {
            "id": uid,
            "emp_code": s["code"],
            "full_name": s["name"],
            "position": s["role"],
            "role": "manager" if s["role"] == "Quản lý" else "employee",
            "device_pin": s["code"],
            "is_active": True,
        }
        sb.table("users").upsert(profile, on_conflict="id").execute()
        sb.table("roles_rates").upsert({
            "user_id": uid,
            "hourly_rate": s["hourly_rate"],
            "allowance_per_shift": s["allowance"],
        }, on_conflict="user_id").execute()
        print(f"  {i:02d}. {s['code']} - {s['name']}")

    print("[3/6] Nạp 800 lượt chấm công / summary...")
    shift_rows = []
    log_rows = []
    punch_rows = []
    for r in attendance:
        uid = user_ids[r["emp_code"]]
        shift_rows.append({
            "user_id": uid,
            "work_date": r["work_date"],
            "check_in_1": r["check_in_1"],
            "check_out_1": r["check_out_1"],
            "check_in_2": r["check_in_2"],
            "check_out_2": r["check_out_2"],
            "status": "approved",
        })
        punch_times = [r["check_in_1"], r["check_out_1"], r["check_in_2"], r["check_out_2"]]
        for idx, hmss in enumerate([x for x in punch_times if x]):
            punch_rows.append({
                "user_id": uid,
                "device_id": DEMO_DEVICE,
                "device_pin": r["emp_code"],
                "punched_at": f"{r['work_date']}T{hmss}{TZ}",
                "verify_type": "face",
                "raw_status": "DEMO",
            })
        log_rows.append({
            "user_id": uid,
            "work_date": r["work_date"],
            "device_id": DEMO_DEVICE,
            "check_in_1": r["check_in_1"],
            "check_out_1": r["check_out_1"],
            "check_in_2": r["check_in_2"],
            "check_out_2": r["check_out_2"],
            "punch_count": len([x for x in punch_times if x]),
            "source": "device",
        })
    # Batches avoid large HTTP payloads.
    for start in range(0, len(shift_rows), 500):
        sb.table("shifts").upsert(shift_rows[start:start+500], on_conflict="user_id,work_date").execute()
    for start in range(0, len(punch_rows), 500):
        sb.table("attendance_punches").upsert(punch_rows[start:start+500], on_conflict="device_id,device_pin,punched_at").execute()
    for start in range(0, len(log_rows), 500):
        sb.table("attendance_logs").upsert(log_rows[start:start+500], on_conflict="user_id,work_date").execute()

    print("[4/6] Nạp NOTE/phạt/thưởng...")
    note_rows = [{
        "user_id": user_ids[n["emp_code"]],
        "note_date": n["date"],
        "note_text": n["note_text"],
        "adjustment_amount": n["adjustment_amount"],
    } for n in notes]
    sb.table("daily_notes").upsert(note_rows, on_conflict="user_id,note_date").execute()

    print("[5/6] Tạo dữ liệu chờ duyệt để demo workflow...")
    pending_shift_rows = [{
        "user_id": user_ids[x["emp_code"]], "work_date": x["date"],
        "check_in_1": x["in1"], "check_out_1": x["out1"],
        "check_in_2": None, "check_out_2": None, "status": "pending"
    } for x in pending["pending_shifts"]]
    sb.table("shifts").upsert(pending_shift_rows, on_conflict="user_id,work_date").execute()
    pending_leave_rows = [{
        "user_id": user_ids[x["emp_code"]], "leave_date": x["leave_date"],
        "reason": x["reason"], "status": "pending"
    } for x in pending["pending_leaves"]]
    sb.table("leave_requests").insert(pending_leave_rows).execute()

    print("[6/6] Hoàn tất.")
    print()
    print("=== TÀI KHOẢN DEMO ===")
    print("Quản lý : QL01 / " + DEMO_PASSWORD)
    print("Nhân viên: PC01 / " + DEMO_PASSWORD)
    print("Thiết bị giả lập: DEMO-ZK01")
    print("Tháng dữ liệu: 10/2026")
    print("Số lượt attendance: 800")
    print()
    print("Mở /admin để xem nhân viên, duyệt ca, bảng công và xuất Excel.")
    print("Mở /demo để xem demo tĩnh không cần máy chấm công hay đăng nhập.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true", help="Làm mới dữ liệu demo tháng 10/2026")
    args = p.parse_args()
    main(force=args.force)
