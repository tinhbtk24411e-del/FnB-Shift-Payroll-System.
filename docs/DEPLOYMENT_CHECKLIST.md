# Deployment checklist

## Supabase
- [ ] Chạy schema V2 hoặc migration V1→V2
- [ ] Cấu hình Auth Email
- [ ] Tạo manager đầu tiên
- [ ] Kiểm tra RLS
- [ ] Kiểm tra `v_payroll_days`

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
