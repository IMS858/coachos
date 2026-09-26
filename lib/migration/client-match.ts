export type SourceClient = {
  source_id: string;
  name: string;
  email?: string | null;
  phones?: string[];
};
export type DestinationClient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};
export type Match = {
  source_id: string;
  destination_id: string | null;
  status: "matched" | "needs_review" | "unmatched";
  basis: string[];
};

const nameKey = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

function emailKey(value?: string | null): string {
  const email = (value ?? "").trim().toLowerCase();
  // Malformed identities and placeholders are not matching evidence.
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/.test(email) ? email : "";
}

function phoneKey(value?: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^\d{10}$/.test(national) ? national : "";
}

function occurrences(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/**
 * Pure identity proposals, never approval to import or change a login.
 * Run against the complete source roster and a fresh destination snapshot:
 * chunk-by-chunk matching cannot detect household contacts in another chunk.
 */
export function matchMigrationClients(
  source: SourceClient[],
  destination: DestinationClient[],
): Match[] {
  const prepared = source.map((row) => ({
    row,
    name: nameKey(row.name),
    email: emailKey(row.email),
    phones: [...new Set((row.phones ?? []).map(phoneKey).filter(Boolean))],
  }));
  const sourceIds = occurrences(source.map((row) => row.source_id));
  const destinationIds = occurrences(destination.map((row) => row.id));
  const sourceEmails = occurrences(prepared.map((row) => row.email));
  const sourcePhones = occurrences(prepared.flatMap((row) => row.phones));

  const proposals: Match[] = prepared.map(({ row, name, email, phones }) => {
    const hold = (basis: string[], id: string | null = null): Match => ({
      source_id: row.source_id, destination_id: id, status: "needs_review", basis,
    });
    if (!row.source_id.trim() || (sourceIds.get(row.source_id) ?? 0) !== 1) {
      return hold(["invalid_or_duplicate_source_identity"]);
    }

    const candidates = destination.map((candidate) => {
      const basis: string[] = [];
      const candidateEmail = emailKey(candidate.email);
      const candidatePhone = phoneKey(candidate.phone);
      if (email && email === candidateEmail) basis.push("email");
      if (candidatePhone && phones.includes(candidatePhone)) basis.push("phone");
      if (name && name === nameKey(candidate.name)) basis.push("name");
      return { candidate, candidateEmail, candidatePhone, basis };
    }).filter((candidate) => candidate.basis.length > 0);

    const contacts = candidates.filter(({ basis }) => basis.includes("email") || basis.includes("phone"));
    if (contacts.length > 1) return hold(["conflicting_contact"]);
    if (contacts.length === 1) {
      const found = contacts[0];
      if (!found.candidate.id.trim() || destinationIds.get(found.candidate.id) !== 1) {
        return hold(["invalid_or_duplicate_destination_identity"]);
      }
      const sharedEmail = found.basis.includes("email") && (sourceEmails.get(email) ?? 0) > 1;
      const sharedPhone = found.basis.includes("phone") && (sourcePhones.get(found.candidatePhone) ?? 0) > 1;
      if (sharedEmail || sharedPhone) return hold([...found.basis, "shared_source_contact"]);
      // Two matching contact fields may still belong to another household member.
      if (!name || name !== nameKey(found.candidate.name)) {
        return hold([...found.basis, "name_difference"]);
      }
      return {
        source_id: row.source_id, destination_id: found.candidate.id,
        status: "matched", basis: [...found.basis, "contact_proposal_not_approval"],
      };
    }

    const names = candidates.filter(({ basis }) => basis.includes("name"));
    if (names.length === 1) return hold(["name_only"], names[0].candidate.id);
    if (names.length > 1) return hold(["ambiguous_name"]);
    return { source_id: row.source_id, destination_id: null, status: "unmatched", basis: [] };
  });

  // Distinct email/phone paths must not collapse two source people onto one account.
  const claimed = occurrences(proposals.filter((row) => row.status === "matched")
    .map((row) => row.destination_id ?? ""));
  return proposals.map((row) => row.status === "matched" && row.destination_id
    && (claimed.get(row.destination_id) ?? 0) > 1
    ? { ...row, destination_id: null, status: "needs_review", basis: [...row.basis, "multiple_source_claims"] }
    : row);
}
