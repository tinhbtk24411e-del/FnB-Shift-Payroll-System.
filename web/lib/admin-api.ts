import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

type AdminSupabaseClient = SupabaseClient<any, "public">;

type ManagerAccess =
  | { client: AdminSupabaseClient }
  | { response: Response };

export function adminClient(): AdminSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server configuration is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireManager(request: NextRequest): Promise<ManagerAccess> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return { response: Response.json({ detail: "Cần đăng nhập bằng tài khoản quản lý." }, { status: 401 }) };
  }

  let client: AdminSupabaseClient;
  try {
    client = adminClient();
  } catch (error) {
    console.error("Admin API configuration error:", error);
    return { response: Response.json({ detail: "API chưa được cấu hình khóa Supabase server." }, { status: 500 }) };
  }

  let userId: string;
  try {
    const { data: { user }, error: authError } = await client.auth.getUser(accessToken);
    if (authError || !user) {
      return { response: Response.json({ detail: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }, { status: 401 }) };
    }
    userId = user.id;
  } catch (error) {
    console.error("Could not validate admin API token:", error);
    return { response: Response.json({ detail: "Không xác minh được phiên đăng nhập." }, { status: 503 }) };
  }

  let profile: { role: string; is_active: boolean } | null;
  let profileError: Error | null;
  try {
    const result = await client
      .from("users")
      .select("role,is_active")
      .eq("id", userId)
      .maybeSingle();
    profile = result.data;
    profileError = result.error;
  } catch (error) {
    console.error("Could not query manager profile:", error);
    return { response: Response.json({ detail: "Không xác minh được quyền quản lý." }, { status: 503 }) };
  }
  if (profileError) {
    console.error("Could not verify manager profile:", profileError);
    return { response: Response.json({ detail: "Không xác minh được quyền quản lý." }, { status: 500 }) };
  }
  if (!profile || profile.role !== "manager" || !profile.is_active) {
    return { response: Response.json({ detail: "Chỉ tài khoản quản lý đang hoạt động được thực hiện thao tác này." }, { status: 403 }) };
  }

  return { client };
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ detail: message }, { status });
}
