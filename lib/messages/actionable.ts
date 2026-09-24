import type { createClient } from "@/lib/supabase/server";
import { allCatalogPages } from "@/lib/exercises/catalog";
export interface StaffUnreadMessage { id: string; client_id: string; sender_id: string; body: string; created_at: string; read_at: string | null }
export function actionableMessages(messages: StaffUnreadMessage[], states: { client_id: string; archived_at: string | null }[]) {
  const archived = new Map(states.filter(state => state.archived_at).map(state => [state.client_id, state.archived_at!]));
  return messages.filter(message => message.sender_id === message.client_id && message.read_at === null
    && (!archived.has(message.client_id) || Date.parse(message.created_at) > Date.parse(archived.get(message.client_id)!)))
    .sort((a,b) => b.created_at.localeCompare(a.created_at));
}
/** Caller-authenticated RLS client only; never counts staff replies as incoming. */
export async function loadStaffUnreadMessages(db: Awaited<ReturnType<typeof createClient>>) {
  const [messages, states] = await Promise.all([
    allCatalogPages<StaffUnreadMessage>((from,to) => db.from("messages").select("id,client_id,sender_id,body,created_at,read_at", { count:"exact" }).is("read_at",null).order("id").range(from,to)),
    allCatalogPages<{ client_id: string; archived_at: string | null }>((from,to) => db.from("message_thread_state").select("client_id,archived_at", { count:"exact" }).order("client_id").range(from,to)),
  ]);
  return actionableMessages(messages,states);
}
