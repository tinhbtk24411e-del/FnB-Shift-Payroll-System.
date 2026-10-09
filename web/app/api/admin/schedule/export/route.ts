import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { adminClient, errorResponse, requireManager } from "@/lib/admin-api";
import type { Shift } from "@/lib/types";

export const runtime = "nodejs";

type ScheduledShift = Shift & {
  users: { emp_code: string; full_name: string; position: string | null } | null;
};

const DAY_NAMES = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];
const BORDER: ExcelJS.Borders = {
  diagonal: {},
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function isMorning(shift: Shift) {
  return (shift.check_in_1 ?? "00:00") < "12:00";
}

function createWorkbook(weekStart: string, shifts: ScheduledShift[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Peony F&B";
  workbook.created = new Date();
  const summary = workbook.addWorksheet("Tổng quan tuần", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  summary.columns = [
    { header: "Ca", key: "period", width: 24 },
    ...Array.from({ length: 7 }, (_, index) => ({ key: `day${index}`, width: 22 })),
  ];
  summary.mergeCells(1, 1, 1, 8);
  summary.getCell(1, 1).value = "TỔNG QUAN XẾP CA TRONG TUẦN";
  summary.mergeCells(2, 1, 2, 8);
  const lastDate = new Date(`${weekStart}T00:00:00`);
  lastDate.setDate(lastDate.getDate() + 6);
  summary.getCell(2, 1).value =
    `Từ ${new Date(`${weekStart}T00:00:00`).toLocaleDateString("vi-VN")} đến ${lastDate.toLocaleDateString("vi-VN")}`;

  for (const rowNumber of [1, 2]) {
    const cell = summary.getCell(rowNumber, 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber === 1 ? "FF202D3D" : "FFE2E8F0" } };
    cell.font = { name: "Arial", bold: rowNumber === 1, color: { argb: "FF1E293B" }, size: rowNumber === 1 ? 14 : 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  summary.getCell(1, 1).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  summary.getRow(1).height = 28;
  summary.getRow(2).height = 22;

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + index);
    return date.toLocaleDateString("sv-SE");
  });
  const header = summary.getRow(3);
  header.values = ["Ca", ...dates.map((date, index) =>
    `${DAY_NAMES[index]}\n${new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`)];
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4B183" } };
    cell.font = { name: "Arial", bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });

  const approvedShifts = shifts.filter((shift) => shift.status === "approved");
  for (const morning of [true, false]) {
    const dayEntries = dates.map((date) =>
      approvedShifts
        .filter((shift) => shift.work_date === date && isMorning(shift) === morning)
        .sort((left, right) =>
          (left.check_in_1 ?? "").localeCompare(right.check_in_1 ?? "")
          || (left.users?.emp_code ?? "").localeCompare(right.users?.emp_code ?? ""))
        .map((shift) => `${shift.users?.full_name ?? "Nhân viên"}\n${shift.check_in_1?.slice(0, 5) ?? "--:--"} – ${shift.check_out_1?.slice(0, 5) ?? "--:--"}`));
    const row = summary.addRow([
      morning ? "Ca sáng · 06:00–14:00" : "Ca chiều - tối · 14:00–23:00",
      ...dayEntries.map((entries) => entries.join("\n\n")),
    ]);
    row.height = Math.max(48, ...dayEntries.map((entries) => entries.length * 34 + 12));
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 10, bold: columnNumber === 1 };
      cell.alignment = { vertical: "middle", horizontal: columnNumber === 1 ? "left" : "center", wrapText: true };
      cell.border = BORDER;
      if (columnNumber > 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
  }
  return workbook;
}

export async function GET(request: NextRequest) {
  const access = await requireManager(request);
  if ("response" in access) return access.response;

  const weekStart = request.nextUrl.searchParams.get("weekStart") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return errorResponse("Ngày bắt đầu tuần không hợp lệ.");
  }
  const monday = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(monday.getTime()) || monday.toLocaleDateString("sv-SE") !== weekStart || (monday.getDay() + 6) % 7 !== 0) {
    return errorResponse("Ngày bắt đầu phải là thứ hai hợp lệ.");
  }
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toLocaleDateString("sv-SE");

  try {
    const shifts: ScheduledShift[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await access.client.from("shifts")
        .select("*, users:users!shifts_user_id_fkey(emp_code, full_name, position)")
        .gte("work_date", weekStart)
        .lte("work_date", weekEnd)
        .order("work_date")
        .order("check_in_1")
        .range(offset, offset + 999);
      if (error) {
        console.error("Could not load manager schedule for Excel export:", error);
        return errorResponse("Không tải được lịch làm để xuất Excel.", 500);
      }
      shifts.push(...((data ?? []) as ScheduledShift[]));
      if (!data || data.length < 1000) break;
    }

    const workbook = createWorkbook(weekStart, shifts);
    const bytes = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lich-lam-${weekStart}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Could not generate manager schedule workbook:", error);
    return errorResponse("Không thể tạo file Excel lịch làm.", 500);
  }
}
