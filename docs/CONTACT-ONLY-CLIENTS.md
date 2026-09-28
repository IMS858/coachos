# Client records without portal accounts

A client record is not a login. `profiles.contact_only = true` permits a client
profile with a null email without creating anything in the managed Auth schema.
Existing profiles default to `contact_only = false`. The generated `auth_user_id`
is then exactly the profile ID and retains the validated foreign key and cascade
to `auth.users`. Contact-only profiles cannot be staff. Profile IDs are immutable,
and normal profile updates cannot change contact-only status or attach a login.
Existing row-level authorization remains in effect for both types of client.

The owner-only `import_migration_contact_client` command uses an approved source
manifest, exact source-record hash, source name/phone and existing evidenced
calendar-to-trainer mapping. A source-keyed receipt makes retries idempotent.
The command requires explicit separate-person confirmation. Shared phones/emails
do not merge people; an identical existing full name still requires resolution.
Source email evidence remains unchanged, but the operational email starts null.
No billing, attendance, login, invitation or appointment is created by this command.
Calendar import remains a separate reviewed, collision-checked operation.

Email can be added later through the normal client Contact editor. Blank email is
stored as null for contact-only records. Saving contact information does not
activate the portal or send invitations. Existing invite/password/bulk-invite
paths exclude contact-only clients. Portal activation needs a separately authorized,
same-ID Auth Admin provisioning flow; do not attach a different household account,
modify protected Auth tables, invent a login email, or detach an existing login.
