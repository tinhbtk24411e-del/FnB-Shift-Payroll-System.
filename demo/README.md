# Demo không cần máy chấm công

Bộ demo này được tạo từ danh sách 33 nhân viên và cấu hình lương/phụ cấp đã cung cấp.
Dữ liệu mẫu có 800 bản ghi chấm công và được seed vào **tháng hiện tại**; thiết bị
giả lập có mã `DEMO-ZK01`. Seed chuyển ngày mẫu sang tháng hiện tại và tạo các ca
chờ duyệt trong những ngày sắp tới.

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

Script lấy các giờ chấm công mẫu từ `web/data/demo_attendance_october_2026.json`,
đổi ngày sang tháng hiện tại rồi nạp vào Supabase. Các file nhân viên, NOTE và
workflow chờ duyệt được đọc từ `demo/data/`.
Lần nạp thông thường sẽ dừng nếu database đã có mã nhân viên demo trùng; không chạy `--force`
trên database thật.

Nếu muốn tạo lại dữ liệu demo của tháng hiện tại:

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
- 800 bản ghi chấm công mô phỏng cho tháng hiện tại.
- `DEMO-ZK01` mô phỏng máy ZKTeco.
- Có 4 lượt vào/ra ở ca hành chính của quản lý để thể hiện ca gộp.
- 6 NOTE mẫu; theo schema hiện tại `adjustment_amount > 0` là trừ, `< 0` là cộng/bù.
- 3 ca `pending` và 2 đơn nghỉ `pending` để khách hàng xem workflow duyệt.

## Xoá dữ liệu chấm công demo

```bash
python cleanup_demo.py
```

Lệnh này chỉ xoá attendance có `device_id = DEMO-ZK01`; không xoá Auth user/hồ sơ.

## Kiểm tra máy chấm công thật (chưa đồng bộ dữ liệu)

Script kiểm tra riêng nằm tại [`agent/data/zk_device_check.py`](../agent/data/zk_device_check.py).
Nó chỉ thử kết nối, đọc giờ/firmware/serial và ngắt kết nối; không sửa máy hoặc tải
dữ liệu chấm công lên Supabase.

Trong PowerShell, cài dependencies và đặt cấu hình thiết bị trong phiên terminal hiện tại:

```powershell
python -m pip install -r agent/requirements.txt
$env:ZK_IP = "IP-noi-bo-cua-may"
$env:ZK_PORT = "4370"
$env:ZK_PASSWORD = "0"
python agent/data/zk_device_check.py
```

Không ghi IP nội bộ, mật khẩu máy hoặc khóa Supabase vào Git. Sau khi kiểm tra kết nối
thành công và cấu hình Supabase, agent đồng bộ thật có thể chạy bằng
`python agent/zk_sync_agent.py --once`. Dùng `--demo` để chạy với giờ chấm mẫu thay
vì kết nối thiết bị.

> Lưu ý: `seed_demo.py --force` dành cho database demo. Không chạy trên database nhân sự thật nếu chưa sao lưu.
