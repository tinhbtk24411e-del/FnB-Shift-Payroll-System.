-- Phase 3: đăng nhập bằng Mã NV / SĐT + tự huỷ ca khi duyệt đơn nghỉ. Chạy SAU 02_phase2.sql.

-- 1) Đổi "Mã NV hoặc SĐT" thành email đăng nhập (Supabase Auth cần email).
--    Cho phép gọi khi CHƯA đăng nhập (anon). Hệ quả: ai cũng dò được mã NV có tồn tại hay không.
create or replace function resolve_login(identifier text) returns text
language sql security definer stable set search_path = public as $$
  select lower(emp_code) || '@company.local'
  from users
  where is_active and (lower(emp_code) = lower(trim(identifier)) or phone = trim(identifier))
  limit 1
$$;
revoke all on function resolve_login(text) from public;
grant execute on function resolve_login(text) to anon, authenticated;

-- 2) Đơn nghỉ được duyệt => ca cùng ngày của nhân viên đó tự chuyển "Từ chối" (không vào bảng lương)
create or replace function on_leave_approved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update shifts set status = 'rejected'
    where user_id = new.user_id and work_date = new.leave_date and status <> 'rejected';
  end if;
  return new;
end $$;
drop trigger if exists trg_leave_approved on leave_requests;
create trigger trg_leave_approved after update on leave_requests
  for each row execute function on_leave_approved();
