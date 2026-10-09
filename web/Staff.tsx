"use client";
// Quản lý hồ sơ nhân viên (HRM): thêm / sửa / khoá, lương giờ, ngân hàng, mã chấm công, đặt lại mật khẩu.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "./Toast";

type F = { id?: string; emp_code: string; full_name: string; phone: string; position: string; role: "employee" | "manager";
  device_pin: string; bank_name: string; bank_account_no: string; bank_account_name: string;
  hourly_rate: string; password: string; is_active: boolean };
const BLANK: F = { emp_code: "", full_name: "", phone: "", position: "", role: "employee", device_pin: "", bank_name: "",
  bank_account_no: "", bank_account_name: "", hourly_rate: "25000", password: "", is_active: true };
const n = (s: string) => Math.max(0, Math.round(Number(s.replace(/[.,\s]/g, "")) || 0));
const nul = (s: string) => s.trim() || null; // chuỗi rỗng -> NULL (tránh vi phạm unique của phone)

export default function Staff() {
  const { toast, node } = useToast();
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState<F | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("users").select("*, roles_rates(hourly_rate)").order("emp_code");
    if (error) return toast("err", error.message);
    setList(data ?? []);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }
  function apiErrorMessage(body: unknown, status: number, statusText: string) {
    if (typeof body === "object" && body !== null && "detail" in body) {
      const detail = body.detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const messages = detail.map((item) => {
          if (typeof item !== "object" || item === null) return String(item);
          const issue = item as { loc?: unknown; msg?: unknown };
          const field = Array.isArray(issue.loc) ? issue.loc.filter((part): part is string => typeof part === "string").join(".") : "";
          const message = typeof issue.msg === "string" ? issue.msg : "";
          return field && message ? `${field}: ${message}` : message || JSON.stringify(item);
        }).filter(Boolean);
        if (messages.length) return messages.join("; ");
      }
    }
    return `API trả lỗi ${status}${statusText ? ` (${statusText})` : ""}, không có thông tin chi tiết.`;
  }
  async function api(path: string, body: unknown) {
    const res = await fetch(`/api${path}`, { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      const responseBody: unknown = await res.json().catch(() => null);
      throw new Error(apiErrorMessage(responseBody, res.status, res.statusText));
    }
  }

  async function save() {
    if (!f) return;
    if (!f.emp_code.trim() || !f.full_name.trim()) return toast("err", "Cần nhập mã NV và họ tên");
    setBusy(true);
    try {
      const prof = { full_name: f.full_name.trim(), phone: nul(f.phone), position: nul(f.position), role: f.role, device_pin: nul(f.device_pin),
        bank_name: nul(f.bank_name), bank_account_no: nul(f.bank_account_no), bank_account_name: nul(f.bank_account_name) };
      const rate = { hourly_rate: n(f.hourly_rate) };
      if (!f.id) {
        if (f.password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
        await api("/admin/users", { emp_code: f.emp_code.trim(), password: f.password, ...prof, ...rate });
      } else {
        const u = await supabase.from("users").update({ ...prof, is_active: f.is_active }).eq("id", f.id);
        if (u.error) throw u.error;
        const r = await supabase.from("roles_rates").upsert({ user_id: f.id, ...rate }, { onConflict: "user_id" });
        if (r.error) throw r.error;
        if (f.password) await api(`/admin/users/${f.id}/password`, { password: f.password });
      }
      toast("ok", f.id ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên"); setF(null); load();
    } catch (e: any) { toast("err", e.message); }
    setBusy(false);
  }

  const edit = (u: any) => { const r = Array.isArray(u.roles_rates) ? u.roles_rates[0] : u.roles_rates;
    setF({ id: u.id, emp_code: u.emp_code, full_name: u.full_name, phone: u.phone ?? "", position: u.position ?? "", role: u.role,
      device_pin: u.device_pin ?? "", bank_name: u.bank_name ?? "", bank_account_no: u.bank_account_no ?? "", bank_account_name: u.bank_account_name ?? "",
      hourly_rate: String(r?.hourly_rate ?? 0), password: "", is_active: u.is_active }); };

  const inp = "mt-1 w-full border rounded px-2 py-1.5";
  const fld = (label: string, k: keyof F, extra: object = {}) => (
    <label className="text-sm">{label}<input className={inp} value={String(f![k])} onChange={(e) => setF({ ...f!, [k]: e.target.value })} {...extra} /></label>);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      {node}
      <div className="flex items-center justify-between"><h1 className="font-semibold text-lg">Nhân viên ({list.length})</h1>
        <button onClick={() => setF({ ...BLANK })} className="bg-orange-600 text-white rounded-lg px-4 py-2">Thêm nhân viên</button></div>

      {f && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-4">
          <h2 className="font-medium">{f.id ? `Sửa ${f.emp_code}` : "Nhân viên mới"}</h2>
          <div className="grid grid-cols-3 gap-3">
            {fld("Mã NV", "emp_code", { disabled: !!f.id })}{fld("Họ tên", "full_name")}{fld("Chức vụ", "position", { placeholder: "Pha chế, Thu ngân…" })}
            {fld("Số điện thoại", "phone")}{fld("Mã trên máy chấm công", "device_pin")}
            <label className="text-sm">Quyền<select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as F["role"] })}>
              <option value="employee">Nhân viên</option><option value="manager">Quản lý</option></select></label>
            {fld("Lương giờ (đ)", "hourly_rate", { inputMode: "numeric" })}
            <p className="self-end rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Phụ cấp cơm: 25.000đ khi làm đủ 8 giờ trong ngày; dưới 8 giờ không có phụ cấp.</p>
            {fld(f.id ? "Mật khẩu mới (bỏ trống nếu không đổi)" : "Mật khẩu (≥ 6 ký tự)", "password", { type: "password", autoComplete: "new-password" })}
            {fld("Ngân hàng", "bank_name")}{fld("Số tài khoản", "bank_account_no")}{fld("Tên chủ tài khoản", "bank_account_name")}
          </div>
          {f.id && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Đang làm việc (bỏ chọn để khoá đăng nhập)</label>}
          <div className="flex gap-2"><button onClick={save} disabled={busy} className="bg-orange-600 text-white rounded-lg px-5 py-2 disabled:opacity-60">{busy ? "Đang lưu…" : "Lưu"}</button>
            <button onClick={() => setF(null)} className="border rounded-lg px-5 py-2">Huỷ</button></div>
        </section>)}

      <table className="w-full text-sm border rounded-xl overflow-hidden">
        <thead className="bg-orange-600 text-white"><tr>{["Mã NV", "Họ tên", "Chức vụ", "SĐT", "Lương giờ", "Phụ cấp cơm", "Ngân hàng", ""].map((h) => <th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.map((u) => { const r = Array.isArray(u.roles_rates) ? u.roles_rates[0] : u.roles_rates;
          return (<tr key={u.id} className={`border-t hover:bg-orange-50 ${u.is_active ? "" : "text-gray-400"}`}>
            <td className="p-2">{u.emp_code}{u.role === "manager" && <span className="ml-1 text-xs text-orange-700">(QL)</span>}</td><td className="p-2">{u.full_name}</td><td className="p-2">{u.position}</td><td className="p-2">{u.phone}</td>
            <td className="p-2">{(r?.hourly_rate ?? 0).toLocaleString("vi-VN")}</td><td className="p-2">25.000đ nếu đủ 8 giờ</td>
            <td className="p-2">{u.bank_name ? `${u.bank_name} · ${u.bank_account_no ?? ""}` : ""}</td>
            <td className="p-2 text-right"><button onClick={() => edit(u)} className="text-orange-700 hover:underline">Sửa</button></td></tr>); })}
          {!list.length && <tr><td colSpan={8} className="p-6 text-center text-gray-400">Chưa có nhân viên</td></tr>}</tbody>
      </table>
    </div>
  );
}
