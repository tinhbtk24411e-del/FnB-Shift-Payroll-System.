"use client";
// Trang nhân viên: đăng ký ca, gửi đơn xin nghỉ và xem công/lương.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { showBrowserNotification } from "@/lib/browser-notifications";
import { logout, type Me } from "./AuthGate";
import BrowserNotificationButton from "./components/BrowserNotificationButton";
import type { LeaveRequest, Shift, Status } from "@/lib/types";
import { useToast } from "./Toast";
import MyPay from "./MyPay";

const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const BADGE: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};
const LABEL: Record<Status, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const REASONS = ["Việc gia đình", "Ốm / khám bệnh", "Lịch học", "Việc cá nhân", "Khác"];
const PRESETS = {
  "Ca sáng": { start: "06:00", end: "14:00" },
  "Ca chiều": { start: "14:00", end: "23:00" },
} as const;
type ShiftName = keyof typeof PRESETS;
type ShiftLabel = ShiftName | "Ca gãy";
type EmployeeTab = "home" | "shift" | "attendance" | "pay" | "leave";

const iso = (d: Date) => d.toLocaleDateString("sv-SE");
const hm = (t: string | null) => t?.slice(0, 5) ?? "";
const mondayOf = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const durationMinutes = (start: string, end: string) => (minutes(end) - minutes(start) + 1440) % 1440;
const formatDuration = (total: number) => `${Math.floor(total / 60)} giờ${total % 60 ? ` ${total % 60} phút` : ""}`;
const dateLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN", {
  weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
});
const shiftNameFor = (start: string, end: string): ShiftLabel => {
  const found = Object.entries(PRESETS).find(([, time]) => time.start === start && time.end === end);
  return (found?.[0] as ShiftName | undefined) ?? "Ca gãy";
};

export default function ShiftRegistration({ me }: { me: Me }) {
  const { toast, node } = useToast();
  const [tab, setTab] = useState<EmployeeTab>("home");
  const [monday, setMonday] = useState(mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveDate, setLeaveDate] = useState(iso(new Date()));
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonText, setReasonText] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState(iso(new Date()));
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [shiftName, setShiftName] = useState<ShiftLabel>("Ca gãy");
  const [managerNote, setManagerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [monday],
  );
  const shiftsByDate = useMemo(() => new Map(shifts.map((shift) => [shift.work_date, shift])), [shifts]);
  const pendingCount = shifts.filter((shift) => shift.status === "pending").length;
  const approvedCount = shifts.filter((shift) => shift.status === "approved").length;
  const today = iso(new Date());
  const firstAvailableDay = days.find((day) => {
    const date = iso(day);
    const existing = shiftsByDate.get(date);
    return date >= today && (!existing || existing.status === "pending" || existing.status === "rejected");
  });
  const todayShift = shiftsByDate.get(today);
  const upcomingShifts = days
    .filter((day) => iso(day) >= today)
    .map((day) => ({ day, shift: shiftsByDate.get(iso(day)) }))
    .filter((item): item is { day: Date; shift: Shift } => Boolean(item.shift))
    .slice(0, 3);

  const loadShifts = useCallback(async () => {
    setLoadingShifts(true);
    setShifts([]);
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", me.id)
      .gte("work_date", iso(days[0]))
      .lte("work_date", iso(days[6]))
      .order("work_date");
    if (error) {
      setLoadingShifts(false);
      toast("err", "Không tải được ca: " + error.message);
      return;
    }
    setShifts((data ?? []) as Shift[]);
    setLoadingShifts(false);
  }, [days, me.id, toast]);

  const loadLeaves = useCallback(async () => {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", me.id)
      .order("leave_date", { ascending: false })
      .limit(20);
    if (error) {
      toast("err", "Không tải được đơn nghỉ: " + error.message);
      return;
    }
    setLeaves((data ?? []) as LeaveRequest[]);
  }, [me.id, toast]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  useEffect(() => {
    const notify = (what: string) => (payload: {
      new: { status: Status; work_date?: string; leave_date?: string };
      old: { status?: Status };
    }) => {
      const status = payload.new.status;
      if (status !== payload.old?.status && status !== "pending") {
        const message = `${what} ${payload.new.work_date ?? payload.new.leave_date}: ${LABEL[status]}`;
        toast(status === "approved" ? "ok" : "err", message);
        void showBrowserNotification(status === "approved" ? "Đăng ký đã được duyệt" : "Đăng ký bị từ chối", message)
          .catch((error: unknown) => console.error("Could not display browser notification:", error));
      }
      loadShifts();
      loadLeaves();
    };
    const channel = supabase.channel(`employee-updates-${me.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shifts", filter: `user_id=eq.${me.id}` }, notify("Ca ngày"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shifts", filter: `user_id=eq.${me.id}` }, notify("Ca ngày"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leave_requests", filter: `user_id=eq.${me.id}` }, notify("Đơn nghỉ ngày"))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLeaves, loadShifts, me.id, toast]);

  function openShiftForm(date = iso(new Date())) {
    if (loadingShifts) {
      toast("info", "Đang tải lịch, vui lòng thử lại trong giây lát");
      return;
    }
    if (date < iso(days[0]) || date > iso(days[6]) || date < iso(new Date())) {
      toast("err", "Chỉ có thể đăng ký ngày tương lai trong tuần đang xem");
      return;
    }
    const existing = shiftsByDate.get(date);
    if (existing?.status === "approved") {
      toast("info", "Ca này đã được quản lý duyệt");
      return;
    }
    setFormDate(date);
    setFormStart(hm(existing?.check_in_1 ?? null));
    setFormEnd(hm(existing?.check_out_1 ?? null));
    setShiftName(existing?.check_in_1 && existing.check_out_1
      ? shiftNameFor(hm(existing.check_in_1), hm(existing.check_out_1))
      : "Ca gãy");
    setManagerNote("");
    setFormOpen(true);
  }

  function updateFormDate(date: string) {
    setFormDate(date);
    const existing = shiftsByDate.get(date);
    const start = hm(existing?.check_in_1 ?? null);
    const end = hm(existing?.check_out_1 ?? null);
    setFormStart(start);
    setFormEnd(end);
    setShiftName(start && end ? shiftNameFor(start, end) : "Ca gãy");
  }

  async function submitShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me.id) {
      toast("err", "Bạn chưa đăng nhập");
      return;
    }
    const start = formStart;
    const end = formEnd;
    const duration = durationMinutes(start, end);
    if (!formDate || formDate < iso(new Date()) || formDate < iso(days[0]) || formDate > iso(days[6])) {
      toast("err", "Vui lòng chọn ngày tương lai trong tuần đang xem");
      return;
    }
    if (!start || !end || duration <= 0) {
      toast("err", "Giờ kết thúc phải khác giờ bắt đầu");
      return;
    }
    const existing = shiftsByDate.get(formDate);
    if (existing?.status === "approved") {
      toast("err", "Ca đã được duyệt, bạn không thể sửa");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("shifts").upsert({
      user_id: me.id,
      work_date: formDate,
      check_in_1: start,
      check_out_1: end,
      check_in_2: null,
      check_out_2: null,
      status: "pending",
    }, { onConflict: "user_id,work_date" });
    setBusy(false);
    if (error) {
      toast("err", "Gửi đăng ký ca thất bại: " + error.message);
      return;
    }
    toast("ok", existing?.status === "rejected"
      ? "Đã đăng ký lại ca, chờ quản lý duyệt"
      : existing
        ? "Đã cập nhật ca, chờ quản lý duyệt"
        : "Đã gửi đăng ký ca, chờ quản lý duyệt");
    setFormOpen(false);
    setMonday(mondayOf(new Date(`${formDate}T00:00:00`)));
    loadShifts();
  }

  async function submitLeave() {
    if (!me.id) return toast("err", "Bạn chưa đăng nhập");
    setBusy(true);
    const { error } = await supabase.from("leave_requests").insert({
      user_id: me.id,
      leave_date: leaveDate,
      reason: reasonText ? `${reason}: ${reasonText}` : reason,
      status: "pending",
    });
    setBusy(false);
    if (error) return toast("err", "Gửi đơn nghỉ thất bại: " + error.message);
    toast("ok", "Đã gửi đơn xin nghỉ");
    setReasonText("");
    loadLeaves();
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef] pb-24 text-slate-800">
      {node}
      <div className="mx-auto min-h-screen max-w-[480px] bg-[#f8f8f6] shadow-[0_0_50px_rgba(15,23,42,0.08)]">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 text-sm font-black text-white shadow-sm shadow-orange-200">P</div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.13em] text-orange-700">PEONY F&amp;B · {tab === "home" ? "Trang chủ" : tab === "shift" ? "Lịch làm" : tab === "attendance" ? "Bảng công" : tab === "pay" ? "Lương" : "Xin nghỉ"}</div>
              <div className="truncate text-[10px] text-slate-500">Peony Coffee &amp; Bakery · Chi nhánh 01</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <BrowserNotificationButton compact />
            <button type="button" onClick={() => setTab("leave")} aria-label={`${pendingCount} ca chờ duyệt; mở thông báo`} className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-orange-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {pendingCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />}
            </button>
            <button type="button" onClick={logout} aria-label={`Đăng xuất tài khoản ${me.full_name}`} title="Đăng xuất" className="grid h-9 w-9 place-items-center rounded-full bg-[#9c4b0b] text-xs font-bold text-white">{me.full_name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1).toUpperCase() || "P"}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] space-y-4 px-4 py-5">
        {tab === "home" ? (
          <>
            <section className="px-1 pt-1">
              <p className="text-[11px] font-medium capitalize text-slate-500">{new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
              <h1 className="mt-1 text-[23px] font-extrabold tracking-tight text-slate-900">Xin chào, {me.full_name.split(/\s+/).slice(-1)[0]} 👋</h1>
              <p className="mt-1 text-xs text-slate-500">{me.position || "Nhân viên"} · Mã NV: {me.emp_code}</p>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700">Ca làm hôm nay</p><p className="mt-1 text-xs text-slate-500">{new Date().toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}</p></div>
                {todayShift ? <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${todayShift.status === "approved" ? "bg-emerald-50 text-emerald-700" : todayShift.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{LABEL[todayShift.status]}</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">Chưa có ca</span>}
              </div>
              {todayShift ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-orange-50/80 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></div>
                  <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{shiftNameFor(hm(todayShift.check_in_1), hm(todayShift.check_out_1))}</p><p className="mt-1 text-[11px] text-slate-600">{hm(todayShift.check_in_1)} – {hm(todayShift.check_out_1)}{todayShift.check_in_2 ? ` · ${hm(todayShift.check_in_2)} – ${hm(todayShift.check_out_2)}` : ""}</p></div>
                </div>
              ) : (
                <button type="button" onClick={() => setTab("shift")} className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-3 text-left">
                  <span><b className="block text-xs text-slate-800">{loadingShifts ? "Đang tải lịch làm…" : "Hôm nay bạn chưa có ca"}</b><span className="mt-1 block text-[10px] text-slate-500">Xem lịch hoặc đăng ký ca sắp tới</span></span><span aria-hidden="true" className="text-lg text-orange-600">›</span>
                </button>
              )}
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["CA ĐÃ DUYỆT", approvedCount, "bg-emerald-50 text-emerald-700"], ["CHỜ DUYỆT", pendingCount, "bg-amber-50 text-amber-700"], ["BỊ TỪ CHỐI", shifts.filter((shift) => shift.status === "rejected").length, "bg-rose-50 text-rose-700"], ["CA TRONG TUẦN", shifts.length, "bg-blue-50 text-blue-700"]].map(([label, count, color]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><p className="truncate text-[8px] font-bold tracking-[0.03em] text-slate-400">{label}</p><p className={`mt-2 inline-flex min-w-7 items-center justify-center rounded-lg px-2 py-1 text-sm font-extrabold ${color}`}>{count}</p></div>
              ))}
            </section>

            <section className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => {
                setTab("shift");
                if (firstAvailableDay) openShiftForm(iso(firstAvailableDay));
              }} className="flex items-center gap-3 rounded-xl bg-orange-600 p-3 text-left text-white shadow-sm shadow-orange-200">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-xl">＋</span><span><b className="block text-xs">Đăng ký ca</b><span className="mt-0.5 block text-[9px] text-orange-100">Chọn lịch tuần tới</span></span>
              </button>
              <button type="button" onClick={() => setTab("leave")} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-lg text-blue-700">↗</span><span><b className="block text-xs text-slate-800">Xin nghỉ</b><span className="mt-0.5 block text-[9px] text-slate-500">Gửi đơn đến quản lý</span></span>
              </button>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-800">Lịch làm sắp tới</h2><p className="mt-0.5 text-[10px] text-slate-400">Ca trong tuần của bạn</p></div><button type="button" onClick={() => setTab("shift")} className="text-[10px] font-semibold text-orange-700">Xem lịch ›</button></div>
              {upcomingShifts.length ? <ul className="space-y-2">{upcomingShifts.map(({ day, shift }) => <li key={shift.work_date} className="flex items-center gap-3 rounded-xl bg-[#f8f8f6] px-3 py-2.5"><div className="min-w-10 rounded-lg bg-white px-2 py-1 text-center"><b className="block text-xs text-slate-800">{String(day.getDate()).padStart(2, "0")}/{String(day.getMonth() + 1).padStart(2, "0")}</b><span className="text-[9px] text-slate-400">{THU[day.getDay()]}</span></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-slate-800">{shiftNameFor(hm(shift.check_in_1), hm(shift.check_out_1))}</p><p className="mt-0.5 text-[10px] text-slate-500">{hm(shift.check_in_1)} – {hm(shift.check_out_1)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${shift.status === "approved" ? "bg-emerald-50 text-emerald-700" : shift.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{LABEL[shift.status]}</span></li>)}</ul> : <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">{loadingShifts ? "Đang tải lịch…" : "Chưa có ca làm sắp tới"}</p>}
            </section>

            <button type="button" onClick={() => setTab("attendance")} className="flex w-full items-center justify-between rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 text-left">
              <span><b className="block text-xs text-blue-900">Bảng công của bạn</b><span className="mt-1 block text-[10px] text-blue-800">Theo dõi giờ làm và thu nhập trong tháng</span></span><span className="text-lg text-blue-700">›</span>
            </button>
          </>
        ) : (
        <section className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700">{tab === "shift" ? "Lịch làm việc" : tab === "attendance" ? "Thời gian làm việc" : tab === "pay" ? "Thu nhập" : "Đơn từ"}</p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{tab === "shift" ? "Đăng ký lịch làm" : tab === "attendance" ? "Bảng công" : tab === "pay" ? "Lương tháng" : "Xin nghỉ phép"}</h1>
            <p className="mt-1 text-[11px] text-slate-500">{tab === "shift" ? "Chủ động gửi ca và theo dõi quản lý duyệt." : tab === "attendance" ? "Theo dõi giờ vào, giờ ra mỗi ngày." : tab === "pay" ? "Theo dõi thu nhập dự kiến của bạn." : "Gửi đơn nghỉ và theo dõi trạng thái."}</p>
          </div>
          {tab === "shift" && <button
            type="button"
            onClick={() => firstAvailableDay && openShiftForm(iso(firstAvailableDay))}
            disabled={!firstAvailableDay || loadingShifts}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className="text-lg leading-none">＋</span>
            Đăng ký
          </button>}
        </section>
        )}

        {tab === "shift" ? (
          <>
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Lịch đăng ký trong tuần</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {days[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} – {days[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Tuần trước" onClick={() => setMonday((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-xl text-slate-600 hover:bg-slate-50">‹</button>
                  <button type="button" aria-label="Tuần sau" onClick={() => setMonday((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-xl text-slate-600 hover:bg-slate-50">›</button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                {days.map((day) => {
                  const date = iso(day);
                  const shift = shiftsByDate.get(date);
                  return (
                    <article key={date} className={`rounded-xl border p-3 transition ${shift?.status === "rejected" ? "border-rose-200 bg-rose-50/40" : date === today ? "border-orange-200 bg-orange-50/30" : "border-slate-100 bg-white"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${date === today ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                          <span className="text-[9px] font-bold uppercase">{THU[day.getDay()]}</span>
                          <span className="text-base font-extrabold leading-4">{String(day.getDate()).padStart(2, "0")}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800">{day.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long" })}{date === today && <span className="ml-1.5 text-[9px] font-bold uppercase text-orange-700">Hôm nay</span>}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{shift ? `${shiftNameFor(hm(shift.check_in_1), hm(shift.check_out_1))} · ${hm(shift.check_in_1)} – ${hm(shift.check_out_1)}` : "Chưa đăng ký ca"}</p>
                        </div>
                        {shift
                          ? <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ring-1 ring-inset ${BADGE[shift.status]}`}>{LABEL[shift.status]}</span>
                          : <span className="shrink-0 text-[10px] font-medium text-slate-400">—</span>}
                      </div>
                      {shift?.check_in_2 && shift.check_out_2 && <p className="ml-[60px] mt-1 text-[10px] text-slate-500">Ca 2 · {hm(shift.check_in_2)} – {hm(shift.check_out_2)}</p>}
                      {shift?.status === "rejected" && <p className="ml-[60px] mt-1 text-[10px] font-medium text-rose-700">Ca bị từ chối. Bạn có thể chỉnh giờ và gửi đăng ký lại.</p>}
                      {date >= today && !loadingShifts && shift?.status !== "approved" && (
                        <button type="button" onClick={() => openShiftForm(date)} className={`mt-2 min-h-9 w-full rounded-lg px-3 text-left text-[11px] font-bold ${shift?.status === "rejected" ? "bg-rose-100 text-rose-800 hover:bg-rose-200" : shift?.status === "pending" ? "bg-orange-50 text-orange-800 hover:bg-orange-100" : "border border-dashed border-slate-200 text-orange-700 hover:bg-orange-50"}`}>
                          {shift?.status === "rejected" ? "↻  Đăng ký lại ca này" : shift?.status === "pending" ? "Chỉnh sửa đăng ký" : "＋  Đăng ký ca"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
                <span aria-hidden="true">ℹ</span>
                <span>Đăng ký ca sẽ ở trạng thái chờ duyệt. Lịch đồng nghiệp chưa hiển thị do quyền truy cập hiện tại chỉ cho phép xem ca của chính bạn.</span>
              </p>
            </section>
          </>
        ) : tab === "attendance" || tab === "pay" ? (
          <MyPay view={tab} />
        ) : tab === "leave" ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-semibold text-slate-900">Gửi đơn xin nghỉ</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">Ngày nghỉ
                  <input type="date" value={leaveDate} min={iso(new Date())} onChange={(e) => setLeaveDate(e.target.value)} className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Lý do
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">{REASONS.map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <input placeholder="Ghi chú thêm (không bắt buộc)" value={reasonText} onChange={(e) => setReasonText(e.target.value)} className="block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                <button type="button" onClick={submitLeave} disabled={busy} className="h-11 w-full rounded-xl bg-orange-600 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">{busy ? "Đang gửi…" : "Gửi đơn xin nghỉ"}</button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-semibold text-slate-900">Đơn xin nghỉ đã gửi</h2>
              <ul className="mt-3 space-y-2">
                {leaves.map((leave) => (
                  <li key={leave.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                    <div><p className="text-sm font-semibold">{dateLabel(leave.leave_date)}</p><p className="mt-0.5 text-xs text-slate-500">{leave.reason}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${BADGE[leave.status]}`}>{LABEL[leave.status]}</span>
                  </li>
                ))}
                {!leaves.length && <li className="py-8 text-center text-sm text-slate-400">Bạn chưa gửi đơn nghỉ nào</li>}
              </ul>
            </div>
          </section>
        ) : null}
      </main>

      <nav aria-label="Điều hướng nhân viên" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-[480px] grid-cols-4 px-2">
          {([
            ["home", "Trang chủ", "M3 10.5 12 3l9 7.5M5 9v11h14V9M9 20v-6h6v6"],
            ["shift", "Lịch làm", "M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2Z"],
            ["attendance", "Bảng công", "M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
            ["pay", "Lương", "M3 7h18v13H3zM3 7l2-3h14l2 3m-7 6h4"],
          ] as const).map(([key, label, path]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[10px] ${tab === key || (tab === "leave" && key === "shift") ? "font-bold text-orange-700" : "text-slate-500"}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]"><path d={path} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{label}
            </button>
          ))}
        </div>
      </nav>

      {formOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-5" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFormOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="shift-form-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-orange-700">ĐĂNG KÝ LỊCH TUẦN</p>
                <h2 id="shift-form-title" className="mt-1 text-lg font-bold text-slate-900">{shiftsByDate.get(formDate)?.status === "rejected" ? "Đăng ký lại ca làm" : "Đăng ký ca làm"}</h2>
              </div>
              <button type="button" aria-label="Đóng form" onClick={() => setFormOpen(false)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">×</button>
            </div>
            <form onSubmit={submitShift} className="space-y-4 px-5 py-4 sm:px-6">
              {shiftsByDate.get(formDate)?.status === "rejected" && <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">Ca trước đã bị từ chối. Kiểm tra hoặc đổi khung giờ bên dưới rồi gửi lại để quản lý duyệt.</p>}
              <label className="block text-xs font-semibold text-slate-700">Ngày làm việc
                <input type="date" value={formDate} min={iso(new Date())} max={iso(days[6])} onChange={(event) => updateFormDate(event.target.value)} required className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
              </label>
              <div>
                <p className="text-xs font-semibold text-slate-700">Loại ca</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["Ca sáng", "Ca chiều", "Ca gãy"] as const).map((name) => (
                    <button key={name} type="button" onClick={() => {
                      setShiftName(name);
                      if (name === "Ca sáng" || name === "Ca chiều") {
                        setFormStart(PRESETS[name].start);
                        setFormEnd(PRESETS[name].end);
                      }
                    }} className={`min-h-10 rounded-xl border px-2 text-xs font-semibold transition ${shiftName === name ? "border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-100" : "border-slate-200 text-slate-600 hover:border-orange-200"}`}>
                      {name}
                      {(name === "Ca sáng" || name === "Ca chiều") && <span className="mt-0.5 block text-[9px] font-normal opacity-75">{PRESETS[name].start} – {PRESETS[name].end}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700">Giờ vào ca
                  <input type="time" value={formStart} onChange={(event) => {
                    setFormStart(event.target.value);
                    setShiftName(shiftNameFor(event.target.value, formEnd));
                  }} required className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                </label>
                <label className="block text-xs font-semibold text-slate-700">Giờ kết thúc
                  <input type="time" value={formEnd} onChange={(event) => {
                    setFormEnd(event.target.value);
                    setShiftName(shiftNameFor(formStart, event.target.value));
                  }} required className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                </label>
              </div>
              <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3">
                <p className="text-xs font-semibold text-slate-700">Vị trí làm việc</p>
                <p className="mt-1 text-sm font-semibold text-orange-800">{me.position || "Chưa cập nhật trong hồ sơ"}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Vị trí đang lấy từ hồ sơ nhân viên; bảng đăng ký ca hiện chưa lưu vị trí riêng cho từng ca.</p>
              </div>
              <label className="block text-xs font-semibold text-slate-700">Ghi chú cho quản lý
                <textarea value={managerNote} onChange={(event) => setManagerNote(event.target.value)} rows={2} maxLength={250} placeholder="Nhập ghi chú (không bắt buộc)" className="mt-1.5 block w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                <span className="mt-1 block text-[10px] font-normal leading-4 text-amber-700">Ghi chú chỉ hiển thị trên form hiện tại, chưa được lưu vì schema shifts chưa có trường ghi chú.</span>
              </label>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
                <div><p className="text-xs font-semibold text-slate-700">Thời gian dự kiến</p><p className="mt-0.5 text-[10px] text-slate-500">{formStart && formEnd ? `${formStart} – ${formEnd}` : "Chọn giờ vào và giờ kết thúc"}</p></div>
                <p className="text-lg font-bold text-orange-700">{formStart && formEnd && formStart !== formEnd ? formatDuration(durationMinutes(formStart, formEnd)) : "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setFormOpen(false)} className="h-11 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Hủy bỏ</button>
                <button type="submit" disabled={busy} className="h-11 rounded-xl bg-orange-600 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Đang gửi…" : shiftsByDate.get(formDate)?.status === "rejected" ? "Gửi đăng ký lại" : "Gửi đăng ký ca"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
