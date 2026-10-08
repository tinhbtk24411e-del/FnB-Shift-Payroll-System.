export type Status = "pending" | "approved" | "rejected";
export type Shift = { id: number; user_id: string; work_date: string; check_in_1: string|null; check_out_1: string|null; check_in_2: string|null; check_out_2: string|null; status: Status };
export type LeaveRequest = { id: number; user_id: string; leave_date: string; reason: string|null; status: Status; approved_by?: string|null };
export type PayrollDay = { user_id: string; emp_code: string; full_name: string; position: string|null; hourly_rate: number; allowance_per_shift: number; work_date: string; check_in_1: string|null; check_out_1: string|null; check_in_2: string|null; check_out_2: string|null; note_text: string|null; adjustment_amount: number };
export type Employee = { id: string; emp_code: string; full_name: string; position: string|null };
