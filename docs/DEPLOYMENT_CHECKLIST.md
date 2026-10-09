# Deployment checklist

## Supabase
- [ ] Chạy schema V2 hoặc migration V1→V2
- [ ] Cấu hình Auth Email
- [ ] Tạo manager đầu tiên
- [ ] Kiểm tra RLS
- [ ] Kiểm tra `v_payroll_days`
- [ ] Chạy `database/05_notifications.sql` trên DB TEST trước khi production
- [ ] Chạy `database/06_allow_resubmit_rejected_shift.sql` trên DB TEST để nhân viên gửi lại ca bị từ chối
- [ ] Xác nhận `public.notifications` thuộc publication `supabase_realtime`
- [ ] Thử RLS: tài khoản không đọc được notification của user khác

## API
- [ ] Tạo `api/.env`
- [ ] `/health` trả `{"ok":true}`
- [ ] Test export Excel
- [ ] CORS chỉ chứa domain frontend thật

## Web
- [ ] Tạo `web/.env.local`
- [ ] Cấu hình `SUPABASE_SERVICE_KEY` dưới dạng server-only Environment Variable trên Vercel; tuyệt đối không dùng tiền tố `NEXT_PUBLIC_`
- [ ] Redeploy web sau khi thêm `SUPABASE_SERVICE_KEY`; API quản lý nhân viên chạy cùng domain Vercel
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Test `/` và `/admin`
- [ ] Quản lý xuất Excel tại tab **Quản lý lương**; kiểm tra giờ công, lương, NOTE và tổng thu nhập
- [ ] Quản lý tạo nhân viên qua tab **Nhân viên**; tài khoản Auth, hồ sơ và lương giờ/phụ cấp đều được lưu
- [ ] Nhân viên đăng nhập bằng mã NV + mật khẩu đã tạo
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
