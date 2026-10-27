"use client";

import {
  Archive,
  AlertTriangle,
  Download,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function DataPrivacyPanel({
  email,
  locationRetentionDays,
  auditRetentionDays,
  sessionTtlDays,
}: {
  email: string;
  locationRetentionDays: number;
  auditRetentionDays: number;
  sessionTtlDays: number;
}) {
  const { push } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function exportData() {
    setExporting(true);
    setError(null);
    try {
      window.location.assign("/api/account/export");
      push({
        title: "Export requested",
        description:
          "Your browser is downloading a JSON file. It may contain sensitive location history.",
        tone: "success",
      });
      window.setTimeout(() => setExporting(false), 1800);
    } catch {
      setExporting(false);
      setError("The export could not be started. Try again.");
    }
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteOpen(false);
    setPassword("");
    setConfirmation("");
    setError(null);
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      await apiFetch<{ deleted: boolean; redirect: string }>("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ password, confirmation }),
      });
      window.location.assign("/?deleted=1");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && !deleteOpen ? <FormMessage>{error}</FormMessage> : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[12.5px] font-semibold">Export your data</h2>
            <p className="mt-1 max-w-[68ch] text-[10.5px] leading-[1.6] text-muted">
              Download a portable JSON archive of your account, device metadata,
              stored locations, geofences, command history and audit events.
              Verification secrets, session tokens and password material are
              never included.
            </p>
          </div>
          <Archive className="mt-0.5 size-4 shrink-0 text-faint" />
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <ul className="grid gap-2 text-[10.5px] leading-[1.6] text-muted sm:grid-cols-2">
            <li className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
              Account profile, timezone and alert preferences
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
              Up to 20,000 stored location points across devices
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
              Geofences and the last 1,000 remote commands
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
              Audit history retained for {auditRetentionDays} days
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              icon={
                exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )
              }
              loading={exporting}
              onClick={exportData}
            >
              Download export
            </Button>
            <p className="text-[10px] leading-4 text-faint">
              The file is generated on demand and is not cached. Large accounts
              may take a few seconds.
            </p>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[12.5px] font-semibold">What Beacon stores</h2>
          <p className="mt-1 text-[10.5px] leading-[1.6] text-muted">
            The data model is deliberately small. Stored location points are
            pruned automatically; alert state and delivery metadata exist to
            prevent duplicate messages.
          </p>
        </div>
        <dl className="divide-y divide-line">
          {[
            {
              term: "Location history",
              detail: `Retained for up to ${locationRetentionDays} days, then deleted by the scheduled maintenance job. The latest fix may be kept outside history for the device card.`,
            },
            {
              term: "Audit events",
              detail: `Security and device actions are retained for ${auditRetentionDays} days. IP addresses are stored as keyed hashes, not raw addresses.`,
            },
            {
              term: "Sessions",
              detail: `Browser sessions expire after ${sessionTtlDays} days of issue, or immediately when revoked. Token values are stored only as keyed hashes.`,
            },
            {
              term: "Email delivery logs",
              detail:
                "Recipient address, template name, provider, status and latency are logged to diagnose delivery. Message contents and one-time codes are not logged.",
            },
            {
              term: "Command history",
              detail: `Remote action requests and their acknowledgements are retained with the account. Command payloads can include a message you typed.`,
            },
            {
              term: "Deleted accounts",
              detail:
                "Deleting your account removes the user record and cascades to devices, locations, geofences, sessions and email logs. Encrypted backups may take the operator's backup window to expire.",
            },
          ].map((row) => (
            <div
              className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4 sm:px-5"
              key={row.term}
            >
              <dt className="text-[10.5px] font-medium text-ink">{row.term}</dt>
              <dd className="text-[10.5px] leading-[1.65] text-muted">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="overflow-hidden rounded-[16px] border border-danger/30 bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-danger/20 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[12.5px] font-semibold text-danger">Delete account</h2>
            <p className="mt-1 max-w-[66ch] text-[10.5px] leading-[1.6] text-muted">
              This permanently removes {email}, every paired device, location
              history, geofence and remote action from the application database.
              Paired Android devices lose access immediately.
            </p>
          </div>
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="max-w-[62ch] text-[10.5px] leading-[1.65] text-muted">
              Deletion cannot be undone. Export your data first if you may need
              it. A final notice is emailed to the address on the account.
            </p>
          </div>
          <Button
            icon={<Trash2 className="size-3.5" />}
            onClick={() => {
              setError(null);
              setDeleteOpen(true);
            }}
            variant="danger"
          >
            Delete account
          </Button>
        </div>
      </section>

      <Dialog
        description="This action cannot be undone. Every device will need to be paired again if you create a new account."
        onOpenChange={(open) => {
          if (!open) closeDelete();
        }}
        open={deleteOpen}
        title="Permanently delete account"
      >
        <form className="space-y-4" onSubmit={deleteAccount}>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <div className="rounded-[9px] border border-danger/25 bg-danger/10 px-3 py-2.5 text-[11px] leading-[1.6] text-danger">
            All location history, geofences and command records will be deleted.
            This does not remotely wipe the Android device itself.
          </div>
          <Field htmlFor="delete-password" label="Account password">
            <Input
              autoComplete="current-password"
              id="delete-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          <Field
            hint={
              <>
                Type <span className="mono text-ink">DELETE</span> exactly to
                confirm.
              </>
            }
            htmlFor="delete-confirmation"
            label="Confirmation"
          >
            <Input
              autoComplete="off"
              id="delete-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              pattern="DELETE"
              placeholder="DELETE"
              required
              value={confirmation}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={closeDelete} variant="ghost">
              Keep account
            </Button>
            <Button
              disabled={confirmation !== "DELETE"}
              icon={<Trash2 className="size-3.5" />}
              loading={deleting}
              type="submit"
              variant="danger"
            >
              Delete everything
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
