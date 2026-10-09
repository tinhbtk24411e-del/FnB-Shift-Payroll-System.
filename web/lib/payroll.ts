import type { PayrollDay } from "./types";

const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function payrollHours(row: Pick<PayrollDay, "check_in_1" | "check_out_1" | "check_in_2" | "check_out_2">) {
  const span = (start: string | null, end: string | null) =>
    start && end ? ((minutes(end) - minutes(start) + 1440) % 1440) / 60 : 0;
  return span(row.check_in_1, row.check_out_1) + span(row.check_in_2, row.check_out_2);
}

export function mealAllowance(hours: number) {
  return hours >= 8 ? 25_000 : 0;
}

export function payrollDayPay(row: PayrollDay) {
  const hours = payrollHours(row);
  return hours * row.hourly_rate + mealAllowance(hours);
}
