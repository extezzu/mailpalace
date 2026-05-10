export interface ImapPreset {
  name: string;
  host: string;
  port: number;
  // Optional hint shown under the form when this preset is active.
  // Used for providers where the wizard cannot just dial the host —
  // e.g. Proton Bridge has to be running on the user's machine first.
  hint?: string;
}

// Single source of truth — both the connect wizard and the settings
// "Add IMAP" form pull from here so adding a provider is one edit.
//
// Gmail is intentionally absent: the wizard's "Continue with Google"
// path uses OAuth (gmail.modify), which is strictly better than IMAP
// + app-password (no token rotation hassle, real label semantics,
// push notifications later via Pub/Sub).
export const IMAP_PRESETS: ImapPreset[] = [
  { name: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
  { name: "iCloud Mail", host: "imap.mail.me.com", port: 993 },
  { name: "Fastmail", host: "imap.fastmail.com", port: 993 },
  { name: "Mailbox.org", host: "imap.mailbox.org", port: 993 },
  {
    name: "Proton Mail (via Proton Bridge)",
    host: "127.0.0.1",
    port: 1143,
    hint: "proton-bridge",
  },
];
