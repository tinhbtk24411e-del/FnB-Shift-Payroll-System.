# Demo không cần máy chấm công

Bộ demo này được tạo từ danh sách 33 nhân viên và cấu hình lương/phụ cấp đã cung cấp.
Dữ liệu chấm công tháng **10/2026** được mô phỏng với **800 lượt/ngày nhân viên hợp lệ**,
thiết bị giả lập `DEMO-ZK01`.

## Cách nhanh nhất: chỉ xem giao diện demo

Chạy Next.js rồi mở:

```text
http://localhost:3000/demo
```

Trang này dùng JSON local, không cần ZKTeco và không cần đăng nhập.

## Cách nạp demo vào Supabase

1. Đã chạy `database/01_schema_v2.sql`.
2. Cấu hình `SUPABASE_URL` và **service-role secret key** trong `api/.env.local` hoặc `api/.env`.
   Publishable/anon key không có quyền seed. Không chia sẻ khóa service role và chỉ dùng database demo.
3. Chạy:

```bash
cd demo
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
python seed_demo.py
```

Script nạp chấm công trực tiếp từ `web/data/demo_attendance_october_2026.json`.
Các file nhân viên, NOTE và workflow chờ duyệt được đọc từ `demo/data/`.
Lần nạp thông thường sẽ dừng nếu database đã có mã nhân viên demo trùng; không chạy `--force`
trên database thật.

Nếu muốn tạo lại dữ liệu tháng 10/2026:

```bash
python seed_demo.py --force
```

### Tài khoản demo

```text
Quản lý:  QL01 / Demo123!
Nhân viên: PC01 / Demo123!
```

Tất cả nhân viên demo dùng mật khẩu `Demo123!`.

### Sau khi nạp

```text
http://localhost:3000/       -> PWA nhân viên
http://localhost:3000/admin  -> Quản lý / HRM / duyệt ca / bảng công / Excel
http://localhost:3000/demo   -> Demo tĩnh cho khách hàng, không cần login
```

## Dữ liệu workflow đã có

- 33 nhân viên: QL01 + 12 Pha chế + 8 Thu ngân + 12 Phục vụ.
- 800 lượt chấm công mô phỏng cho tháng 10/2026.
- `DEMO-ZK01` mô phỏng máy ZKTeco.
- Có 4 lượt vào/ra ở ca hành chính của quản lý để thể hiện ca gộp.
- 6 NOTE mẫu; theo schema hiện tại `adjustment_amount > 0` là trừ, `< 0` là cộng/bù.
- 3 ca `pending` và 2 đơn nghỉ `pending` để khách hàng xem workflow duyệt.

## Xoá dữ liệu chấm công demo

```bash
python cleanup_demo.py
```

Lệnh này chỉ xoá attendance có `device_id = DEMO-ZK01`; không xoá Auth user/hồ sơ.

> Lưu ý: `seed_demo.py --force` dành cho database demo. Không chạy trên database nhân sự thật nếu chưa sao lưu.
