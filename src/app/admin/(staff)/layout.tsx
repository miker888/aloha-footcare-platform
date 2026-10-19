import { AdminShell } from "@/components/admin/AdminShell";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
