import type { NextRequest } from "next/server";
import { errorResponse, requireManager } from "@/lib/admin-api";

export const runtime = "nodejs";

type NewUserBody = {
  emp_code?: unknown;
  full_name?: unknown;
  password?: unknown;
  phone?: unknown;
  position?: unknown;
  role?: unknown;
  device_pin?: unknown;
  bank_name?: unknown;
  bank_account_no?: unknown;
  bank_account_name?: unknown;
  hourly_rate?: unknown;
  allowance_per_shift?: unknown;
};

const optionalText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
};

export async function POST(request: NextRequest) {
  const access = await requireManager(request);
  if ("response" in access) return access.response;

  let body: NewUserBody;
  try {
    body = await request.json() as NewUserBody;
  } catch {
    return errorResponse("Dữ liệu gửi lên không phải JSON hợp lệ.");
  }

  const empCode = typeof body.emp_code === "string" ? body.emp_code.trim() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role ?? "employee";
  const hourlyRate = body.hourly_rate ?? 0;
  const allowance = body.allowance_per_shift ?? 0;

  if (!empCode || empCode.length > 20 || !/^[A-Za-z0-9_.-]+$/.test(empCode)) {
    return errorResponse("Mã nhân viên chỉ được chứa chữ, số, dấu gạch dưới, chấm hoặc gạch ngang (tối đa 20 ký tự).");
  }
  if (!fullName || fullName.length > 200) return errorResponse("Họ tên không hợp lệ.");
  if (password.length < 6) return errorResponse("Mật khẩu phải có ít nhất 6 ký tự.");
  if (role !== "employee" && role !== "manager") return errorResponse("Quyền tài khoản không hợp lệ.");
  if (!Number.isSafeInteger(hourlyRate) || Number(hourlyRate) < 0) return errorResponse("Lương giờ phải là số nguyên không âm.");
  if (!Number.isSafeInteger(allowance) || Number(allowance) < 0) return errorResponse("Phụ cấp phải là số nguyên không âm.");

  const optionalFields = {
    phone: optionalText(body.phone),
    position: optionalText(body.position),
    device_pin: optionalText(body.device_pin),
    bank_name: optionalText(body.bank_name),
    bank_account_no: optionalText(body.bank_account_no),
    bank_account_name: optionalText(body.bank_account_name),
  };
  if (Object.values(optionalFields).some((value) => value === undefined)) {
    return errorResponse("Các thông tin hồ sơ tùy chọn phải là chuỗi.");
  }

  const email = `${empCode.toLowerCase()}@company.local`;
  let created;
  let createError;
  try {
    const result = await access.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    created = result.data;
    createError = result.error;
  } catch (error) {
    console.error("Could not reach Supabase Auth to create employee:", error);
    return errorResponse("Không kết nối được Supabase Auth để tạo tài khoản.", 503);
  }
  if (createError || !created.user) {
    if (createError?.message.toLowerCase().includes("already")) {
      return errorResponse("Mã nhân viên này đã có tài khoản đăng nhập.", 409);
    }
    console.error("Could not create employee Auth account:", createError);
    return errorResponse("Không tạo được tài khoản đăng nhập cho nhân viên.");
  }

  const profile = {
    id: created.user.id,
    emp_code: empCode,
    full_name: fullName,
    role,
    is_active: true,
    ...optionalFields,
  };
  let profileError;
  try {
    ({ error: profileError } = await access.client.from("users").insert(profile));
  } catch (error) {
    console.error("Could not reach Supabase to save employee profile:", error);
    const { error: rollbackError } = await access.client.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error("Failed to roll back employee after profile request failed:", rollbackError);
    return errorResponse("Không lưu được hồ sơ nhân viên do lỗi kết nối.", 503);
  }
  if (profileError) {
    const { error: rollbackError } = await access.client.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error("Failed to roll back orphaned employee Auth account:", rollbackError);
    if (profileError.code === "23505") {
      return errorResponse("Mã nhân viên, số điện thoại hoặc mã chấm công đã được sử dụng.", 409);
    }
    console.error("Could not save employee profile:", profileError);
    return errorResponse("Không lưu được hồ sơ nhân viên.");
  }

  let rateError;
  try {
    ({ error: rateError } = await access.client.from("roles_rates").insert({
      user_id: created.user.id,
      hourly_rate: hourlyRate,
      allowance_per_shift: allowance,
    }));
  } catch (error) {
    console.error("Could not reach Supabase to save employee rate:", error);
    const { error: rollbackError } = await access.client.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error("Failed to roll back employee after rate request failed:", rollbackError);
    return errorResponse("Không lưu được cấu hình lương do lỗi kết nối.", 503);
  }
  if (rateError) {
    const { error: rollbackError } = await access.client.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error("Failed to roll back employee after rate insert failed:", rollbackError);
    if (rateError.code === "23505") {
      return errorResponse("Không tạo được cấu hình lương: nhân viên đã tồn tại.", 409);
    }
    console.error("Could not save employee rate:", rateError);
    return errorResponse("Không lưu được cấu hình lương cho nhân viên.");
  }

  return Response.json({ id: created.user.id }, { status: 201 });
}
