# Deployment checklist

## Supabase
- [ ] Chạy schema V2 hoặc migration V1→V2
- [ ] Cấu hình Auth Email
- [ ] Tạo manager đầu tiên
- [ ] Kiểm tra RLS
- [ ] Kiểm tra `v_payroll_days`
- [ ] Chạy `database/05_notifications.sql` trên DB TEST trước khi production
- [ ] Xác nhận `public.notifications` thuộc publication `supabase_realtime`
- [ ] Thử RLS: tài khoản không đọc được notification của user khác

## API
- [ ] Tạo `api/.env`
- [ ] `/health` trả `{"ok":true}`
- [ ] Test export Excel
- [ ] CORS chỉ chứa domain frontend thật

## Web
- [ ] Tạo `web/.env.local`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Test `/` và `/admin`
- [ ] PC01 gửi ca pending → QL01 nhận badge/thông báo Realtime
- [ ] QL01 đánh dấu thông báo đã đọc và mở màn duyệt ca
- [ ] PC01 truy cập `/admin` → được chuyển về trang nhân viên

## Agent
- [ ] Ping máy chấm công
- [ ] Gán `users.device_pin`
- [ ] Chạy `--once --days 30`
- [ ] Kiểm tra `attendance_punches`
- [ ] Kiểm tra `attendance_logs`

## Payroll
- [ ] Ca 1
- [ ] Ca gộp 2 cặp
- [ ] NOTE dương
- [ ] NOTE âm
- [ ] Không có attendance
- [ ] Excel cuối tháng
