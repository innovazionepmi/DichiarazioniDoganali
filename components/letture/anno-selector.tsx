"use client"

import { usePathname, useRouter } from "next/navigation"
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

  const anni = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i)

  return (
    <Select
      value={anno.toString()}
      onValueChange={(value) => router.push(`${pathname}?anno=${value}`)}
    >
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
