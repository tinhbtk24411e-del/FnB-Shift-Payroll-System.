"use client";
import { useState } from "react";
import AuthGate, { logout } from "@/AuthGate";
import NotificationBell from "@/components/NotificationBell";
import PayrollAdmin from "@/PayrollAdmin";
import Staff from "@/Staff";

// Trang quản lý: chỉ role 'manager' mới thấy khu vực này.
export default function AdminPage() {
  const [tab, setTab] = useState<"pay" | "staff">("pay");
  const [approvalRequest, setApprovalRequest] = useState(0);
  return (
    <AuthGate need="manager">{(me) => (
      <div className="min-h-screen bg-[#f3f4f6]">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#202d3d] text-white shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <div className="mr-auto flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-500 text-xs font-black">P</span>
              <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[0.12em] text-orange-300">PEONY F&amp;B · QUẢN LÝ</p><p className="truncate text-[11px] text-slate-300">Peony Coffee &amp; Bakery</p></div>
            </div>
            {([["pay", "Quản lý lương"], ["staff", "Nhân viên"]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${tab === key ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>{label}</button>
            ))}
            <div className="flex w-full items-center justify-between border-t border-white/10 pt-2 sm:ml-2 sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
              <NotificationBell recipientId={me.id} onOpenApprovals={() => {
                setTab("pay");
                setApprovalRequest((request) => request + 1);
              }} />
              <span className="ml-3 truncate text-xs font-medium sm:max-w-40">{me.full_name} <span className="text-slate-400">· Quản lý</span></span>
              <button onClick={logout} className="ml-2 rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white">Đăng xuất</button>
            </div>
          </div>
        </header>
        {tab === "pay" ? <PayrollAdmin approvalRequest={approvalRequest} /> : <Staff />}
      </div>)}
    </AuthGate>
  );
}
