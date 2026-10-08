"use client";
import AuthGate from "@/AuthGate";
import ShiftRegistration from "@/ShiftRegistration";
export default function HomePage() {
  return <AuthGate>{(me) => <ShiftRegistration me={me} />}</AuthGate>;
}
