import { AdminNav } from "../AdminNav";

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <AdminNav />
      {children}
    </div>
  );
}
