// Builds the email for a notification. Pure functions, so they can be tested.

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
}

export function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Notification links are plain page names such as "job.html?id=123".
// Anything else is replaced by the dashboard so an email can never point elsewhere.
export function safeLink(link: string | null, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const ok = /^[a-z0-9-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/i.test(link ?? "");
  return `${base}/${ok ? link : "dashboard.html"}`;
}

export function buildEmail(record: NotificationRecord, siteUrl: string) {
  const link = safeLink(record.link, siteUrl);
  const title = escapeHtml(record.title);
  const body = escapeHtml(record.body);
  const settings = `${siteUrl.replace(/\/+$/, "")}/profile.html`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f3f5f1;font-family:Arial,Helvetica,sans-serif;color:#0f1f18">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:20px;font-weight:bold;margin:0 0 16px">Naija<span style="color:#14744d">Jobs</span></p>
    <div style="background:#ffffff;border:1px solid #dce3dc;border-radius:12px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
      <p style="font-size:16px;line-height:1.5;margin:0 0 20px">${body}</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#0e3b2c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open NaijaJobs</a>
    </div>
    <p style="font-size:13px;color:#55655c;margin:16px 0 0">You get this email because email alerts are on.
      <a href="${escapeHtml(settings)}" style="color:#55655c">Turn them off in your profile</a>.</p>
  </div>
</body></html>`;

  const text = `${record.title}\n\n${record.body}\n\nOpen NaijaJobs: ${link}\n\nTurn off email alerts: ${settings}`;
  return { subject: `NaijaJobs: ${record.title}`, html, text };
}
