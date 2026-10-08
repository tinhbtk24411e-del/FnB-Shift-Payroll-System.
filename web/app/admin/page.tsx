"use client";
import { useState } from "react";
import AuthGate, { logout } from "@/AuthGate";
import PayrollAdmin from "@/PayrollAdmin";
import Staff from "@/Staff";

// Trang quản lý (desktop): chỉ role 'manager'
export default function AdminPage() {
  const [tab, setTab] = useState<"pay" | "staff">("pay");
  return (
    <AuthGate need="manager">{(me) => (
      <div className="min-h-screen">
        <header className="bg-orange-600 text-white px-8 py-3 flex items-center gap-6">
          <b>Ca làm & Bảng lương</b>
          {([["pay", "Ca & bảng lương"], ["staff", "Nhân viên"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={tab === k ? "underline underline-offset-8" : "opacity-80"}>{l}</button>))}
          <span className="ml-auto text-sm">{me.full_name}</span><button onClick={logout} className="text-sm underline">Đăng xuất</button>
        </header>
        {tab === "pay" ? <PayrollAdmin /> : <Staff />}
      </div>)}
    </AuthGate>
  );
}
