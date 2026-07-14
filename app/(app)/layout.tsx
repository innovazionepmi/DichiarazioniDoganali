import { redirect } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { logout } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { NavLink } from "@/components/shared/nav-link"

const NAV_ITEMS = [
  { href: "/anagrafiche/clienti", label: "Clienti" },
  { href: "/anagrafiche/impianti", label: "Impianti" },
  { href: "/anagrafiche/partner", label: "Partner" },
  { href: "/letture", label: "Letture" },
  { href: "/tracking", label: "Tracking" },
  { href: "/impostazioni", label: "Impostazioni" },
]

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Difesa in profondità: il middleware già protegge le route, questo è un
  // controllo server-side ridondante a livello di layout.
  if (!user) {
    redirect("/login")
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
        <div className="flex items-center gap-2 self-start">
          <Image
            src="/icon.png"
            alt=""
            width={256}
            height={256}
            priority
            className="size-7 shrink-0 brightness-0 invert"
          />
          <span className="font-heading text-lg font-semibold">Jouletec</span>
        </div>
        <nav className="grid gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Esci
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
