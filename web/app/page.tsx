"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate, { type Me } from "@/AuthGate";
import ShiftRegistration from "@/ShiftRegistration";

function RoleHome({ me }: { me: Me }) {
  const router = useRouter();
  const isManager = me.role === "manager";

  useEffect(() => {
    if (isManager) router.replace("/admin");
  }, [isManager, router]);

  if (isManager) {
    return <main className="min-h-screen grid place-items-center text-gray-500">Đang mở giao diện quản lý…</main>;
  }
  return <ShiftRegistration me={me} />;
}

export default function HomePage() {
  return <AuthGate>{(me) => <RoleHome me={me} />}</AuthGate>;
}
