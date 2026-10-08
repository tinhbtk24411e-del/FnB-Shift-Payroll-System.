import Link from "next/link";
import employees from "@/data/demo_employees.json";
import summary from "@/data/demo_monthly_summary_october_2026.json";

const money = (n: number) => n.toLocaleString("vi-VN") + " đ";
const roleOrder = ["Quản lý", "Pha chế", "Thu ngân", "Phục vụ"];

export default function DemoPage() {
  const totalHours = summary.reduce((s, x) => s + x.total_hours, 0);
  const totalNet = summary.reduce((s, x) => s + x.net_salary, 0);
  const totalGross = summary.reduce((s, x) => s + x.gross_salary, 0);
  const byRole = roleOrder.map((role) => ({ role, count: employees.filter((e) => e.role === role).length }));

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <header className="bg-orange-600 text-white px-5 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">F&B Shift & Payroll — Demo</div>
            <div className="text-xs opacity-90">Dữ liệu giả lập tháng 10/2026 · thiết bị DEMO-ZK01</div>
          </div>
          <Link href="/" className="rounded-lg bg-white/15 px-4 py-2 text-sm hover:bg-white/25">Vào ứng dụng</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-orange-100 p-4"><div className="text-xs text-slate-500">Nhân viên</div><div className="text-2xl font-bold">{employees.length}</div></div>
          <div className="bg-white rounded-xl border border-orange-100 p-4"><div className="text-xs text-slate-500">Lượt chấm công</div><div className="text-2xl font-bold">800</div></div>
          <div className="bg-white rounded-xl border border-orange-100 p-4"><div className="text-xs text-slate-500">Tổng giờ</div><div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div></div>
          <div className="bg-white rounded-xl border border-orange-100 p-4"><div className="text-xs text-slate-500">Lương gộp</div><div className="text-lg font-bold">{money(totalGross)}</div></div>
          <div className="bg-white rounded-xl border border-orange-100 p-4"><div className="text-xs text-slate-500">Thực nhận ước tính</div><div className="text-lg font-bold text-orange-700">{money(totalNet)}</div></div>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 p-4">
          <h2 className="font-semibold mb-3">Cơ cấu nhân sự</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {byRole.map((x) => <div key={x.role} className="rounded-lg bg-orange-50 px-4 py-3"><div className="text-sm text-slate-500">{x.role}</div><div className="font-semibold">{x.count} người</div></div>)}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 overflow-hidden">
          <div className="px-4 py-4 border-b flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Danh sách 33 nhân viên demo</h2><p className="text-xs text-slate-500">Mức lương/phụ cấp lấy theo cấu hình demo; không phải dữ liệu nhân sự thật.</p></div>
            <span className="text-xs rounded-full bg-orange-100 text-orange-700 px-3 py-1">Chưa cần máy chấm công</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-orange-600 text-white"><tr>{["Mã NV","Họ tên","Chức vụ","Lương giờ","Phụ cấp/ca","Ngày công","Tổng giờ","Thực nhận ước tính"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {summary.map((x) => <tr key={x.emp_code} className="border-t hover:bg-orange-50">
                  <td className="px-3 py-2 font-medium">{x.emp_code}</td><td className="px-3 py-2">{x.full_name}</td><td className="px-3 py-2">{x.role}</td>
                  <td className="px-3 py-2">{money(x.hourly_rate)}</td><td className="px-3 py-2">{money(x.allowance)}</td>
                  <td className="px-3 py-2">{x.days_worked}</td><td className="px-3 py-2">{x.total_hours.toFixed(2)}</td><td className="px-3 py-2 font-semibold">{money(x.net_salary)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-orange-200 bg-orange-100 p-4 text-sm">
          <b>Demo workflow:</b> `DEMO-ZK01 → attendance_logs → v_payroll_days → bảng công → Excel`.
          Khi tích hợp ZKTeco/Ronald Jack thật, chỉ cần thay nguồn attendance và giữ nguyên các module payroll/Excel.
        </section>
      </div>
    </main>
  );
}
