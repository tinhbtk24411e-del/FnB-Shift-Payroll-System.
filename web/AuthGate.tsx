"use client";
// Cổng đăng nhập: chưa đăng nhập -> form; đã đăng nhập -> render children(me). need="manager" thì chặn nhân viên thường.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export type Me = { id: string; emp_code: string; full_name: string; role: "employee" | "manager"; position: string | null };
export const logout = () => supabase.auth.signOut();

function LoginForm({ notice }: { notice?: string }) {
  const [id, setId] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(notice ?? ""), [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      // resolve_login maps an active employee code/phone to the Auth email.
      const { data: email, error: resolveError } = await supabase.rpc("resolve_login", { identifier: id.trim() });
      if (resolveError) {
        setErr(resolveError.code === "PGRST202"
          ? "Dự án Supabase chưa có hàm resolve_login. Hãy chạy database/01_schema_v2.sql trong SQL Editor."
          : "Không gọi được resolve_login. Kiểm tra schema Supabase và quyền RPC; chưa xác minh được tài khoản.");
        return;
      }
      if (!email) {
        setErr("Không tìm thấy mã nhân viên hoặc số điện thoại đang hoạt động. Kiểm tra hồ sơ nhân viên và dữ liệu demo trong Supabase.");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (authError) {
        setErr(authError.code === "invalid_credentials"
          ? "Không đăng nhập được tài khoản Auth tương ứng. Kiểm tra tài khoản đã được tạo và mật khẩu."
          : "Supabase Auth không hoàn tất đăng nhập. Kiểm tra cấu hình Auth của dự án.");
      }
    } catch {
      setErr("Không kết nối được Supabase. Kiểm tra URL, publishable/anon key và kết nối mạng.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4 py-8 text-slate-800 sm:px-6">
      <section className="w-full max-w-[410px] rounded-[24px] border border-slate-100 bg-white px-6 py-7 shadow-[0_20px_60px_rgba(28,39,70,0.10)] sm:px-9 sm:py-9">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/icons/icon-192.png"
            alt="F&B"
            width={56}
            height={56}
            priority
            className="mb-4 rounded-2xl shadow-sm"
          />
          <span className="mb-3 rounded-full bg-orange-50 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-orange-700">
            PEONY F&B STAFF PORTAL
          </span>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">Chào mừng!</h1>
          <p className="mt-2 max-w-xs text-sm leading-5 text-slate-500">
            Hệ thống quản lý ca làm, chấm công và lương cho đội ngũ Peony Coffee &amp; Bakery.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="workplace" className="block text-xs font-semibold text-slate-700">
            Cơ sở làm việc
          </label>
          <div className="relative -mt-2">
            {/* The current auth flow is branch-agnostic; this selector is presentation-only. */}
            <select
              id="workplace"
              defaultValue="peony"
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              <option value="peony">Peony Coffee &amp; Bakery</option>
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <label htmlFor="login-id" className="block text-xs font-semibold text-slate-700">
            Mã nhân viên hoặc số điện thoại
          </label>
          <div className="relative -mt-2">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 16a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="login-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              placeholder="Nhập mã nhân viên hoặc số điện thoại"
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />
          </div>

          <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">Mật khẩu</label>
          <div className="relative -mt-2">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <rect x="4.5" y="8.5" width="11" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 outline-none hover:bg-slate-50 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              {showPassword ? (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M3 3 17 17M8.6 8.7a2 2 0 0 0 2.7 2.7M6.2 5.4A9.7 9.7 0 0 1 10 4.5c4.5 0 7.5 5.5 7.5 5.5a12 12 0 0 1-2.3 2.8M4.2 6.7A13 13 0 0 0 2.5 10S5.5 15.5 10 15.5c.7 0 1.4-.1 2-.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          </div>

          <label className="flex cursor-default items-start gap-2.5 pt-1 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              aria-describedby="login-session-note"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-600"
            />
            <span>
              Ghi nhớ đăng nhập trên thiết bị này
              <span id="login-session-note" className="block text-[10px] text-slate-400">
                Phiên đăng nhập hiện được lưu tự động theo cài đặt hệ thống.
              </span>
            </span>
          </label>
          {err && <p role="alert" aria-live="polite" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-semibold text-white shadow-[0_5px_12px_rgba(234,88,12,0.2)] transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 animate-spin">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity=".3" strokeWidth="2.5" />
                  <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Đang đăng nhập…
              </>
            ) : "Đăng nhập"}
          </button>
          <a href="/demo" className="block pt-1 text-center text-xs font-medium text-orange-700 hover:underline">
            Xem demo khách hàng không cần máy chấm công
          </a>
        </form>

        <footer className="mt-6 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] font-medium text-slate-600">Hỗ trợ nội bộ HR &amp; IT: 1900 68xx (Nhánh 2)</p>
          <p className="mt-2 text-[10px] text-slate-400">Phiên bản v2.4.0 <span className="px-1">·</span> Bản quyền © 2026 Peony Group</p>
        </footer>
      </section>
    </main>
  );
}

export default function AuthGate({ need, children }: { need?: "manager"; children: (me: Me) => ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "ready">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setNotice("Không đọc được phiên đăng nhập từ Supabase. Hãy tải lại trang và kiểm tra cấu hình Auth.");
      setMe(null);
      return setState("out");
    }
    if (!session) { setMe(null); return setState("out"); }
    const { data, error } = await supabase.from("users").select("id, emp_code, full_name, role, position, is_active").eq("id", session.user.id).maybeSingle();
    if (error) {
      setNotice(error.code === "42501"
        ? "Đăng nhập Auth thành công nhưng bị từ chối đọc hồ sơ. Kiểm tra quyền SELECT/RLS của bảng users."
        : "Đăng nhập Auth thành công nhưng không đọc được hồ sơ từ bảng users. Kiểm tra schema và kết nối Supabase.");
      setMe(null);
      setState("out");
      await supabase.auth.signOut();
      return;
    }
    if (!data) {
      setNotice("Tài khoản Auth chưa có hồ sơ tương ứng trong bảng users.");
      setMe(null);
      setState("out");
      await supabase.auth.signOut();
      return;
    }
    if (!data.is_active) {
      setNotice("Hồ sơ nhân viên đã bị vô hiệu hoá. Liên hệ quản lý để được kích hoạt.");
      setMe(null);
      setState("out");
      await supabase.auth.signOut();
      return;
    }
    setMe(data as Me); setState("ready");
  }, []);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(load, 0)); // setTimeout tránh gọi Supabase ngay trong callback
    return () => data.subscription.unsubscribe();
  }, [load]);

  if (state === "loading") return <main className="min-h-screen grid place-items-center text-gray-500">Đang tải…</main>;
  if (state === "out" || !me) return <LoginForm notice={notice} />;
  if (need === "manager" && me.role !== "manager")
    return (<main className="min-h-screen grid place-items-center p-6 text-center"><div>
      <p className="mb-4">Trang này chỉ dành cho quản lý.</p>
      <a href="/" className="text-orange-700 underline mr-4">Về trang nhân viên</a>
      <button onClick={logout} className="text-gray-600 underline">Đăng xuất</button></div></main>);
  return <>{children(me)}</>;
}
