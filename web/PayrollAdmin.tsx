"use client";
// Trang quản lý: duyệt ca, xem phiếu lương từng người và tổng hợp kỳ lương.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Employee, LeaveRequest, PayrollDay, Shift, Status } from "@/lib/types";
import { useToast } from "./Toast";

type ShiftJ = Shift & { users: { emp_code: string; full_name: string } };
type LeaveJ = LeaveRequest & { users: { emp_code: string; full_name: string } };
type NoteDraft = { text: string; amount: string };
type Saved = "saving" | "saved" | "error";
type ManagerView = "approve" | "detail" | "overview";
type PayrollSummary = {
  employee: Employee;
  days: number;
  hours: number;
  gross: number;
  adjustment: number;
  net: number;
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const span = (a: string | null, b: string | null) => (a && b ? ((mins(b) - mins(a) + 1440) % 1440) / 60 : 0);
const money = (n: number) => Math.round(n).toLocaleString("vi-VN") + " đ";
const pad = (n: number) => String(n).padStart(2, "0");
const shiftHours = (row: PayrollDay) =>
  span(row.check_in_1, row.check_out_1) + span(row.check_in_2, row.check_out_2);
const shiftPay = (row: PayrollDay) =>
  shiftHours(row) * row.hourly_rate + (row.check_in_1 && row.check_out_1 ? row.allowance_per_shift : 0);

export default function PayrollAdmin() {
  const { toast, node } = useToast();
  const now = new Date();
  const [view, setView] = useState<ManagerView>("approve");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");

  const [shifts, setShifts] = useState<ShiftJ[]>([]);
  const [leaves, setLeaves] = useState<LeaveJ[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [emps, setEmps] = useState<Employee[]>([]);
  const [empId, setEmpId] = useState("");
  const [days, setDays] = useState<Record<string, PayrollDay>>({});
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({});
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [summaryRows, setSummaryRows] = useState<PayrollDay[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const monthDays = useMemo(
    () => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
    [year, month],
  );
  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  const loadPending = useCallback(async () => {
    const [shiftResult, leaveResult] = await Promise.all([
      supabase.from("shifts").select("*, users(emp_code, full_name)").eq("status", "pending").order("work_date"),
      supabase.from("leave_requests").select("*, users(emp_code, full_name)").eq("status", "pending").order("leave_date"),
    ]);
    if (shiftResult.error || leaveResult.error) {
      toast("err", `Không tải được danh sách chờ duyệt: ${shiftResult.error?.message ?? leaveResult.error?.message}`);
      return;
    }
    setShifts((shiftResult.data ?? []) as ShiftJ[]);
    setLeaves((leaveResult.data ?? []) as LeaveJ[]);
    setPicked(new Set());
  }, [toast]);

  const loadTimesheet = useCallback(async () => {
    if (!empId) return;
    const { data, error } = await supabase.from("v_payroll_days").select("*").eq("user_id", empId)
      .gte("work_date", monthDays[0]).lte("work_date", monthDays[monthDays.length - 1]);
    if (error) {
      toast("err", "Không tải được bảng công: " + error.message);
      return;
    }
    const rows = (data ?? []) as PayrollDay[];
    const nextDays: Record<string, PayrollDay> = {};
    const nextDrafts: Record<string, NoteDraft> = {};
    rows.forEach((row) => {
      nextDays[row.work_date] = row;
      nextDrafts[row.work_date] = {
        text: row.note_text ?? "",
        amount: row.adjustment_amount ? String(row.adjustment_amount) : "",
      };
    });
    setDays(nextDays);
    setDrafts(nextDrafts);
    setSaved({});
  }, [empId, monthDays, toast]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    const rows: PayrollDay[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from("v_payroll_days").select("*")
        .gte("work_date", monthDays[0]).lte("work_date", monthDays[monthDays.length - 1])
        .order("work_date").range(start, start + 999);
      if (error) {
        setSummaryRows([]);
        setSummaryError("Không tải được tổng hợp lương: " + error.message);
        setSummaryLoading(false);
        return;
      }
      rows.push(...((data ?? []) as PayrollDay[]));
      if (!data || data.length < 1000) break;
    }
    setSummaryRows(rows);
    setSummaryLoading(false);
  }, [monthDays]);

  useEffect(() => {
    let active = true;
    supabase.from("users").select("id, emp_code, full_name, position")
      .eq("is_active", true).eq("role", "employee").order("emp_code")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast("err", "Không tải được danh sách nhân viên: " + error.message);
          return;
        }
        const employees = (data ?? []) as Employee[];
        setEmps(employees);
        setEmpId((previous) => previous || employees[0]?.id || "");
      });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    if (view === "approve") loadPending();
  }, [loadPending, view]);
  useEffect(() => {
    if (view === "detail") loadTimesheet();
  }, [loadTimesheet, view]);
  useEffect(() => {
    if (view === "overview") loadSummary();
  }, [loadSummary, view]);

  useEffect(() => {
    const channel = supabase.channel("admin-payroll-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        if (view === "approve") loadPending();
        if (view === "detail") loadTimesheet();
        if (view === "overview") loadSummary();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        if (view === "approve") loadPending();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => {
        if (view === "detail") loadTimesheet();
        if (view === "overview") loadSummary();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPending, loadSummary, loadTimesheet, view]);

  async function reviewShifts(ids: number[], status: Exclude<Status, "pending">) {
    if (!ids.length) return;
    const { error } = await supabase.from("shifts").update({ status }).in("id", ids);
    if (error) {
      toast("err", "Không thể cập nhật ca: " + error.message);
      return;
    }
    toast("ok", `${status === "approved" ? "Đã duyệt" : "Đã từ chối"} ${ids.length} ca`);
    loadPending();
  }

  async function reviewLeave(id: number, status: Exclude<Status, "pending">) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      toast("err", "Không xác minh được tài khoản quản lý.");
      return;
    }
    const { error } = await supabase.from("leave_requests").update({ status, approved_by: user.id }).eq("id", id);
    if (error) {
      toast("err", "Không thể cập nhật đơn nghỉ: " + error.message);
      return;
    }
    toast("ok", status === "approved" ? "Đã duyệt đơn nghỉ" : "Đã từ chối đơn nghỉ");
    loadPending();
  }

  function editNote(date: string, patch: Partial<NoteDraft>) {
    if (!empId) return;
    const next = { ...(drafts[date] ?? { text: "", amount: "" }), ...patch };
    setDrafts((previous) => ({ ...previous, [date]: next }));
    setSaved((previous) => ({ ...previous, [date]: "saving" }));
    clearTimeout(timers.current[date]);
    timers.current[date] = setTimeout(async () => {
      const amount = Number(next.amount.replace(/[.,\s]/g, "")) || 0;
      const result = !next.text.trim() && !amount
        ? await supabase.from("daily_notes").delete().eq("user_id", empId).eq("note_date", date)
        : await supabase.from("daily_notes").upsert(
            { user_id: empId, note_date: date, note_text: next.text.trim() || null, adjustment_amount: amount },
            { onConflict: "user_id,note_date" });
      setSaved((previous) => ({ ...previous, [date]: result.error ? "error" : "saved" }));
      if (result.error) toast("err", `Lưu NOTE ngày ${date} thất bại: ${result.error.message}`);
    }, 800);
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) throw new Error("Không xác minh được phiên đăng nhập quản lý.");
      const api = process.env.NEXT_PUBLIC_PAYROLL_API;
      if (!api) throw new Error("Chưa cấu hình NEXT_PUBLIC_PAYROLL_API.");
      const response = await fetch(`${api}/export-payroll?month=${month}&year=${year}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail ?? response.statusText);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: `bang-luong-${year}-${pad(month)}.xlsx`,
      });
      link.click();
      URL.revokeObjectURL(url);
      toast("ok", "Đã tải bảng lương");
    } catch (error) {
      toast("err", "Xuất Excel thất bại: " + (error instanceof Error ? error.message : "Lỗi không xác định"));
    } finally {
      setExporting(false);
    }
  }

  const payroll = useMemo<PayrollSummary[]>(() => {
    const grouped = new Map<string, PayrollDay[]>();
    summaryRows.forEach((row) => {
      const group = grouped.get(row.user_id) ?? [];
      group.push(row);
      grouped.set(row.user_id, group);
    });
    return emps.map((employee) => {
      const employeeRows = grouped.get(employee.id) ?? [];
      const gross = employeeRows.reduce((sum, row) => sum + shiftPay(row), 0);
      const adjustment = employeeRows.reduce((sum, row) => sum + row.adjustment_amount, 0);
      return {
        employee,
        days: employeeRows.filter((row) => shiftHours(row) > 0).length,
        hours: employeeRows.reduce((sum, row) => sum + shiftHours(row), 0),
        gross,
        adjustment,
        net: gross - adjustment,
      };
    });
  }, [emps, summaryRows]);
  const filteredPayroll = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    if (!query) return payroll;
    return payroll.filter(({ employee }) =>
      `${employee.emp_code} ${employee.full_name} ${employee.position ?? ""}`.toLocaleLowerCase("vi").includes(query));
  }, [payroll, search]);
  const payrollTotals = useMemo(() => payroll.reduce((total, row) => ({
    days: total.days + row.days,
    hours: total.hours + row.hours,
    gross: total.gross + row.gross,
    adjustment: total.adjustment + row.adjustment,
    net: total.net + row.net,
  }), { days: 0, hours: 0, gross: 0, adjustment: 0, net: 0 }), [payroll]);
  const detailRows = useMemo(
    () => Object.values(days).sort((a, b) => a.work_date.localeCompare(b.work_date)),
    [days],
  );
  const detailTotals = useMemo(() => detailRows.reduce((total, row) => {
    const hours = shiftHours(row);
    const gross = shiftPay(row);
    return {
      days: total.days + (hours > 0 ? 1 : 0),
      hours: total.hours + hours,
      gross: total.gross + gross,
      adjustment: total.adjustment + row.adjustment_amount,
    };
  }, { days: 0, hours: 0, gross: 0, adjustment: 0 }), [detailRows]);
  const detailEmployee = emps.find((employee) => employee.id === empId);
  const detailNet = detailTotals.gross - detailTotals.adjustment;
  const th = "px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";

  const views: { id: ManagerView; title: string; subtitle: string }[] = [
    { id: "approve", title: "Duyệt ca & bảng công", subtitle: "Duyệt đăng ký ca và đơn nghỉ" },
    { id: "detail", title: "Bảng lương chi tiết", subtitle: "Phiếu lương và NOTE từng ngày" },
    { id: "overview", title: "Bảng lương tổng hợp", subtitle: "Tổng thu nhập theo nhân viên" },
  ];

  return (
    <main className="min-h-screen bg-[#f3f4f6] px-3 py-4 text-slate-800 sm:px-5 sm:py-6 lg:px-8">
      {node}
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-orange-700">PEONY F&amp;B · QUẢN LÝ</p>
              <h1 className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">{views.find((item) => item.id === view)?.title}</h1>
              <p className="mt-1 text-xs text-slate-500">{views.find((item) => item.id === view)?.subtitle} · {periodLabel}</p>
            </div>
            <div className="flex w-full items-end gap-2 sm:w-auto">
              <label className="flex-1 text-[10px] font-semibold text-slate-500 sm:flex-none">Tháng
                <select value={month} onChange={(event) => setMonth(+event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 sm:w-24">
                  {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
                </select>
              </label>
              <label className="flex-1 text-[10px] font-semibold text-slate-500 sm:flex-none">Năm
                <input type="number" value={year} onChange={(event) => setYear(+event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-800 sm:w-24" />
              </label>
              <button type="button" onClick={exportXlsx} disabled={exporting} className="h-9 flex-1 rounded-lg bg-orange-600 px-3 text-[11px] font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:flex-none">
                {exporting ? "Đang xuất…" : "Xuất Excel"}
              </button>
            </div>
          </div>
          <nav aria-label="Màn hình quản lý" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {views.map((item) => (
              <button key={item.id} type="button" onClick={() => setView(item.id)}
                className={`min-h-10 rounded-lg px-2 py-1.5 text-[10px] font-bold leading-tight transition sm:text-xs ${view === item.id ? "bg-white text-orange-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {item.title}
                {item.id === "approve" && (shifts.length + leaves.length) > 0 && <span className="ml-1 inline-flex min-w-4 justify-center rounded-full bg-rose-100 px-1 text-[9px] text-rose-700">{shifts.length + leaves.length}</span>}
              </button>
            ))}
          </nav>
        </section>

        {view === "approve" ? (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Ca chờ duyệt", shifts.length, "text-orange-700 bg-orange-50"],
                ["Đơn xin nghỉ", leaves.length, "text-rose-700 bg-rose-50"],
                ["Nhân viên hoạt động", emps.length, "text-emerald-700 bg-emerald-50"],
                ["Kỳ lương", `${pad(month)}/${year}`, "text-blue-700 bg-blue-50"],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-medium text-slate-500">{label}</p>
                  <p className={`mt-2 inline-flex min-w-8 justify-center rounded-lg px-2 py-1 text-base font-extrabold ${color}`}>{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-sm font-extrabold">Ca làm chờ duyệt <span className="text-orange-700">({shifts.length})</span></h2><p className="mt-1 text-[10px] text-slate-400">Chọn ca cần xử lý hoặc duyệt toàn bộ</p></div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => reviewShifts([...picked], "approved")} disabled={!picked.size} className="h-9 rounded-lg border border-orange-200 px-3 text-[10px] font-bold text-orange-700 disabled:opacity-40">Duyệt đã chọn</button>
                  <button type="button" onClick={() => reviewShifts(shifts.map((shift) => shift.id), "approved")} disabled={!shifts.length} className="h-9 rounded-lg bg-orange-600 px-3 text-[10px] font-bold text-white disabled:opacity-40">Duyệt tất cả</button>
                </div>
              </div>
              <div className="space-y-2">
                {shifts.map((shift) => (
                  <article key={shift.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" aria-label={`Chọn ca ${shift.users.full_name}`} checked={picked.has(shift.id)}
                        onChange={() => setPicked((previous) => {
                          const next = new Set(previous);
                          next.has(shift.id) ? next.delete(shift.id) : next.add(shift.id);
                          return next;
                        })} className="mt-1 accent-orange-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div><p className="text-xs font-bold text-slate-800">{shift.users.full_name} <span className="font-medium text-slate-400">({shift.users.emp_code})</span></p><p className="mt-0.5 text-[10px] text-slate-500">{new Date(`${shift.work_date}T00:00:00`).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })} · {hm(shift.check_in_1)} – {hm(shift.check_out_1)}</p></div>
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">Chờ duyệt</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => reviewShifts([shift.id], "rejected")} className="h-8 rounded-lg bg-rose-50 text-[10px] font-bold text-rose-700 hover:bg-rose-100">Từ chối</button>
                          <button type="button" onClick={() => reviewShifts([shift.id], "approved")} className="h-8 rounded-lg bg-orange-600 text-[10px] font-bold text-white hover:bg-orange-700">Duyệt ca</button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {!shifts.length && <p className="rounded-xl bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">Không có ca nào chờ duyệt</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3"><h2 className="text-sm font-extrabold">Đơn xin nghỉ <span className="text-orange-700">({leaves.length})</span></h2><p className="mt-1 text-[10px] text-slate-400">Các đơn đang chờ xử lý</p></div>
              <div className="space-y-2">
                {leaves.map((leave) => (
                  <article key={leave.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-xs font-bold">{leave.users.full_name} <span className="font-medium text-slate-400">({leave.users.emp_code})</span></p><p className="mt-1 text-[10px] text-slate-500">{new Date(`${leave.leave_date}T00:00:00`).toLocaleDateString("vi-VN")} · {leave.reason || "Không có lý do"}</p></div>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">Chờ duyệt</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => reviewLeave(leave.id, "rejected")} className="h-8 rounded-lg bg-rose-50 text-[10px] font-bold text-rose-700 hover:bg-rose-100">Từ chối</button>
                      <button type="button" onClick={() => reviewLeave(leave.id, "approved")} className="h-8 rounded-lg bg-orange-600 text-[10px] font-bold text-white hover:bg-orange-700">Duyệt đơn</button>
                    </div>
                  </article>
                ))}
                {!leaves.length && <p className="rounded-xl bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">Không có đơn nghỉ nào chờ duyệt</p>}
              </div>
            </section>
          </div>
        ) : view === "detail" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <label className="block text-[10px] font-bold text-slate-500">Nhân viên
                <select value={empId} onChange={(event) => setEmpId(event.target.value)} className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800">
                  {emps.map((employee) => <option key={employee.id} value={employee.id}>{employee.emp_code} · {employee.full_name}</option>)}
                </select>
              </label>
              {detailEmployee && <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-sm font-extrabold text-orange-700">{detailEmployee.full_name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1)}</div>
                <div><p className="text-xs font-bold">{detailEmployee.full_name} <span className="text-orange-700">({detailEmployee.emp_code})</span></p><p className="mt-1 text-[10px] text-slate-500">{detailEmployee.position || "Nhân viên"} · Kỳ lương {periodLabel}</p></div>
              </div>}
            </section>

            <section className="rounded-2xl bg-gradient-to-br from-[#26384e] to-[#14263b] p-4 text-white shadow-md sm:p-5">
              <p className="text-[10px] text-slate-300">THỰC NHẬN ƯỚC TÍNH</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">{money(detailNet)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-4">
                <div><p className="text-[9px] text-slate-400">Tổng giờ</p><p className="mt-1 text-xs font-bold">{detailTotals.hours.toFixed(2)} giờ</p></div>
                <div><p className="text-[9px] text-slate-400">Ngày công</p><p className="mt-1 text-xs font-bold">{detailTotals.days} ngày</p></div>
                <div><p className="text-[9px] text-slate-400">Lương công</p><p className="mt-1 text-xs font-bold">{money(detailTotals.gross)}</p></div>
                <div><p className="text-[9px] text-slate-400">Điều chỉnh</p><p className="mt-1 text-xs font-bold">{detailTotals.adjustment > 0 ? "−" : "+"}{money(Math.abs(detailTotals.adjustment))}</p></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <div><h2 className="text-sm font-extrabold">Nhật ký chấm công &amp; Thu chi</h2><p className="mt-1 text-[10px] text-slate-400">NOTE tự lưu sau khi bạn ngừng nhập</p></div>
                <span className="rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold text-orange-700">{detailRows.length} ngày</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead className="bg-slate-50"><tr><th className={th}>Ngày</th><th className={th}>Vào – Ra</th><th className={`${th} text-right`}>Giờ</th><th className={th}>NOTE</th><th className={`${th} w-32`}>Điều chỉnh</th><th className={th}>Trạng thái</th></tr></thead>
                  <tbody>{monthDays.map((date) => {
                    const row = days[date];
                    const draft = drafts[date] ?? { text: "", amount: "" };
                    const hours = row ? shiftHours(row) : 0;
                    return <tr key={date} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{date.slice(8)}/{date.slice(5, 7)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row?.check_in_1 ? `${hm(row.check_in_1)} – ${hm(row.check_out_1)}${row.check_in_2 ? ` · ${hm(row.check_in_2)} – ${hm(row.check_out_2)}` : ""}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{hours ? hours.toFixed(2) : "—"}</td>
                      <td className="min-w-48 p-2"><input value={draft.text} onChange={(event) => editNote(date, { text: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-[11px] outline-none focus:border-orange-400" placeholder="Thêm NOTE…" /></td>
                      <td className="p-2"><input inputMode="numeric" value={draft.amount} onChange={(event) => editNote(date, { amount: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-right text-[11px] outline-none focus:border-orange-400" placeholder="0" /></td>
                      <td className="px-3 py-2.5 text-[10px]">{saved[date] === "saving" ? <span className="text-slate-400">Đang lưu…</span> : saved[date] === "saved" ? <span className="text-emerald-700">Đã lưu</span> : saved[date] === "error" ? <span className="text-rose-600">Lỗi lưu</span> : row ? <span className="text-blue-700">Đã chấm công</span> : <span className="text-slate-300">—</span>}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <p className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500">Quy ước điều chỉnh: số dương là trừ, số âm là cộng/bù.</p>
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            {summaryError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{summaryError}</p> : null}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Nhân viên", `${payroll.length}`, "text-slate-800 bg-slate-100"],
                ["Tổng giờ công", `${payrollTotals.hours.toFixed(1)}h`, "text-blue-700 bg-blue-50"],
                ["Lương gộp", money(payrollTotals.gross), "text-orange-700 bg-orange-50"],
                ["Thực nhận", money(payrollTotals.net), "text-emerald-700 bg-emerald-50"],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-medium text-slate-500">{label}</p><p className={`mt-2 inline-block rounded-lg px-2 py-1 text-xs font-extrabold ${color}`}>{value}</p>
                </div>
              ))}
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-sm font-extrabold">Bảng lương nhân viên</h2><p className="mt-1 text-[10px] text-slate-400">{payroll.length} nhân viên · Kỳ {periodLabel}</p></div>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, chức vụ…" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-orange-400 sm:w-64" />
              </div>
              <div className="mt-3 space-y-2">
                {filteredPayroll.map((item) => (
                  <button key={item.employee.id} type="button" onClick={() => { setEmpId(item.employee.id); setView("detail"); }}
                    className="w-full rounded-xl border border-slate-100 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/40">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-700">{item.employee.full_name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-800">{item.employee.full_name} <span className="font-medium text-slate-400">({item.employee.emp_code})</span></p><span aria-hidden="true" className="text-slate-400">›</span></div>
                        <p className="mt-0.5 text-[10px] text-slate-500">{item.employee.position || "Nhân viên"}</p>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                          <span className="text-slate-500">Giờ công <b className="text-slate-800">{item.hours.toFixed(2)}h</b></span>
                          <span className="text-slate-500">Ngày công <b className="text-slate-800">{item.days} ngày</b></span>
                          <span className="text-slate-500">Lương gộp <b className="text-slate-800">{money(item.gross)}</b></span>
                          <span className="text-orange-700">Thực nhận <b>{money(item.net)}</b></span>
                        </div>
                        {item.adjustment !== 0 && <p className="mt-1 text-[9px] text-slate-400">Điều chỉnh: {item.adjustment > 0 ? "−" : "+"}{money(Math.abs(item.adjustment))}</p>}
                      </div>
                    </div>
                  </button>
                ))}
                {!filteredPayroll.length && <p className="rounded-xl bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">{summaryLoading ? "Đang tải bảng lương…" : search ? "Không tìm thấy nhân viên phù hợp" : "Chưa có nhân viên"}</p>}
              </div>
            </section>
            <section className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-[10px] leading-5 text-orange-900">
              <b>Tiền lương đang tạm tính</b>
              <p>Lương ngày = giờ chấm công thực tế × lương giờ + phụ cấp ca. Điều chỉnh dương là trừ; điều chỉnh âm là cộng/bù. Chọn nhân viên để xem chi tiết và NOTE.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
