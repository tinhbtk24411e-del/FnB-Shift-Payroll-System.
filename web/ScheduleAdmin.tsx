"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Employee, Shift } from "@/lib/types";
import { useToast } from "./Toast";

type ScheduleShift = Shift & {
  users: Pick<Employee, "emp_code" | "full_name" | "position"> | null;
};
type ShiftPeriod = "morning" | "afternoon";

const WEEKDAYS = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];
const PERIODS: Record<ShiftPeriod, { label: string; start: string; end: string }> = {
  morning: { label: "Ca sáng", start: "06:00", end: "14:00" },
  afternoon: { label: "Chiều - tối", start: "14:00", end: "23:00" },
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const mondayOf = (date: Date) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const hoursBetween = (start: string | null, end: string | null) => {
  if (!start || !end) return 0;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return ((toMinutes(end) - toMinutes(start) + 1440) % 1440) / 60;
};
const isMorning = (shift: Shift) => (shift.check_in_1 ?? "00:00") < "12:00";

export default function ScheduleAdmin() {
  const { toast, node } = useToast();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));
  const [selectedPeriod, setSelectedPeriod] = useState<ShiftPeriod>("morning");
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      return date;
    }),
    [monday],
  );
  const startDate = iso(days[0]);
  const endDate = iso(days[6]);
  const selectedShifts = useMemo(
    () => shifts.filter((shift) => shift.work_date === selectedDate),
    [selectedDate, shifts],
  );
  const selectedShiftUserIds = useMemo(
    () => new Set(selectedShifts.filter((shift) => shift.status !== "rejected").map((shift) => shift.user_id)),
    [selectedShifts],
  );
  const candidates = employees.filter((employee) => !selectedShiftUserIds.has(employee.id));
  const pendingCount = shifts.filter((shift) => shift.status === "pending").length;

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    const [shiftResult, employeeResult] = await Promise.all([
      supabase.from("shifts")
        .select("*, users:users!shifts_user_id_fkey(emp_code, full_name, position)")
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date")
        .order("check_in_1"),
      supabase.from("users")
        .select("id, emp_code, full_name, position")
        .eq("role", "employee")
        .eq("is_active", true)
        .order("emp_code"),
    ]);
    if (shiftResult.error || employeeResult.error) {
      const errors = [
        shiftResult.error && `lịch ca: ${shiftResult.error.message}`,
        employeeResult.error && `nhân viên: ${employeeResult.error.message}`,
      ].filter(Boolean);
      toast("err", `Không tải được lịch xếp ca (${errors.join("; ")})`);
      setLoading(false);
      return;
    }
    setShifts((shiftResult.data ?? []) as ScheduleShift[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setLoading(false);
  }, [endDate, startDate, toast]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    const channel = supabase.channel("manager-weekly-schedule")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, loadSchedule)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadSchedule]);

  function moveWeek(offset: number) {
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + offset * 7);
    setMonday(nextMonday);
    setSelectedDate(iso(nextMonday));
  }

  async function approveShift(shift: ScheduleShift) {
    setBusyId(shift.id);
    const { data, error } = await supabase.from("shifts")
      .update({ status: "approved" })
      .eq("id", shift.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    setBusyId(null);
    if (error) {
      toast("err", `Không thể xếp ca cho ${shift.users?.full_name ?? "nhân viên"}: ${error.message}`);
      return;
    }
    if (!data) {
      toast("info", "Đăng ký này không còn ở trạng thái chờ duyệt. Hãy tải lại lịch.");
      await loadSchedule();
      return;
    }
    toast("ok", `Đã xếp ca cho ${shift.users?.full_name ?? "nhân viên"}`);
    await loadSchedule();
  }

  function beginEditingShift(shift: ScheduleShift) {
    setEditingShiftId(shift.id);
    setEditStart(shift.check_in_1?.slice(0, 5) ?? "");
    setEditEnd(shift.check_out_1?.slice(0, 5) ?? "");
  }

  async function saveShiftHours(shift: ScheduleShift) {
    if (!editStart || !editEnd || editStart === editEnd) {
      toast("err", "Vui lòng chọn giờ bắt đầu và giờ kết thúc khác nhau.");
      return;
    }

    setBusyId(shift.id);
    const { data, error } = await supabase.from("shifts")
      .update({
        check_in_1: editStart,
        check_out_1: editEnd,
        status: "approved",
      })
      .eq("id", shift.id)
      .eq("status", shift.status)
      .select("id")
      .maybeSingle();
    setBusyId(null);
    if (error) {
      toast("err", `Không thể cập nhật giờ làm: ${error.message}`);
      return;
    }
    if (!data) {
      toast("info", "Ca làm đã thay đổi ở nơi khác. Hãy tải lại lịch trước khi chỉnh sửa.");
      setEditingShiftId(null);
      await loadSchedule();
      return;
    }

    toast("ok", shift.status === "pending" ? "Đã cập nhật giờ và xếp ca thành công" : "Đã cập nhật giờ làm");
    setEditingShiftId(null);
    await loadSchedule();
  }

  async function addEmployee(employee: Employee) {
    const period = PERIODS[selectedPeriod];
    const previousRejected = selectedShifts.find(
      (shift) => shift.user_id === employee.id && shift.status === "rejected",
    );
    const confirmed = window.confirm(
      `Xác nhận bạn đã trao đổi trực tiếp và ${employee.full_name} đồng ý làm ${period.label.toLocaleLowerCase("vi")} ngày ${dayLabel(selectedDate)}?`,
    );
    if (!confirmed) return;

    setBusyId(employee.id);
    const result = previousRejected
      ? await supabase.from("shifts")
          .update({
            check_in_1: period.start,
            check_out_1: period.end,
            check_in_2: null,
            check_out_2: null,
            status: "approved",
          })
          .eq("id", previousRejected.id)
          .eq("status", "rejected")
          .select("id")
          .maybeSingle()
      : await supabase.from("shifts")
          .insert({
            user_id: employee.id,
            work_date: selectedDate,
            check_in_1: period.start,
            check_out_1: period.end,
            check_in_2: null,
            check_out_2: null,
            status: "approved",
          })
          .select("id")
          .single();
    setBusyId(null);
    if (result.error) {
      toast("err", `Không thể thêm ${employee.full_name} vào ca: ${result.error.message}`);
      return;
    }
    if (!result.data) {
      toast("info", "Đăng ký của nhân viên đã thay đổi. Hãy tải lại lịch trước khi thêm.");
      await loadSchedule();
      return;
    }
    toast("ok", `Đã xếp ${employee.full_name} vào ${period.label.toLocaleLowerCase("vi")}`);
    await loadSchedule();
  }

  const rangeLabel = `${days[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} – ${days[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const selectedDay = days.find((day) => iso(day) === selectedDate);

  return (
    <main className="min-h-screen bg-[#f3f4f6] px-3 py-4 text-slate-800 sm:px-5 sm:py-6 lg:px-8">
      {node}
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-orange-700">PEONY F&amp;B · QUẢN LÝ</p>
              <h1 className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">Lịch xếp ca</h1>
              <p className="mt-1 text-xs text-slate-500">Chọn ngày để duyệt đăng ký hoặc thêm nhân viên đã xác nhận làm ca.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1">
              <button type="button" onClick={() => moveWeek(-1)} aria-label="Tuần trước" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">‹</button>
              <span className="min-w-32 text-center text-xs font-bold text-slate-700">{rangeLabel}</span>
              <button type="button" onClick={() => moveWeek(1)} aria-label="Tuần sau" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">›</button>
              <button type="button" onClick={() => {
                const today = new Date();
                setMonday(mondayOf(today));
                setSelectedDate(iso(today));
              }} className="mr-1 rounded-lg bg-orange-50 px-2.5 py-2 text-[10px] font-bold text-orange-700 hover:bg-orange-100">Hôm nay</button>
            </div>
            <button type="button" onClick={loadSchedule} disabled={loading} className="h-9 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {loading ? "Đang tải…" : "Làm mới"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold">
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{pendingCount} đăng ký chờ xếp</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{employees.length} nhân viên đang hoạt động</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[125px_repeat(7,minmax(135px,1fr))] bg-[#202d3d] text-white">
                <div className="flex items-center px-4 text-[9px] font-bold uppercase tracking-wide text-slate-300">Khung giờ</div>
                {days.map((day, index) => {
                  const date = iso(day);
                  const isSelected = date === selectedDate;
                  return (
                    <button key={date} type="button" onClick={() => setSelectedDate(date)}
                      className={`border-l border-white/10 px-2 py-3 text-center transition hover:bg-white/10 ${isSelected ? "bg-orange-600/80" : ""}`}>
                      <span className="block text-[9px] font-bold uppercase text-slate-300">{WEEKDAYS[index]}</span>
                      <span className="mt-1 block text-xs font-extrabold">{dayLabel(date)}</span>
                      <span className="mt-1 block text-[9px] text-slate-300">{date === iso(new Date()) ? "Hôm nay" : ""}</span>
                    </button>
                  );
                })}
              </div>

              {(["morning", "afternoon"] as const).map((period) => (
                <div key={period} className="grid min-h-56 grid-cols-[125px_repeat(7,minmax(135px,1fr))] border-b border-slate-200 last:border-0">
                  <div className="flex flex-col justify-center bg-[#eff4ff] px-3 py-4">
                    <span className="text-xs font-extrabold text-orange-700">{period === "morning" ? "☀ " : "☾ "}{PERIODS[period].label}</span>
                    <span className="mt-1 text-[10px] font-medium text-slate-500">{PERIODS[period].start} – {PERIODS[period].end}</span>
                  </div>
                  {days.map((day) => {
                    const date = iso(day);
                    const dayShifts = shifts.filter((shift) =>
                      shift.work_date === date && isMorning(shift) === (period === "morning"),
                    );
                    const approved = dayShifts.filter((shift) => shift.status === "approved");
                    const totalHours = approved.reduce(
                      (sum, shift) => sum + hoursBetween(shift.check_in_1, shift.check_out_1),
                      0,
                    );
                    return (
                      <div key={date} className={`border-l border-slate-100 p-2 ${date === selectedDate ? "bg-orange-50/40" : ""}`}>
                        <div className="space-y-1.5">
                          {dayShifts.map((shift) => (
                            <button key={shift.id} type="button" onClick={() => setSelectedDate(date)}
                              className={`w-full rounded-lg border p-2 text-left transition hover:shadow-sm ${
                                shift.status === "approved" ? "border-emerald-100 bg-emerald-50/70" :
                                  shift.status === "pending" ? "border-amber-100 bg-amber-50/80" : "border-rose-100 bg-rose-50/70"
                              }`}>
                              <span className="flex items-center gap-1.5">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[8px] font-black text-orange-700 shadow-sm">
                                  {shift.users?.full_name?.slice(0, 1) ?? "?"}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-800">{shift.users?.full_name ?? "Nhân viên"}</span>
                                <span className="shrink-0 rounded bg-white/80 px-1 py-0.5 text-[8px] font-bold text-slate-600">{shift.check_in_1?.slice(0, 5) ?? "--:--"}</span>
                              </span>
                              <span className="mt-1 block truncate pl-7 text-[9px] text-slate-500">{shift.users?.position ?? "Nhân viên"} · {shift.status === "approved" ? "Đã xếp" : shift.status === "pending" ? "Chờ xếp" : "Đã từ chối"}</span>
                            </button>
                          ))}
                          {!dayShifts.length && !loading && <p className="py-4 text-center text-[10px] text-slate-400">Chưa có đăng ký</p>}
                        </div>
                        <button type="button" onClick={() => {
                          setSelectedDate(date);
                          setSelectedPeriod(period);
                        }} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[9px] font-semibold text-slate-500 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
                          + Thêm người
                        </button>
                        <p className="mt-2 text-center text-[9px] font-semibold text-orange-700">{totalHours.toFixed(1)} giờ · {approved.length} ca đã xếp</p>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">
            {loading ? "Đang tải lịch tuần…" : "Chọn ngày hoặc “Thêm người” để xem đăng ký và xếp nhân sự. Chỉ ca đã xếp mới được tính vào tổng giờ."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-4">
            <div className="mr-auto">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Chi tiết ngày</p>
              <h2 className="mt-1 text-base font-extrabold text-slate-900">
                {selectedDay?.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
              </h2>
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(["morning", "afternoon"] as const).map((period) => (
                <button key={period} type="button" onClick={() => setSelectedPeriod(period)}
                  className={`rounded-md px-3 py-2 text-[10px] font-bold ${selectedPeriod === period ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}>
                  {PERIODS[period].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 pt-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">Nhân viên đã đăng ký trong ngày</h3>
              {(["morning", "afternoon"] as const).map((period) => {
                const periodShifts = selectedShifts.filter((shift) => isMorning(shift) === (period === "morning"));
                return (
                  <div key={period} className="mt-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{PERIODS[period].label} · {periodShifts.length}</p>
                    {periodShifts.length ? <div className="space-y-2">{periodShifts.map((shift) => (
                      <div key={shift.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800">{shift.users?.full_name ?? "Nhân viên"}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{shift.users?.emp_code ?? "—"} · {shift.users?.position ?? "Chưa cập nhật vị trí"} · {shift.check_in_1?.slice(0, 5) ?? "--:--"}–{shift.check_out_1?.slice(0, 5) ?? "--:--"}</p>
                        </div>
                        {editingShiftId === shift.id ? (
                          <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                            <label className="text-[9px] font-semibold text-slate-500">Bắt đầu
                              <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)}
                                className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-800" />
                            </label>
                            <label className="text-[9px] font-semibold text-slate-500">Kết thúc
                              <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)}
                                className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-800" />
                            </label>
                            <button type="button" disabled={busyId === shift.id} onClick={() => saveShiftHours(shift)}
                              className="h-9 rounded-lg bg-orange-600 px-3 text-[10px] font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                              {busyId === shift.id ? "Đang lưu…" : shift.status === "pending" ? "Lưu & xếp ca" : "Lưu giờ"}
                            </button>
                            <button type="button" disabled={busyId === shift.id} onClick={() => setEditingShiftId(null)}
                              className="h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {shift.status === "pending" ? (
                              <button type="button" disabled={busyId === shift.id} onClick={() => approveShift(shift)}
                                className="rounded-lg bg-orange-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                                {busyId === shift.id ? "Đang xếp…" : "Xếp ca"}
                              </button>
                            ) : (
                              <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${shift.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                {shift.status === "approved" ? "Đã xếp ca" : "Đã từ chối"}
                              </span>
                            )}
                            {shift.status !== "rejected" && (
                              <button type="button" disabled={busyId === shift.id} onClick={() => beginEditingShift(shift)}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                                Chỉnh giờ
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}</div> : <p className="rounded-lg bg-slate-50 px-3 py-3 text-[10px] text-slate-400">Chưa có nhân viên đăng ký {PERIODS[period].label.toLocaleLowerCase("vi")}.</p>}
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl bg-[#f8f9fc] p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-orange-100 text-sm font-bold text-orange-700">+</span>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800">Thêm nhân viên chưa có ca</h3>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">Trao đổi trực tiếp với nhân viên trước. Chỉ thêm sau khi nhân viên xác nhận đồng ý.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-700">{PERIODS[selectedPeriod].label}</p>
                  <p className="mt-0.5 text-[9px] text-slate-500">{PERIODS[selectedPeriod].start} – {PERIODS[selectedPeriod].end}</p>
                </div>
                <span className="text-[9px] font-semibold text-slate-400">{candidates.length} người có thể thêm</span>
              </div>
              <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {candidates.map((employee) => {
                  const hadRejected = selectedShifts.some((shift) => shift.user_id === employee.id && shift.status === "rejected");
                  return (
                    <div key={employee.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-600">{employee.emp_code.slice(0, 2)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-bold text-slate-800">{employee.full_name}</p>
                        <p className="truncate text-[9px] text-slate-500">{employee.emp_code} · {employee.position ?? "Chưa cập nhật vị trí"}{hadRejected ? " · đăng ký trước đã bị từ chối" : ""}</p>
                      </div>
                      <button type="button" disabled={busyId === employee.id} onClick={() => addEmployee(employee)}
                        className="shrink-0 rounded-lg border border-orange-200 px-2.5 py-1.5 text-[9px] font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50">
                        {busyId === employee.id ? "Đang lưu…" : "Thêm vào ca"}
                      </button>
                    </div>
                  );
                })}
                {!candidates.length && <p className="rounded-lg bg-white px-3 py-4 text-center text-[10px] text-slate-400">Tất cả nhân viên đã có đăng ký hoặc ca trong ngày.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
