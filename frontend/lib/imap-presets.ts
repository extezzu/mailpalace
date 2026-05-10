export interface ImapPreset {
  name: string;
  host: string;
  port: number;
}

// Single source of truth — both the connect wizard and the settings
// "Add IMAP" form pull from here so adding a provider is one edit.
export const IMAP_PRESETS: ImapPreset[] = [
  { name: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
  { name: "iCloud Mail", host: "imap.mail.me.com", port: 993 },
  { name: "Fastmail", host: "imap.fastmail.com", port: 993 },
  { name: "Mailbox.org", host: "imap.mailbox.org", port: 993 },
  { name: "Proton (via Proton Bridge)", host: "127.0.0.1", port: 1143 },
  { name: "Gmail (via app password)", host: "imap.gmail.com", port: 993 },
];
