"use client";

import { Crosshair, RefreshCw, Terminal } from "lucide-react";
import { useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commandLabel } from "@/lib/activity";
import { COMMAND_LABELS, type CommandType } from "@/lib/constants";
import { formatDateTime, formatRelative, truncate } from "@/lib/format";
import type { CommandDto } from "@/lib/data/devices";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Queued", tone: "neutral" },
  delivered: { label: "Delivered", tone: "info" },
  completed: { label: "Completed", tone: "positive" },
  failed: { label: "Failed", tone: "danger" },
  unsupported: { label: "Unsupported", tone: "warning" },
  expired: { label: "Expired", tone: "neutral" },
};

export function CommandsTab({
  commands,
  timezone,
  sending,
  onRefresh,
  onSendCommand,
}: {
  commands: CommandDto[];
  timezone: string;
  sending: CommandType | null;
  onRefresh: () => Promise<void>;
  onSendCommand: (type: CommandType, message?: string) => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[12.5px] font-semibold">Command log</h2>
          <p className="mt-0.5 text-[10.5px] text-faint">
            Delivery and execution results reported by the device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={<Crosshair className="size-3.5" />}
            loading={sending === "LOCATE_NOW"}
            onClick={() => void onSendCommand("LOCATE_NOW")}
            size="sm"
            variant="secondary"
          >
            Locate
          </Button>
          <Button
            icon={<RefreshCw className="size-3.5" />}
            loading={refreshing}
            onClick={() => void refresh()}
            size="sm"
            variant="ghost"
          >
            Refresh
          </Button>
        </div>
      </div>

      {commands.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-line bg-surface-2">
            <Terminal className="size-4 text-muted" />
          </span>
          <p className="mt-3 text-[13px] font-semibold">No commands yet</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[11.5px] leading-5 text-muted">
            Remote actions appear here with their delivery state. A queued
            command only means the server accepted it.
          </p>
          <Button
            className="mt-4"
            onClick={() => void onSendCommand("LOCATE_NOW")}
            size="sm"
            variant="secondary"
          >
            Request a location
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2/40">
                {["Command", "Status", "Queued", "Completed", "Result"].map(
                  (heading) => (
                    <th
                      className="mono px-4 py-2 text-[9px] font-medium uppercase tracking-[0.1em] text-faint"
                      key={heading}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {commands.map((command) => {
                const status = STATUS[command.status] ?? {
                  label: command.status,
                  tone: "neutral" as const,
                };
                const resultMessage =
                  typeof command.result?.message === "string"
                    ? command.result.message
                    : typeof command.result?.error === "string"
                      ? command.result.error
                      : null;
                return (
                  <tr key={command.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="text-[11.5px] font-medium">
                        {COMMAND_LABELS[command.type as CommandType] ??
                          commandLabel(command.type)}
                      </p>
                      <p className="mono mt-0.5 text-[9px] text-faint">
                        {command.type}
                      </p>
                      {command.message ? (
                        <p className="mt-1 max-w-[240px] text-[10.5px] leading-4 text-muted">
                          “{truncate(command.message, 90)}”
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge dot tone={status.tone}>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[10.5px] text-muted">
                      {formatDateTime(command.createdAt, timezone)}
                      <span className="mt-0.5 block text-[9.5px] text-faint">
                        {formatRelative(command.createdAt)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[10.5px] text-muted">
                      {command.completedAt
                        ? formatDateTime(command.completedAt, timezone)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[10.5px] text-muted">
                      {resultMessage ? truncate(resultMessage, 90) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-line bg-surface-2/40 px-4 py-3">
        <p className="text-[10px] leading-4 text-faint">
          Commands expire after 24 hours if the device never checks in. Lost
          mode status changes immediately in the dashboard; execution is still
          confirmed by the device on its next contact.
        </p>
      </div>
    </section>
  );
}
