export type EmailTemplate =
  | "verify_email"
  | "reset_password"
  | "password_changed"
  | "mfa_code"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_reset"
  | "new_login"
  | "geofence"
  | "offline"
  | "low_battery"
  | "sim_change"
  | "test"
  | "account_deleted";

export type EmailPayload =
  | { template: "verify_email"; data: { name: string; url: string } }
  | { template: "reset_password"; data: { name: string; url: string } }
  | {
      template: "password_changed";
      data: { name: string; when: string };
    }
  | {
      template: "mfa_code";
      data: { name: string; code: string; minutes: number };
    }
  | {
      template: "mfa_enabled" | "mfa_disabled";
      data: { name: string; when: string };
    }
  | {
      template: "mfa_reset";
      data: { name: string; when: string; device: string };
    }
  | {
      template: "new_login";
      data: { name: string; when: string; device: string };
    }
  | {
      template: "geofence";
      data: {
        name: string;
        deviceName: string;
        geofenceName: string;
        event: "entered" | "left";
        when: string;
        url: string;
        mapsUrl: string;
      };
    }
  | {
      template: "offline";
      data: {
        name: string;
        deviceName: string;
        lastSeen: string;
        url: string;
      };
    }
  | {
      template: "low_battery";
      data: {
        name: string;
        deviceName: string;
        battery: string;
        when: string;
        url: string;
      };
    }
  | {
      template: "sim_change";
      data: {
        name: string;
        deviceName: string;
        when: string;
        url: string;
      };
    }
  | { template: "test"; data: { name: string; url: string } }
  | { template: "account_deleted"; data: { name: string } };

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(input: {
  preheader: string;
  title: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1eee7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1eee7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e2ddd2;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="background:#0b0c0e;padding:22px 28px;">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff5a36;vertical-align:middle;"></span>
<span style="display:inline-block;margin-left:9px;color:#f5f2ea;font-size:12px;letter-spacing:0.2em;font-weight:700;vertical-align:middle;">BEACON</span>
</td></tr>
<tr><td style="padding:34px 28px 10px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-0.02em;color:#0b0c0e;font-weight:650;">${escapeHtml(input.title)}</h1>
${input.bodyHtml}
</td></tr>
<tr><td style="padding:18px 28px 28px;">
${input.footerHtml ?? ""}
</td></tr>
<tr><td style="background:#faf8f3;border-top:1px solid #eee8dc;padding:18px 28px;">
<p style="margin:0 0 6px;font-size:11px;line-height:1.6;color:#74716a;">Beacon is a self-hosted device locator. We never ask for your password or a one-time code by email.</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:#9a968d;">You received this message because this address is registered to a Beacon account.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:8px;background:#d93a16;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#4b4a45;">${escapeHtml(value)}</p>`;
}

function muted(value: string): string {
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8b877e;">${escapeHtml(value)}</p>`;
}

function detailTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 6px;border-top:1px solid #ece7dc;">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:10px 0;border-bottom:1px solid #ece7dc;font-size:12px;color:#8b877e;width:40%;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #ece7dc;font-size:12px;color:#292925;text-align:right;">${escapeHtml(value)}</td></tr>`,
  )
  .join("")}
</table>`;
}

export function renderEmail(payload: EmailPayload): RenderedEmail {
  switch (payload.template) {
    case "verify_email": {
      const { name, url } = payload.data;
      return {
        subject: "Confirm your email address",
        text: `Hello ${name},\n\nConfirm your Beacon email address by opening this link:\n${url}\n\nThe link expires in 24 hours. If you did not create an account, you can ignore this message.\n`,
        html: layout({
          preheader: "One click to finish setting up Beacon.",
          title: "Confirm your email address",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "Confirm this address to finish setting up your Beacon account. You will need a verified email to pair a device and to recover access.",
            ) +
            button(url, "Verify email address") +
            muted(
              "This link expires in 24 hours and can be used once. If you did not create a Beacon account, no action is required.",
            ),
        }),
      };
    }
    case "reset_password": {
      const { name, url } = payload.data;
      return {
        subject: "Reset your password",
        text: `Hello ${name},\n\nA password reset was requested for your Beacon account. Open this link to choose a new password:\n${url}\n\nThe link expires in 60 minutes. If this was not you, ignore this email — your password has not changed.\n`,
        html: layout({
          preheader: "A password reset link, valid for 60 minutes.",
          title: "Reset your password",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "A password reset was requested for your Beacon account. Choose a new password using the button below. The link can be used once and expires in 60 minutes.",
            ) +
            button(url, "Choose a new password") +
            muted(
              "If you did not request this, you can ignore this email. Your current password remains active.",
            ),
        }),
      };
    }
    case "password_changed": {
      const { name, when } = payload.data;
      return {
        subject: "Your password was changed",
        text: `Hello ${name},\n\nYour Beacon password was changed on ${when}. All other sessions were signed out.\n\nIf this was not you, reset your password immediately and review your active sessions.\n`,
        html: layout({
          preheader: "Your Beacon password changed.",
          title: "Your password was changed",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "Your Beacon password was changed. Every other signed-in session has been revoked.",
            ) +
            detailTable([["Changed", when]]) +
            muted(
              "If this was not you, reset your password immediately and review active sessions from Security settings.",
            ),
        }),
      };
    }
    case "mfa_code": {
      const { name, code, minutes } = payload.data;
      return {
        subject: `Your Beacon sign-in code: ${code}`,
        text: `Hello ${name},\n\nYour Beacon sign-in code is ${code}. It expires in ${minutes} minutes.\n\nIf this was not you, do not share this code. Sign in and revoke the session.\n`,
        html: layout({
          preheader: `Your sign-in code expires in ${minutes} minutes.`,
          title: "Your sign-in code",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph("Enter this code to finish signing in. It can be used once.") +
            `<div style="margin:22px 0;padding:18px 24px;border:1px solid #e2ddd2;border-radius:12px;background:#faf8f3;text-align:center;">
<p style="margin:0;font-family:'SFMono-Regular',Consolas,monospace;font-size:32px;letter-spacing:0.28em;color:#0b0c0e;font-weight:600;">${escapeHtml(code)}</p>
<p style="margin:8px 0 0;font-size:11px;color:#8b877e;">Expires in ${minutes} minutes</p>
</div>` +
            muted(
              "Beacon will never ask you to share this code. If you did not try to sign in, change your password.",
            ),
        }),
      };
    }
    case "mfa_enabled":
    case "mfa_disabled": {
      const { name, when } = payload.data;
      const enabled = payload.template === "mfa_enabled";
      return {
        subject: enabled
          ? "Two-factor authentication enabled"
          : "Two-factor authentication disabled",
        text: `Hello ${name},\n\nTwo-factor authentication was ${enabled ? "enabled" : "disabled"} on ${when}.\n\nIf this was not you, secure your account immediately.\n`,
        html: layout({
          preheader: enabled
            ? "A second factor now protects your account."
            : "A second factor was removed from your account.",
          title: enabled
            ? "Two-factor authentication enabled"
            : "Two-factor authentication disabled",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              enabled
                ? "A second factor now protects your Beacon account. Keep your recovery codes somewhere safe and offline."
                : "The second factor was removed from your Beacon account. Your password is now the only barrier.",
            ) +
            detailTable([["Changed", when]]) +
            muted("If this was not you, reset your password and review your active sessions."),
        }),
      };
    }
    case "mfa_reset": {
      const { name, when, device } = payload.data;
      return {
        subject: "Two-factor authentication was reset",
        text: `Hello ${name},\n\nTwo-factor authentication on your Beacon account was reset from ${device} on ${when}.\n\nYour password is still required. Every other browser and mobile session was signed out, and a new authenticator must be enrolled before the dashboard can be used again.\n\nIf this was not you, reset your password immediately and contact the operator.\n`,
        html: layout({
          preheader: "A linked phone reset two-factor authentication.",
          title: "Two-factor authentication was reset",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "Two-factor authentication was reset from a linked phone. Your password is still required, but the old authenticator and recovery codes no longer work.",
            ) +
            detailTable([
              ["Device", device],
              ["Reset", when],
            ]) +
            paragraph(
              "Every other browser and mobile session was signed out. Sign in with your password and enroll a new authenticator to restore dashboard access.",
            ) +
            muted(
              "If this was not you, reset your password immediately and contact the operator. Beacon support will never ask for your password or a one-time code.",
            ),
        }),
      };
    }
    case "new_login": {
      const { name, when, device } = payload.data;      return {
        subject: "New sign-in to Beacon",
        text: `Hello ${name},\n\nA new session was created on ${when}.\n\nDevice: ${device}\n\nIf this was not you, change your password and revoke the session.\n`,
        html: layout({
          preheader: "A new session was created on your account.",
          title: "New sign-in to Beacon",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph("A new session was created for your account.") +
            detailTable([
              ["Time", when],
              ["Device", device],
            ]) +
            muted(
              "If this was you, no action is needed. If not, change your password and revoke all other sessions.",
            ),
        }),
      };
    }
    case "geofence": {
      const { name, deviceName, geofenceName, event, when, url, mapsUrl } =
        payload.data;
      const verb = event === "entered" ? "entered" : "left";
      return {
        subject: `${deviceName} ${verb} ${geofenceName}`,
        text: `Hello ${name},\n\n${deviceName} ${verb} ${geofenceName} at ${when}.\n\nOpen Beacon: ${url}\nOpen in Google Maps: ${mapsUrl}\n\nYou can change geofence alerts in Beacon settings.\n`,
        html: layout({
          preheader: `${deviceName} ${verb} ${geofenceName}.`,
          title: `${deviceName} ${verb} ${geofenceName}`,
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              `Your device crossed the edge of a saved place at ${when}.`,
            ) +
            detailTable([
              ["Device", deviceName],
              ["Place", geofenceName],
              ["Event", event === "entered" ? "Entered" : "Left"],
              ["Time", when],
            ]) +
            button(url, "Open Beacon") +
            `<p style="margin:12px 0 0;font-size:12px;"><a href="${escapeHtml(mapsUrl)}" style="color:#b83312;">Open the last location in Google Maps</a></p>` +
            muted("Geofence alerts can be disabled from Settings → Notifications."),
        }),
      };
    }
    case "offline": {
      const { name, deviceName, lastSeen, url } = payload.data;
      return {
        subject: `${deviceName} has gone quiet`,
        text: `Hello ${name},\n\nBeacon has not received a signal from ${deviceName} since ${lastSeen}.\n\nThe last known location is preserved. Open Beacon: ${url}\n\nIf the device is lost, enable lost mode for higher-frequency tracking when it reconnects.\n`,
        html: layout({
          preheader: `${deviceName} has not reported in.`,
          title: "A device has gone quiet",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              `Beacon has not received a signal from ${deviceName}. Its last known location is still available.`,
            ) +
            detailTable([
              ["Device", deviceName],
              ["Last signal", lastSeen],
            ]) +
            button(url, "View last known location") +
            muted(
              "If the phone is lost, turn on lost mode so tracking increases as soon as it reconnects.",
            ),
        }),
      };
    }
    case "low_battery": {
      const { name, deviceName, battery, when, url } = payload.data;
      return {
        subject: `${deviceName} battery is low`,
        text: `Hello ${name},\n\n${deviceName} reported ${battery} battery at ${when}.\n\nOpen Beacon: ${url}\n`,
        html: layout({
          preheader: `${deviceName} reported low battery.`,
          title: "Low battery on a tracked device",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              `A tracked device reported low battery and is not charging. Its last location will remain available even if it powers off.`,
            ) +
            detailTable([
              ["Device", deviceName],
              ["Battery", battery],
              ["Reported", when],
            ]) +
            button(url, "View device"),
        }),
      };
    }
    case "sim_change": {
      const { name, deviceName, when, url } = payload.data;
      return {
        subject: `SIM change detected on ${deviceName}`,
        text: `Hello ${name},\n\nA SIM state change was detected on ${deviceName} at ${when}. If this was not you, the device may have been tampered with.\n\nOpen Beacon: ${url}\n`,
        html: layout({
          preheader: "A SIM state change was reported.",
          title: "SIM change detected",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              `A SIM state change was reported by ${deviceName}. This can happen during a legitimate SIM swap, but it is also one of the first things a thief may do.`,
            ) +
            detailTable([
              ["Device", deviceName],
              ["Detected", when],
            ]) +
            button(url, "Review device") +
            muted(
              "If this was not you, enable lost mode and contact your carrier to suspend the SIM.",
            ),
        }),
      };
    }
    case "test": {
      const { name, url } = payload.data;
      return {
        subject: "Beacon email delivery test",
        text: `Hello ${name},\n\nThis is a test message from Beacon. If you can read it, your configured email provider is working.\n\n${url}\n`,
        html: layout({
          preheader: "Your email provider is configured correctly.",
          title: "Email delivery is working",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "This is a test message from Beacon. The provider shown in Settings delivered it successfully. No further action is required.",
            ) +
            button(url, "Open Beacon settings"),
        }),
      };
    }
    case "account_deleted": {
      const { name } = payload.data;
      return {
        subject: "Your Beacon account was deleted",
        text: `Hello ${name},\n\nYour Beacon account and all associated devices, locations, geofences and sessions have been deleted.\n\nIf you did not request this, contact the operator immediately.\n`,
        html: layout({
          preheader: "Your Beacon account was deleted.",
          title: "Your account was deleted",
          bodyHtml:
            paragraph(`Hello ${name},`) +
            paragraph(
              "Your Beacon account and all associated devices, location history, geofences and sessions have been deleted. This action cannot be undone.",
            ) +
            muted("If you did not request this, contact the operator immediately."),
        }),
      };
    }
  }
}
