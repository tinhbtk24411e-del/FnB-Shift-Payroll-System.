import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import type { PayrollDay } from "@/lib/types";
import { adminClient, errorResponse, requireManager } from "@/lib/admin-api";

export const runtime = "nodejs";

const MONTHS = ["Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy", "CN"];
const HEADERS = [
  "Mã NV", "Tên nhân viên", "Chức vụ", "Ngày", "Thứ", "Vào 1", "Ra 1", "Vào 2", "Ra 2",
  "GIỜ CÔNG", "PHỤ CẤP", "LƯƠNG GIỜ", "LƯƠNG NGÀY", "LƯƠNG THÁNG",
  "TỔNG GIỜ\nCÔNG THÁNG", "NOTE", "TỔNG THU NHẬP",
];
const WIDTHS = [10, 24, 14, 13, 7, 9, 9, 9, 9, 11, 13, 13, 15, 16, 16, 34, 17];
const BORDER: ExcelJS.Borders = {
  diagonal: {},
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};
const ORANGE = "FFF4B183";
const PEACH = "FFFCE4D6";
const moneyFormat = '#,##0;[Red](#,##0);-';

type EmployeePayroll = Pick<PayrollDay, "emp_code" | "full_name" | "position" | "hourly_rate"> & {
  allowance: number;
  days: PayrollDay[];
};

function excelDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function excelTime(value: string | null) {
  if (!value) return null;
  const [hour, minute, second = 0] = value.split(":").map(Number);
  return (hour * 3600 + minute * 60 + second) / 86_400;
}

function adjustmentNote(note: string | null, adjustment: number) {
  const lines = note ? [note] : [];
  if (adjustment) {
    const sign = adjustment > 0 ? "Trừ" : "Cộng";
    lines.push(`${sign}: ${Math.abs(adjustment).toLocaleString("vi-VN")} đ`);
  }
  return lines.join("\n");
}

async function loadPayrollRows(
  client: ReturnType<typeof adminClient>,
  monthStart: string,
  monthEnd: string,
): Promise<{ rows: PayrollDay[] } | { error: string }> {
  const rows: PayrollDay[] = [];

  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("v_payroll_days").select("*")
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd)
      .order("emp_code")
      .order("work_date")
      .range(start, start + 999);
    if (error) {
      console.error("Could not load payroll data for Excel export:", error);
      return { error: "Không tải được dữ liệu bảng lương để xuất Excel." };
    }
    rows.push(...((data ?? []) as PayrollDay[]));
    if (!data || data.length < 1000) break;
  }
  return { rows };
}

function createWorkbook(month: number, year: number, employees: EmployeePayroll[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Peony F&B";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const worksheet = workbook.addWorksheet("Bảng lương", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  worksheet.columns = [
    ...WIDTHS.map((width) => ({ width })),
    { width: 14, hidden: true },
  ];

  worksheet.mergeCells(1, 1, 1, HEADERS.length);
  worksheet.getCell(1, 1).value = "GIỜ CHẤM CÔNG";
  worksheet.mergeCells(2, 1, 2, HEADERS.length);
  worksheet.getCell(2, 1).value =
    `Từ ngày 01/${String(month).padStart(2, "0")}/${year} đến ngày ${String(new Date(year, month, 0).getDate()).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

  for (const rowNumber of [1, 2]) {
    const cell = worksheet.getCell(rowNumber, 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };
    cell.font = { name: "Arial", bold: true, color: { argb: "FF000000" }, size: rowNumber === 1 ? 13 : 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 20;

  const header = worksheet.getRow(3);
  HEADERS.forEach((title, index) => {
    const cell = header.getCell(index + 1);
    cell.value = title;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };
    cell.font = { name: "Arial", bold: true, color: { argb: "FF000000" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });
  header.height = 42;

  let rowNumber = 4;
  for (const employee of employees) {
    const firstRow = rowNumber;
    for (const day of employee.days) {
      const currentRow = rowNumber++;
      const cells = worksheet.getRow(currentRow);
      cells.getCell(1).value = employee.emp_code;
      cells.getCell(2).value = employee.full_name;
      cells.getCell(3).value = employee.position ?? "";
      cells.getCell(4).value = excelDate(day.work_date);
      cells.getCell(4).numFmt = "dd/mm/yyyy";
      cells.getCell(5).value = MONTHS[new Date(`${day.work_date}T00:00:00`).getDay() === 0
        ? 6
        : new Date(`${day.work_date}T00:00:00`).getDay() - 1];
      [day.check_in_1, day.check_out_1, day.check_in_2, day.check_out_2].forEach((time, index) => {
        const cell = cells.getCell(index + 6);
        cell.value = excelTime(time);
        cell.numFmt = "hh:mm";
      });
      cells.getCell(10).value = {
        formula: `IF(AND(F${currentRow}<>"",G${currentRow}<>""),MOD(G${currentRow}-F${currentRow},1)*24,0)+IF(AND(H${currentRow}<>"",I${currentRow}<>""),MOD(I${currentRow}-H${currentRow},1)*24,0)`,
      };
      cells.getCell(11).value = day.check_in_1 && day.check_out_1 ? employee.allowance : 0;
      cells.getCell(12).value = Number(day.hourly_rate);
      cells.getCell(13).value = { formula: `J${currentRow}*L${currentRow}+K${currentRow}` };
      cells.getCell(16).value = adjustmentNote(day.note_text, Number(day.adjustment_amount));
      cells.getCell(18).value = Number(day.adjustment_amount);
      cells.getCell(18).numFmt = moneyFormat;
      cells.getCell(10).numFmt = "0.0";
      for (const column of [11, 12, 13]) cells.getCell(column).numFmt = moneyFormat;
      cells.height = day.note_text ? 32 : 20;
      for (let column = 1; column <= 18; column += 1) {
        const cell = cells.getCell(column);
        cell.font = { name: "Arial", size: 9 };
        cell.alignment = {
          horizontal: column === 2 || column === 16 ? "left" : "center",
          vertical: "middle",
          wrapText: column === 16,
        };
        cell.border = BORDER;
      }
      cells.getCell(16).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    }

    const lastRow = rowNumber - 1;
    for (const column of [1, 2, 3, 14, 15, 17]) {
      worksheet.mergeCells(firstRow, column, lastRow, column);
    }
    worksheet.getCell(firstRow, 14).value = { formula: `SUM(M${firstRow}:M${lastRow})` };
    worksheet.getCell(firstRow, 15).value = { formula: `SUM(J${firstRow}:J${lastRow})` };
    worksheet.getCell(firstRow, 15).numFmt = "0.0";
    worksheet.getCell(firstRow, 17).value = { formula: `N${firstRow}-SUM(R${firstRow}:R${lastRow})` };
    for (const column of [14, 17]) worksheet.getCell(firstRow, column).numFmt = moneyFormat;
    for (let row = firstRow; row <= lastRow; row += 1) {
      worksheet.getCell(row, 14).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PEACH } };
      worksheet.getCell(row, 17).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PEACH } };
      for (const column of [1, 2, 3, 14, 15, 17]) {
        worksheet.getCell(row, column).border = BORDER;
      }
    }
    for (const column of [1, 2, 3, 14, 15, 17]) {
      worksheet.getCell(firstRow, column).font = { name: "Arial", size: 9, bold: true };
      worksheet.getCell(firstRow, column).alignment = {
        horizontal: column === 2 ? "center" : "center",
        vertical: "middle",
        wrapText: true,
      };
    }
  }

  return workbook;
}

export async function GET(request: NextRequest) {
  const access = await requireManager(request);
  if ("response" in access) return access.response;

  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return errorResponse("Tháng phải là số nguyên từ 1 đến 12.");
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return errorResponse("Năm phải là số nguyên hợp lệ.");
  }

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
  let loaded: Awaited<ReturnType<typeof loadPayrollRows>>;
  try {
    loaded = await loadPayrollRows(access.client, monthStart, monthEnd);
  } catch (error) {
    console.error("Could not prepare payroll export:", error);
    return errorResponse("Không thể chuẩn bị dữ liệu bảng lương để xuất Excel.", 500);
  }
  if ("error" in loaded) return errorResponse(loaded.error, 500);

  const grouped = new Map<string, EmployeePayroll>();
  for (const row of loaded.rows) {
    const employee = grouped.get(row.user_id) ?? {
      emp_code: row.emp_code,
      full_name: row.full_name,
      position: row.position,
      hourly_rate: row.hourly_rate,
      allowance: Number(row.allowance_per_shift),
      days: [],
    };
    employee.days.push(row);
    grouped.set(row.user_id, employee);
  }

  try {
    const workbook = createWorkbook(month, year, [...grouped.values()]);
    const bytes = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bang-luong-${year}-${String(month).padStart(2, "0")}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Could not generate payroll workbook:", error);
    return errorResponse("Không thể tạo file Excel bảng lương.", 500);
  }
}
