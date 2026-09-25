export type AccountDetails={full_name:string;phone:string|null};
export function parseAccountDetails(raw:unknown):AccountDetails {
  if (!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("Unsupported account fields.");
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).some(k=>!["full_name","phone"].includes(k))||typeof b.full_name!=="string"||typeof b.phone!=="string") throw new Error("Unsupported account fields.");
  if(!b.full_name.trim()||b.full_name.length>120)throw new Error("Please enter a name under 120 characters.");
  if(b.phone.length>40)throw new Error("Please enter a phone number under 40 characters.");
  return {full_name:b.full_name.trim(),phone:b.phone.trim()||null};
}
export function confirmProfileReceipt(raw:unknown,submitted:AccountDetails):AccountDetails {
  const b=raw as {ok?:unknown;profile?:Partial<AccountDetails>}|null;
  if(!b||b.ok!==true||b.profile?.full_name!==submitted.full_name||b.profile?.phone!==submitted.phone)throw new Error("Your changes were not confirmed saved. They are still here; retry before leaving.");
  return submitted;
}
