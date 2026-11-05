"use client";

import { useRouter } from "next/navigation";
import { deleteTrade } from "@/app/actions";
import { ConfirmButton } from "@/components/ui-client";

export function DeleteTradeButton({ id }: { id: number }) {
  const router = useRouter();
  return (
    <ConfirmButton variant="danger" size="md" confirm="Delete this trade permanently?" action={async () => { await deleteTrade(id); router.push("/journal"); }}>
      Delete trade
    </ConfirmButton>
  );
}
