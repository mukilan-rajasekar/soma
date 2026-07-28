const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_APP_URL = "https://www.usesoma.work";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function appUrl(): string {
  return env("PUBLIC_APP_URL") || env("APP_URL") || env("SITE_URL") || DEFAULT_APP_URL;
}

function fromAddress(): string {
  return env("RESEND_FROM_EMAIL") || env("NOTIFY_FROM_EMAIL");
}

function resendKey(): string {
  return env("RESEND_API_KEY");
}

export function notificationsConfigured(): boolean {
  return Boolean(resendKey() && fromAddress());
}

async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = resendKey();
  const from = fromAddress();
  if (!apiKey || !from) return;

  const replyTo = env("RESEND_REPLY_TO_EMAIL") || env("NOTIFY_REPLY_TO_EMAIL");
  const body: Record<string, unknown> = {
    from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`email failed: ${res.status} ${detail}`.trim());
  }
}

export async function sendBatchQueuedEmail(input: {
  email: string;
  batchName: string;
  token: string;
}): Promise<void> {
  await sendEmail({
    to: input.email,
    subject: `Soma received ${input.batchName}`,
    text:
      `Soma received ${input.batchName}.\n\n` +
      `Track the run here:\n${appUrl()}/r/${input.token}\n\n` +
      "This page is the live address for the run. It updates itself as the batch moves from queued to processing to ready.",
  });
}

export async function sendSingleUploadQueuedEmail(input: {
  email: string;
  filename: string | null;
}): Promise<void> {
  const file = input.filename?.trim() || "your ad";
  await sendEmail({
    to: input.email,
    subject: `Soma received ${file}`,
    text:
      `Soma received ${file} and added it to the concierge queue.\n\n` +
      "We'll follow up by email when the read-out is ready.",
  });
}
