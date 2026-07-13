import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { logout } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { href: "/anagrafiche/clienti", label: "Clienti" },
  { href: "/anagrafiche/impianti", label: "Impianti" },
  { href: "/anagrafiche/partner", label: "Partner" },
  { href: "/letture", label: "Letture" },
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
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-4">
        <div className="mb-6 text-sm font-semibold">
          Adempimenti Fotovoltaico
        </div>
        <nav className="grid gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2 py-1.5 hover:bg-muted"
            >
              {item.label}
            </Link>
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
