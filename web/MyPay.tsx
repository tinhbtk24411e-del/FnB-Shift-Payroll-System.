"use client";
// Tab "Công & lương" của nhân viên: giờ check-in/out từng ngày + thu nhập tạm tính trong tháng + đăng xuất.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollDay } from "@/lib/types";
import { logout } from "./AuthGate";

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const span = (a: string | null, b: string | null) => (a && b ? ((mins(b) - mins(a) + 1440) % 1440) / 60 : 0);
const vnd = (n: number) => n.toLocaleString("vi-VN") + "đ";

export default function MyPay() {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear()), [m, setM] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PayrollDay[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("users").select("full_name, emp_code").eq("id", user.id).single();
      if (data) setName(`${data.full_name} (${data.emp_code})`);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const last = new Date(y, m, 0).getDate();
    // RLS đảm bảo nhân viên chỉ thấy dữ liệu của chính mình
    supabase.from("v_payroll_days").select("*").gte("work_date", `${y}-${pad(m)}-01`).lte("work_date", `${y}-${pad(m)}-${pad(last)}`)
      .order("work_date").then(({ data }) => { setRows((data ?? []) as PayrollDay[]); setLoading(false); });
  }, [y, m]);

  // Cùng công thức với file Excel: LƯƠNG NGÀY = giờ công × lương giờ + phụ cấp (chỉ ngày có ca); thu nhập = lương - khoản trừ
  const calc = useMemo(() => {
    const days = rows.map((r) => {
      const h = span(r.check_in_1, r.check_out_1) + span(r.check_in_2, r.check_out_2);
      const pay = h * r.hourly_rate + (r.check_in_1 && r.check_out_1 ? r.allowance_per_shift : 0);
      return { r, h, pay };
    });
    const hours = days.reduce((s, d) => s + d.h, 0), salary = days.reduce((s, d) => s + d.pay, 0);
    const adj = rows.reduce((s, r) => s + r.adjustment_amount, 0);
    return { days, hours, salary, adj, net: salary - adj };
  }, [rows]);

  const go = (d: number) => { const t = new Date(y, m - 1 + d, 1); setY(t.getFullYear()); setM(t.getMonth() + 1); };

  return (
    <div className="p-3 space-y-4 pb-10">
      <div className="flex items-center justify-between text-sm"><span className="font-medium">{name}</span>
        <button onClick={logout} className="text-orange-700 underline">Đăng xuất</button></div>
      <div className="flex items-center justify-between bg-white rounded-xl p-2 border border-orange-100">
        <button onClick={() => go(-1)} aria-label="Tháng trước" className="px-3 py-1 text-xl">‹</button>
        <b>Tháng {m}/{y}</b>
        <button onClick={() => go(1)} aria-label="Tháng sau" className="px-3 py-1 text-xl">›</button></div>

      <div className="bg-orange-600 text-white rounded-2xl p-4">
        <div className="text-sm opacity-90">Thu nhập tạm tính</div>
        <div className="text-3xl font-semibold">{vnd(Math.round(calc.net))}</div>
        <div className="mt-2 text-xs opacity-90 flex gap-4"><span>{calc.hours.toFixed(2)} giờ công</span><span>Lương {vnd(Math.round(calc.salary))}</span>
          {calc.adj !== 0 && <span>{calc.adj > 0 ? "Trừ" : "Cộng"} {vnd(Math.abs(calc.adj))}</span>}</div>
      </div>
      <p className="text-xs text-gray-500">Chỉ tính các ca đã được duyệt. Số liệu chốt cuối tháng theo bảng lương của quản lý.</p>

      <ul className="space-y-2">
        {calc.days.map(({ r, h, pay }) => (
          <li key={r.work_date} className="bg-white rounded-lg p-3 border border-orange-100">
            <div className="flex justify-between text-sm"><b>{pad(+r.work_date.slice(8))}/{r.work_date.slice(5, 7)}</b>
              <span>{h ? `${h.toFixed(2)}h · ${vnd(Math.round(pay))}` : "—"}</span></div>
            <div className="text-xs text-gray-500">{r.check_in_1 ? `${hm(r.check_in_1)} – ${hm(r.check_out_1) || "…"}${r.check_in_2 ? `, ${hm(r.check_in_2)} – ${hm(r.check_out_2)}` : ""}` : "Không có ca"}</div>
            {r.note_text && <div className="text-xs mt-1 text-orange-800">{r.note_text} ({r.adjustment_amount > 0 ? "−" : "+"}{Math.abs(r.adjustment_amount).toLocaleString("vi-VN")}đ)</div>}
          </li>))}
        {!calc.days.length && <li className="text-center text-sm text-gray-400 py-8">{loading ? "Đang tải…" : "Tháng này chưa có ca được duyệt"}</li>}
      </ul>
    </div>
  );
}
