// Compatibility URL, now using the same scoped, reviewed command contract.
// Standing bookings are training only; no privileged client or trainer override.
export {bookingCommandRoute as POST} from "@/lib/schedule/command-route";
