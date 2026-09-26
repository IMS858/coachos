"use client";
import { RecoveryScreen } from "@/components/ui/recovery-screen";
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{margin:0,background:"#f4f6f8",color:"#15202b",colorScheme:"light"}}><RecoveryScreen digest={error.digest}/></body></html>;
}
