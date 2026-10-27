const LABELS: Record<string, string> = {
  "auth.signup": "Account created",
  "auth.login.success": "Signed in",
  "auth.login.failed": "Failed sign-in attempt",
  "auth.login.locked": "Sign-in blocked after repeated failures",
  "auth.login.mfa_required": "Second factor requested",
  "auth.logout": "Signed out",
  "auth.email.verified": "Email address verified",
  "auth.password.changed": "Password changed",
  "auth.password.reset": "Password reset",
  "auth.mfa.enabled": "Authenticator app enabled",
  "auth.mfa.disabled": "Authenticator app disabled",
  "auth.mfa.setup.started": "Authenticator setup started",
  "auth.mfa.email.enabled": "Email second factor enabled",
  "auth.mfa.email.disabled": "Email second factor disabled",
  "auth.mfa.recovery.regenerated": "Recovery codes regenerated",
  "auth.session.revoked": "Session revoked",
  "account.profile.updated": "Profile updated",
  "account.notifications.updated": "Notification preferences updated",
  "account.email_provider.updated": "Email provider priority updated",
  "account.exported": "Account data exported",
  "account.deleted": "Account deleted",
  "device.paired": "Device paired",
  "device.updated": "Device settings updated",
  "device.unpaired": "Device unpaired",
  "device.purged": "Device and history purged",
  "device.pairing_code.created": "Pairing code created",
  "device.command.created": "Remote command sent",
  "geofence.created": "Geofence created",
  "geofence.updated": "Geofence updated",
  "geofence.deleted": "Geofence deleted",
};

export function auditActionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const tail = action.split(".").slice(-1)[0] ?? action;
  return tail.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function auditCategory(action: string): "security" | "account" | "device" {
  if (action.startsWith("auth.")) return "security";
  if (action.startsWith("account.")) return "account";
  return "device";
}

export function commandLabel(type: string): string {
  const labels: Record<string, string> = {
    LOCATE_NOW: "Locate now",
    RING: "Sound alarm",
    LOST_MODE_ON: "Lost mode enabled",
    LOST_MODE_OFF: "Lost mode disabled",
    LOCK_DEVICE: "Device lock requested",
    CAPTURE_PHOTO: "Photo requested",
    MESSAGE: "Message sent",
    SYNC_NOW: "Sync requested",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}
