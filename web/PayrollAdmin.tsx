"use client";
// Trang quản lý (Desktop): duyệt ca & đơn nghỉ, bảng công + NOTE tự lưu, xuất Excel.
// Env: NEXT_PUBLIC_PAYROLL_API (vd https://payroll-api.onrender.com)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Employee, LeaveRequest, PayrollDay, Shift, Status } from "@/lib/types";
import { useToast } from "./Toast";

type ShiftJ = Shift & { users: { emp_code: string; full_name: string } };
type LeaveJ = LeaveRequest & { users: { emp_code: string; full_name: string } };
type NoteDraft = { text: string; amount: string };
type Saved = "saving" | "saved" | "error";

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// Giờ công của 1 khung vào/ra; +1440 để xử lý ca qua nửa đêm (giống MOD trong Excel)
const span = (a: string | null, b: string | null) => (a && b ? ((mins(b) - mins(a) + 1440) % 1440) / 60 : 0);
const money = (n: number) => n.toLocaleString("vi-VN");
const pad = (n: number) => String(n).padStart(2, "0");

export default function PayrollAdmin() {
  const { toast, node } = useToast();
  const now = new Date();
  const [tab, setTab] = useState<"approve" | "timesheet">("approve");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [exporting, setExporting] = useState(false);

  // ---- Duyệt ca & đơn nghỉ ----
  const [shifts, setShifts] = useState<ShiftJ[]>([]);
  const [leaves, setLeaves] = useState<LeaveJ[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const loadPending = useCallback(async () => {
    const [s, l] = await Promise.all([
      supabase.from("shifts").select("*, users(emp_code, full_name)").eq("status", "pending").order("work_date"),
      supabase.from("leave_requests").select("*, users(emp_code, full_name)").eq("status", "pending").order("leave_date"),
    ]);
    if (s.error || l.error) return toast("err", "Không tải được danh sách chờ duyệt");
    setShifts((s.data ?? []) as ShiftJ[]); setLeaves((l.data ?? []) as LeaveJ[]); setPicked(new Set());
  }, [toast]);

  async function reviewShifts(ids: number[], status: Exclude<Status, "pending">) {
    if (!ids.length) return;
    const { error } = await supabase.from("shifts").update({ status }).in("id", ids);
    error ? toast("err", error.message) : toast("ok", `${status === "approved" ? "Đã duyệt" : "Đã từ chối"} ${ids.length} ca`);
    loadPending();
  }
  async function reviewLeave(id: number, status: Exclude<Status, "pending">) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("leave_requests").update({ status, approved_by: user?.id }).eq("id", id);
    error ? toast("err", error.message) : toast("ok", status === "approved" ? "Đã duyệt đơn nghỉ" : "Đã từ chối đơn nghỉ");
    loadPending();
  }

  // ---- Bảng công & NOTE ----
  const [emps, setEmps] = useState<Employee[]>([]);
  const [empId, setEmpId] = useState("");
  const [days, setDays] = useState<Record<string, PayrollDay>>({});
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({});
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const monthDays = useMemo(() => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`), [year, month]);

  useEffect(() => {
    supabase.from("users").select("id, emp_code, full_name, position").eq("is_active", true).eq("role", "employee").order("emp_code")
      .then(({ data }) => { setEmps((data ?? []) as Employee[]); if (data?.length) setEmpId((p) => p || data[0].id); });
  }, []);

  const loadTimesheet = useCallback(async () => {
    if (!empId) return;
    const { data, error } = await supabase.from("v_payroll_days").select("*").eq("user_id", empId)
      .gte("work_date", monthDays[0]).lte("work_date", monthDays[monthDays.length - 1]);
    if (error) return toast("err", "Không tải được bảng công: " + error.message);
    const m: Record<string, PayrollDay> = {}, d: Record<string, NoteDraft> = {};
    ((data ?? []) as PayrollDay[]).forEach((x) => {
      m[x.work_date] = x;
      d[x.work_date] = { text: x.note_text ?? "", amount: x.adjustment_amount ? String(x.adjustment_amount) : "" };
    });
    setDays(m); setDrafts(d); setSaved({});
  }, [empId, monthDays, toast]);

  // Auto-save: gõ xong 800ms mới ghi; ô trống hoàn toàn thì xoá dòng ghi chú
  function editNote(date: string, patch: Partial<NoteDraft>) {
    const next = { ...(drafts[date] ?? { text: "", amount: "" }), ...patch };
    setDrafts((p) => ({ ...p, [date]: next }));
    setSaved((p) => ({ ...p, [date]: "saving" }));
    clearTimeout(timers.current[date]);
    timers.current[date] = setTimeout(async () => {
      const amount = Number(next.amount.replace(/[.,\s]/g, "")) || 0;
      const res = !next.text.trim() && !amount
        ? await supabase.from("daily_notes").delete().eq("user_id", empId).eq("note_date", date)
        : await supabase.from("daily_notes").upsert(
            { user_id: empId, note_date: date, note_text: next.text.trim() || null, adjustment_amount: amount },
            { onConflict: "user_id,note_date" });
      setSaved((p) => ({ ...p, [date]: res.error ? "error" : "saved" }));
      if (res.error) toast("err", `Lưu NOTE ngày ${date} thất bại: ${res.error.message}`);
    }, 800);
  }

  // ---- Realtime: có ca / đơn / chấm công mới thì tự làm mới ----
  useEffect(() => {
    loadPending();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => { loadPending(); loadTimesheet(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, loadPending)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, loadTimesheet)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadPending, loadTimesheet]);
  useEffect(() => { loadTimesheet(); }, [loadTimesheet]);

  // ---- Xuất Excel: gọi GET /export-payroll của main.py ----
  async function exportXlsx() {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_PAYROLL_API}/export-payroll?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? res.statusText);
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: `bang-luong-${year}-${pad(month)}.xlsx` }).click();
      URL.revokeObjectURL(url);
      toast("ok", "Đã tải bảng lương");
    } catch (e: any) { toast("err", "Xuất Excel thất bại: " + e.message); }
    setExporting(false);
  }

  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const th = "p-2 text-left font-medium";
  const totalHours = monthDays.reduce((s, d) => { const x = days[d]; return s + (x ? span(x.check_in_1, x.check_out_1) + span(x.check_in_2, x.check_out_2) : 0); }, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {node}
      <section className="flex flex-wrap items-end gap-4 bg-orange-50 border border-orange-200 rounded-xl p-5">
        <div><h1 className="font-semibold text-lg">Quản lý ca & bảng lương</h1><p className="text-sm text-gray-500">Chọn kỳ lương rồi xuất file Excel</p></div>
        <div className="ml-auto flex items-end gap-3">
          <label className="text-sm">Tháng<select value={month} onChange={(e) => setMonth(+e.target.value)} className="block border rounded px-2 py-1.5">
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
          <label className="text-sm">Năm<input type="number" value={year} onChange={(e) => setYear(+e.target.value)} className="block border rounded px-2 py-1.5 w-24" /></label>
          <button onClick={exportXlsx} disabled={exporting} className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-5 py-2 font-medium disabled:opacity-60">{exporting ? "Đang xuất…" : "Xuất Excel báo cáo"}</button>
        </div>
      </section>

      <nav className="flex gap-1 border-b">{([["approve", `Chờ duyệt (${shifts.length + leaves.length})`], ["timesheet", "Bảng công & NOTE"]] as const).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 -mb-px border-b-2 ${tab === k ? "border-orange-600 text-orange-700 font-medium" : "border-transparent text-gray-500"}`}>{l}</button>))}</nav>

      {tab === "approve" ? (<>
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Ca đăng ký ({shifts.length})</h2>
            <div className="flex gap-2">
              <button onClick={() => reviewShifts([...picked], "approved")} disabled={!picked.size} className="px-3 py-1.5 rounded-lg border border-green-600 text-green-700 disabled:opacity-40">Duyệt đã chọn</button>
              <button onClick={() => reviewShifts(shifts.map((s) => s.id), "approved")} disabled={!shifts.length} className="px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-40">Duyệt tất cả</button>
            </div>
          </div>
          <table className="w-full text-sm border rounded-xl overflow-hidden">
            <thead className="bg-orange-600 text-white"><tr>
              <th className="p-2 w-8"><input type="checkbox" aria-label="Chọn tất cả" checked={!!shifts.length && picked.size === shifts.length} onChange={(e) => setPicked(e.target.checked ? new Set(shifts.map((p) => p.id)) : new Set())} /></th>
              <th className={th}>Mã NV</th><th className={th}>Họ tên</th><th className={th}>Ngày</th><th className={th}>Ca 1</th><th className={th}>Ca 2</th><th className={`${th} text-right`}>Thao tác</th></tr></thead>
            <tbody>
              {shifts.map((s) => (<tr key={s.id} className="border-t hover:bg-orange-50">
                <td className="p-2"><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} /></td>
                <td className="p-2">{s.users.emp_code}</td><td className="p-2">{s.users.full_name}</td>
                <td className="p-2">{new Date(s.work_date).toLocaleDateString("vi-VN")}</td>
                <td className="p-2">{hm(s.check_in_1)} – {hm(s.check_out_1)}</td>
                <td className="p-2">{s.check_in_2 ? `${hm(s.check_in_2)} – ${hm(s.check_out_2)}` : "—"}</td>
                <td className="p-2 text-right space-x-3"><button onClick={() => reviewShifts([s.id], "approved")} className="text-green-700 hover:underline">Duyệt</button>
                  <button onClick={() => reviewShifts([s.id], "rejected")} className="text-red-600 hover:underline">Từ chối</button></td></tr>))}
              {!shifts.length && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Không có ca nào chờ duyệt</td></tr>}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-semibold mb-3">Đơn xin nghỉ ({leaves.length})</h2>
          <table className="w-full text-sm border rounded-xl overflow-hidden">
            <thead className="bg-orange-600 text-white"><tr><th className={th}>Mã NV</th><th className={th}>Họ tên</th><th className={th}>Ngày nghỉ</th><th className={th}>Lý do</th><th className={`${th} text-right`}>Thao tác</th></tr></thead>
            <tbody>
              {leaves.map((l) => (<tr key={l.id} className="border-t hover:bg-orange-50">
                <td className="p-2">{l.users.emp_code}</td><td className="p-2">{l.users.full_name}</td>
                <td className="p-2">{new Date(l.leave_date).toLocaleDateString("vi-VN")}</td><td className="p-2">{l.reason}</td>
                <td className="p-2 text-right space-x-3"><button onClick={() => reviewLeave(l.id, "approved")} className="text-green-700 hover:underline">Duyệt</button>
                  <button onClick={() => reviewLeave(l.id, "rejected")} className="text-red-600 hover:underline">Từ chối</button></td></tr>))}
              {!leaves.length && <tr><td colSpan={5} className="p-6 text-center text-gray-400">Không có đơn nghỉ nào chờ duyệt</td></tr>}
            </tbody>
          </table>
        </section>
      </>) : (
        <section className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-sm">Nhân viên<select value={empId} onChange={(e) => setEmpId(e.target.value)} className="ml-2 border rounded px-2 py-1.5">
              {emps.map((e) => <option key={e.id} value={e.id}>{e.emp_code} – {e.full_name}</option>)}</select></label>
            <span className="ml-auto text-sm text-gray-600">Tổng giờ công tháng: <b>{totalHours.toFixed(2)}</b></span>
          </div>
          <p className="text-xs text-gray-500">NOTE tự lưu sau khi bạn ngừng gõ. Số tiền dương = trừ (mua đồ, phạt), số âm = cộng bù.</p>
          <table className="w-full text-sm border rounded-xl overflow-hidden">
            <thead className="bg-orange-600 text-white"><tr><th className={th}>Ngày</th><th className={th}>Vào – Ra</th><th className={`${th} text-right`}>Giờ công</th><th className={th}>NOTE</th><th className={`${th} w-32`}>Số tiền</th><th className="p-2 w-20" /></tr></thead>
            <tbody>
              {monthDays.map((d) => { const x = days[d], dr = drafts[d] ?? { text: "", amount: "" };
                const h = x ? span(x.check_in_1, x.check_out_1) + span(x.check_in_2, x.check_out_2) : 0;
                return (<tr key={d} className={`border-t ${x ? "" : "text-gray-400"}`}>
                  <td className="p-2 whitespace-nowrap">{d.slice(8)}/{d.slice(5, 7)}</td>
                  <td className="p-2">{x?.check_in_1 ? `${hm(x.check_in_1)} – ${hm(x.check_out_1)}${x.check_in_2 ? `, ${hm(x.check_in_2)} – ${hm(x.check_out_2)}` : ""}` : "—"}</td>
                  <td className="p-2 text-right">{h ? h.toFixed(2) : ""}</td>
                  <td className="p-1"><input value={dr.text} onChange={(e) => editNote(d, { text: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="vd: 1 ly Olong chanh vàng" /></td>
                  <td className="p-1"><input inputMode="numeric" value={dr.amount} onChange={(e) => editNote(d, { amount: e.target.value })} className="w-full border rounded px-2 py-1 text-right" placeholder="0" /></td>
                  <td className="p-2 text-xs">{saved[d] === "saving" ? "Đang lưu…" : saved[d] === "saved" ? <span className="text-green-700">Đã lưu</span> : saved[d] === "error" ? <span className="text-red-600">Lỗi</span> : ""}</td>
                </tr>); })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
