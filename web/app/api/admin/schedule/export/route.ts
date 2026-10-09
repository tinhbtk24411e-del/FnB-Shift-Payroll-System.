import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { adminClient, errorResponse, requireManager } from "@/lib/admin-api";
import type { Shift, Status } from "@/lib/types";

export const runtime = "nodejs";

type ScheduledShift = Shift & {
  users: { emp_code: string; full_name: string; position: string | null } | null;
};

const DAY_NAMES = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];
const STATUS_LABEL: Record<Status, string> = {
  pending: "Chờ xếp",
  approved: "Đã xếp",
  rejected: "Đã từ chối",
};
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

function shiftHours(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return ((minutes(end) - minutes(start) + 1440) % 1440) / 60;
}

function createWorkbook(weekStart: string, shifts: ScheduledShift[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Peony F&B";
  workbook.created = new Date();
  const detail = workbook.addWorksheet("Chi tiết lịch", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  detail.columns = [
    { header: "Ngày", key: "date", width: 15 },
    { header: "Thứ", key: "weekday", width: 16 },
    { header: "Ca", key: "period", width: 16 },
    { header: "Giờ bắt đầu", key: "start", width: 15 },
    { header: "Giờ kết thúc", key: "end", width: 15 },
    { header: "Mã NV", key: "empCode", width: 14 },
    { header: "Tên nhân viên", key: "name", width: 28 },
    { header: "Chức vụ", key: "position", width: 20 },
    { header: "Số giờ", key: "hours", width: 12 },
    { header: "Trạng thái", key: "status", width: 16 },
  ];
  detail.mergeCells(1, 1, 1, 10);
  detail.getCell(1, 1).value = "LỊCH LÀM VIỆC TUẦN";
  detail.mergeCells(2, 1, 2, 10);
  const lastDate = new Date(`${weekStart}T00:00:00`);
  lastDate.setDate(lastDate.getDate() + 6);
  detail.getCell(2, 1).value =
    `Từ ${new Date(`${weekStart}T00:00:00`).toLocaleDateString("vi-VN")} đến ${lastDate.toLocaleDateString("vi-VN")}`;

  for (const rowNumber of [1, 2]) {
    const cell = detail.getCell(rowNumber, 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202D3D" } };
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: rowNumber === 1 ? 14 : 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  detail.getRow(1).height = 26;
  detail.getRow(2).height = 22;
  const header = detail.getRow(3);
  header.values = ["Ngày", "Thứ", "Ca", "Giờ bắt đầu", "Giờ kết thúc", "Mã NV", "Tên nhân viên", "Chức vụ", "Số giờ", "Trạng thái"];
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4B183" } };
    cell.font = { name: "Arial", bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + index);
    return date.toLocaleDateString("sv-SE");
  });
  const sorted = [...shifts].sort((left, right) =>
    left.work_date.localeCompare(right.work_date)
    || (left.check_in_1 ?? "").localeCompare(right.check_in_1 ?? "")
    || (left.users?.emp_code ?? "").localeCompare(right.users?.emp_code ?? ""));

  for (const shift of sorted) {
    const dateIndex = dates.indexOf(shift.work_date);
    const row = detail.addRow({
      date: new Date(`${shift.work_date}T00:00:00`),
      weekday: DAY_NAMES[dateIndex],
      period: isMorning(shift) ? "Ca sáng" : "Ca chiều - tối",
      start: shift.check_in_1?.slice(0, 5) ?? "",
      end: shift.check_out_1?.slice(0, 5) ?? "",
      empCode: shift.users?.emp_code ?? "",
      name: shift.users?.full_name ?? "",
      position: shift.users?.position ?? "",
      hours: shiftHours(shift.check_in_1, shift.check_out_1),
      status: STATUS_LABEL[shift.status],
    });
    row.getCell(1).numFmt = "dd/mm/yyyy";
    row.getCell(9).numFmt = "0.0";
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "middle", horizontal: columnNumber === 7 ? "left" : "center" };
      cell.border = BORDER;
    });
    const statusCell = row.getCell(10);
    statusCell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: shift.status === "approved" ? "FF047857" : shift.status === "pending" ? "FFB45309" : "FFBE123C" },
    };
  }
  detail.autoFilter = { from: "A3", to: "J3" };

  const summary = workbook.addWorksheet("Tổng quan tuần", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
  });
  summary.columns = [
    { header: "Ca", key: "period", width: 20 },
    ...dates.map((date, index) => ({
      header: `${DAY_NAMES[index]}\n${new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`,
      key: date,
      width: 18,
    })),
  ];
  summary.mergeCells(1, 1, 1, 8);
  summary.getCell(1, 1).value = "TỔNG QUAN XẾP CA TRONG TUẦN";
  summary.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202D3D" } };
  summary.getCell(1, 1).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  summary.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 26;
  const summaryHeader = summary.getRow(2);
  summaryHeader.values = ["Ca", ...dates.map((date, index) =>
    `${DAY_NAMES[index]}\n${new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`)];
  summaryHeader.height = 34;
  summaryHeader.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4B183" } };
    cell.font = { name: "Arial", bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });

  for (const morning of [true, false]) {
    const row = summary.addRow([
      morning ? "Ca sáng · 06:00–14:00" : "Ca chiều - tối · 14:00–23:00",
      ...dates.map((date) => {
        const dayShifts = shifts.filter((shift) => shift.work_date === date && isMorning(shift) === morning);
        const approved = dayShifts.filter((shift) => shift.status === "approved").length;
        const pending = dayShifts.filter((shift) => shift.status === "pending").length;
        const rejected = dayShifts.filter((shift) => shift.status === "rejected").length;
        const names = dayShifts.filter((shift) => shift.status !== "rejected")
          .map((shift) => `${shift.users?.full_name ?? "Nhân viên"}${shift.status === "pending" ? " (chờ)" : ""}`);
        const counts = [`Đã xếp: ${approved}`, `Chờ xếp: ${pending}`];
        if (rejected) counts.push(`Từ chối: ${rejected}`);
        return [...counts, "", ...names].join("\n");
      }),
    ]);
    row.height = 110;
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 9, bold: columnNumber === 1 };
      cell.alignment = { vertical: "top", horizontal: columnNumber === 1 ? "left" : "center", wrapText: true };
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
