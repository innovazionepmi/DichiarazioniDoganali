"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// Stato attivo evidenziato in olive (ui_kits/consumer-app/Sidebar.jsx del
// design system Jouletec): sfondo olive trasparente + testo olive-400.
export function NavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-white/75 hover:bg-white/5 hover:text-white"
      )}
    >
      {children}
    </Link>
  )
}
