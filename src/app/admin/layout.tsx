import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s | Aloha staff" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
