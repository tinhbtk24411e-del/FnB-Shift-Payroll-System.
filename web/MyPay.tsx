"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollDay } from "@/lib/types";

type View = "attendance" | "pay";

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const span = (a: string | null, b: string | null) => (a && b ? ((mins(b) - mins(a) + 1440) % 1440) / 60 : 0);
const vnd = (n: number) => n.toLocaleString("vi-VN") + " đ";

export default function MyPay({ view }: { view: View }) {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear()), [m, setM] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PayrollDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const last = new Date(y, m, 0).getDate();
    supabase.from("v_payroll_days").select("*")
      .gte("work_date", `${y}-${pad(m)}-01`)
      .lte("work_date", `${y}-${pad(m)}-${pad(last)}`)
      .order("work_date")
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError("Không tải được dữ liệu công: " + queryError.message);
          setRows([]);
        } else {
          setRows((data ?? []) as PayrollDay[]);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [y, m]);

  const calc = useMemo(() => {
    const days = rows.map((r) => {
      const h = span(r.check_in_1, r.check_out_1) + span(r.check_in_2, r.check_out_2);
      const pay = h * r.hourly_rate + (r.check_in_1 && r.check_out_1 ? r.allowance_per_shift : 0);
      return { r, h, pay };
    });
    const hours = days.reduce((s, d) => s + d.h, 0);
    const salary = days.reduce((s, d) => s + d.pay, 0);
    const adj = rows.reduce((s, r) => s + r.adjustment_amount, 0);
    const worked = days.filter(({ h }) => h > 0).length;
    return { days, hours, salary, adj, net: salary - adj, worked };
  }, [rows]);

  const go = (d: number) => {
    const t = new Date(y, m - 1 + d, 1);
    setY(t.getFullYear());
    setM(t.getMonth() + 1);
  };
  const monthName = new Date(y, m - 1, 1).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
        <button type="button" onClick={() => go(-1)} aria-label="Tháng trước" className="grid h-9 w-9 place-items-center rounded-xl text-2xl text-slate-500 hover:bg-orange-50 hover:text-orange-700">‹</button>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Thời gian</p>
          <b className="text-sm capitalize text-slate-800">{monthName}</b>
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Tháng sau" disabled={y === now.getFullYear() && m === now.getMonth() + 1} className="grid h-9 w-9 place-items-center rounded-xl text-2xl text-slate-500 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-30">›</button>
      </div>

      {view === "pay" ? (
        <>
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#22324a] via-[#263c56] to-[#18283b] p-5 text-white shadow-lg shadow-slate-300/40">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">Tổng thu nhập tạm tính</p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-slate-200">Chưa chốt</span>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{vnd(Math.round(calc.net))}</p>
            <p className="mt-1 text-[11px] text-slate-300">Thu nhập dự kiến trong {monthName}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
              <div><p className="text-[10px] text-slate-400">Giờ công</p><p className="mt-1 text-sm font-semibold">{calc.hours.toFixed(1)} giờ</p></div>
              <div><p className="text-[10px] text-slate-400">Ngày làm việc</p><p className="mt-1 text-sm font-semibold">{calc.worked} ngày</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Chi tiết thu nhập</h2>
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center justify-between"><span className="text-slate-500">Lương theo giờ công</span><b>{vnd(Math.round(calc.salary))}</b></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Thưởng / phạt</span><b className={calc.adj > 0 ? "text-rose-600" : "text-emerald-600"}>{calc.adj > 0 ? "−" : "+"}{vnd(Math.abs(calc.adj))}</b></div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm"><b>Thực nhận ước tính</b><b className="text-orange-700">{vnd(Math.round(calc.net))}</b></div>
            </div>
          </section>
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">Số liệu chỉ mang tính tạm tính. Quản lý sẽ xác nhận bảng lương chính thức vào cuối kỳ.</p>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-end justify-between">
            <div><p className="text-xs text-slate-500">Tổng giờ làm việc</p><p className="mt-1 text-2xl font-bold text-slate-900">{calc.hours.toFixed(1)}<span className="ml-1 text-sm font-semibold text-slate-500">giờ</span></p></div>
            <div className="text-right"><p className="text-xs text-slate-500">Số ngày làm</p><p className="mt-1 text-xl font-bold text-orange-700">{calc.worked}<span className="ml-1 text-xs font-medium text-slate-500">ngày</span></p></div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-orange-50"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, calc.worked / 26 * 100)}%` }} /></div>
          <p className="mt-2 text-[10px] text-slate-400">Tổng hợp thời gian vào / ra đã ghi nhận trong tháng</p>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-800">{view === "attendance" ? "Chi tiết chấm công" : "Các ngày làm việc"}</h2>
          <span className="text-[10px] text-slate-400">{calc.days.length} bản ghi</span>
        </div>
        {error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{error}</div>
        ) : (
          <ul className="space-y-2">
            {calc.days.map(({ r, h, pay }) => (
              <li key={r.work_date} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{new Date(`${r.work_date}T00:00:00`).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{r.check_in_1 ? `${hm(r.check_in_1)} – ${hm(r.check_out_1) || "…"}` : "Chưa có giờ vào"}{r.check_in_2 ? ` · ${hm(r.check_in_2)} – ${hm(r.check_out_2) || "…"}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-800">{h ? `${h.toFixed(2)} giờ` : "—"}</p>
                    {view === "pay" && <p className="mt-1 text-[10px] font-semibold text-orange-700">{vnd(Math.round(pay))}</p>}
                  </div>
                </div>
                {r.note_text && <p className="mt-2 rounded-lg bg-orange-50 px-2.5 py-2 text-[10px] leading-4 text-orange-800">{r.note_text} · {r.adjustment_amount > 0 ? "−" : "+"}{vnd(Math.abs(r.adjustment_amount))}</p>}
              </li>
            ))}
            {!calc.days.length && <li className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400">{loading ? "Đang tải dữ liệu…" : "Tháng này chưa có dữ liệu chấm công"}</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
