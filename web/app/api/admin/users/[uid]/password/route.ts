import type { NextRequest } from "next/server";
import { errorResponse, requireManager } from "@/lib/admin-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { uid: string } }) {
  const access = await requireManager(request);
  if ("response" in access) return access.response;

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Dữ liệu gửi lên không phải JSON hợp lệ.");
  }
  if (typeof body.password !== "string" || body.password.length < 6) {
    return errorResponse("Mật khẩu phải có ít nhất 6 ký tự.");
  }

  const { data: target, error: targetError } = await access.client
    .from("users")
    .select("id")
    .eq("id", params.uid)
    .maybeSingle();
  if (targetError) {
    console.error("Could not verify employee before password reset:", targetError);
    return errorResponse("Không xác minh được tài khoản nhân viên.", 500);
  }
  if (!target) return errorResponse("Không tìm thấy tài khoản nhân viên.", 404);

  const { error } = await access.client.auth.admin.updateUserById(params.uid, { password: body.password });
  if (error) {
    console.error("Could not reset employee password:", error);
    return errorResponse("Không đổi được mật khẩu nhân viên.");
  }
  return Response.json({ ok: true });
}
