-- Phase 2: bổ sung cho đồng bộ máy chấm công, tự lưu NOTE và thông báo realtime.
-- Chạy SAU 01_schema.sql.

-- 1) attendance_logs: mỗi (nhân viên, máy, ngày) đúng 1 dòng => agent upsert được, chạy lại không bị trùng
alter table attendance_logs add column if not exists work_date date;
update attendance_logs set work_date = (raw_check_in at time zone 'Asia/Ho_Chi_Minh')::date where work_date is null;
alter table attendance_logs alter column work_date set not null;
alter table attendance_logs alter column device_id set default 'ZK-01';
update attendance_logs set device_id = 'ZK-01' where device_id is null;
alter table attendance_logs alter column device_id set not null;
create unique index if not exists attendance_logs_uq on attendance_logs (user_id, device_id, work_date);

-- 2) daily_notes: mỗi nhân viên 1 ghi chú / ngày => ô NOTE trên Admin upsert được (auto-save)
create unique index if not exists daily_notes_uq on daily_notes (user_id, note_date);

-- 3) Bật Realtime để Admin thấy ca/đơn mới ngay, nhân viên nhận thông báo khi được duyệt
alter publication supabase_realtime add table shifts, leave_requests, attendance_logs, daily_notes;
