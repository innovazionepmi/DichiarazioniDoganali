"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AnnoSelector({ anno }: { anno: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const anni = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i)

  function handleChange(value: string | null) {
    if (!value) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("anno", value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select value={anno.toString()} onValueChange={handleChange}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anni.map((a) => (
          <SelectItem key={a} value={a.toString()}>
            {a}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
