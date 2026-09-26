"use client";
import { RecoveryScreen } from "@/components/ui/recovery-screen";
export default function AppError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecoveryScreen digest={error.digest}/>;
}
