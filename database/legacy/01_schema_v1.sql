-- Supabase / PostgreSQL schema: Quản lý ca làm & bảng lương
-- Đăng nhập: dùng Supabase Auth với email ảo  <emp_code>@company.local  (hoặc <sdt>@company.local) + mật khẩu.
-- => KHÔNG lưu password_hash trong bảng users (Supabase Auth đã băm mật khẩu).

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  emp_code text unique not null,
  full_name text not null,
  phone text unique,
  position text,                                   -- Chức vụ: Pha chế, Thu ngân, Phục vụ...
  role text not null default 'employee' check (role in ('employee','manager')),
  device_pin text,                                 -- mã NV trên máy chấm công (ZKTeco/Ronald Jack)
  bank_name text, bank_account_no text, bank_account_name text,
  is_active boolean not null default true
);

create table roles_rates (
  id bigserial primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  hourly_rate numeric(12,0) not null default 0,         -- LƯƠNG GIỜ
  allowance_per_shift numeric(12,0) not null default 0  -- PHỤ CẤP / ca
);

create table shifts (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  work_date date not null,
  check_in_1 time, check_out_1 time,
  check_in_2 time, check_out_2 time,               -- ca gộp (tuỳ chọn)
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  unique (user_id, work_date)
);

create table attendance_logs (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  device_id text,
  raw_check_in timestamptz, raw_check_out timestamptz,
  actual_hours numeric(5,2) generated always as (
    case when raw_check_in is not null and raw_check_out is not null
         then round((extract(epoch from raw_check_out - raw_check_in)/3600)::numeric, 2) end) stored
);

create table leave_requests (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  leave_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid references users(id)
);

create table daily_notes (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  note_date date not null,                         -- (đổi tên từ "date" để tránh từ khoá)
  note_text text,
  adjustment_amount numeric(12,0) not null default 0  -- dương = TRỪ (mua đồ/phạt), âm = CỘNG bù
);

create index on shifts (work_date, status);
create index on daily_notes (user_id, note_date);

-- ===== View gộp dữ liệu cho xuất Excel (ưu tiên giờ máy chấm công, không có thì lấy ca đã duyệt) =====
create view v_payroll_days as
with keys as (
  select user_id, work_date d from shifts where status = 'approved'
  union select user_id, note_date from daily_notes
), att as (
  select user_id, (raw_check_in at time zone 'Asia/Ho_Chi_Minh')::date d,
         min(raw_check_in at time zone 'Asia/Ho_Chi_Minh')::time ci,
         max(raw_check_out at time zone 'Asia/Ho_Chi_Minh')::time co
  from attendance_logs group by 1, 2
), nt as (
  select user_id, note_date d, string_agg(note_text, '; ' order by id) note_text, sum(adjustment_amount) adj
  from daily_notes group by 1, 2
)
select u.id user_id, u.emp_code, u.full_name, u.position,
       coalesce(r.hourly_rate,0) hourly_rate, coalesce(r.allowance_per_shift,0) allowance_per_shift,
       k.d work_date,
       coalesce(a.ci, s.check_in_1)  check_in_1,  coalesce(a.co, s.check_out_1) check_out_1,
       case when a.ci is null then s.check_in_2  end check_in_2,
       case when a.ci is null then s.check_out_2 end check_out_2,
       n.note_text, coalesce(n.adj,0) adjustment_amount
from keys k
join users u on u.id = k.user_id
left join roles_rates r on r.user_id = u.id
left join shifts s on s.user_id = k.user_id and s.work_date = k.d and s.status = 'approved'
left join att a on a.user_id = k.user_id and a.d = k.d
left join nt n on n.user_id = k.user_id and n.d = k.d;

-- ===== Row Level Security =====
create function is_manager() returns boolean language sql security definer stable as
$$ select exists (select 1 from users where id = auth.uid() and role = 'manager') $$;

alter table users enable row level security;
alter table roles_rates enable row level security;
alter table shifts enable row level security;
alter table attendance_logs enable row level security;
alter table leave_requests enable row level security;
alter table daily_notes enable row level security;

create policy users_read on users for select using (id = auth.uid() or is_manager());
create policy users_admin on users for all using (is_manager()) with check (is_manager());

create policy rates_read on roles_rates for select using (user_id = auth.uid() or is_manager());
create policy rates_admin on roles_rates for all using (is_manager()) with check (is_manager());

create policy shifts_read on shifts for select using (user_id = auth.uid() or is_manager());
create policy shifts_ins on shifts for insert with check (user_id = auth.uid() and status = 'pending');
create policy shifts_upd on shifts for update using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');
create policy shifts_admin on shifts for all using (is_manager()) with check (is_manager());

create policy att_read on attendance_logs for select using (user_id = auth.uid() or is_manager());
create policy att_admin on attendance_logs for all using (is_manager()) with check (is_manager());

create policy leave_read on leave_requests for select using (user_id = auth.uid() or is_manager());
create policy leave_ins on leave_requests for insert with check (user_id = auth.uid() and status = 'pending');
create policy leave_admin on leave_requests for all using (is_manager()) with check (is_manager());

create policy notes_read on daily_notes for select using (user_id = auth.uid() or is_manager());
create policy notes_admin on daily_notes for all using (is_manager()) with check (is_manager());
