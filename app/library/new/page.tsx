import { redirect } from "next/navigation";

export default async function NewExercisePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;
  redirect(client_id ? `/library?client_id=${encodeURIComponent(client_id)}` : "/library");
}
