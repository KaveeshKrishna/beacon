"use client";

import {
  Camera,
  Download,
  Images,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { COMMAND_CONFIRMATIONS } from "@/components/app/device/command-copy";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import type { CommandType } from "@/lib/constants";
import type { DevicePhotoDto } from "@/lib/data/photos";
import { formatDateTime, formatRelative } from "@/lib/format";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotosTab({
  deviceId,
  photos,
  loading,
  error,
  timezone,
  sending,
  onRefresh,
  onSendCommand,
}: {
  deviceId: string;
  photos: DevicePhotoDto[];
  loading: boolean;
  error: string | null;
  timezone: string;
  sending: CommandType | null;
  onRefresh: () => Promise<void>;
  onSendCommand: (type: CommandType) => Promise<void>;
}) {
  const { push } = useToast();
  const [selected, setSelected] = useState<DevicePhotoDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DevicePhotoDto | null>(null);
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const request = COMMAND_CONFIRMATIONS.CAPTURE_PHOTO;

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (caught) {
      push({
        title: "Could not load photos",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function queuePhotoRequest() {
    setConfirmPhoto(false);
    await onSendCommand("CAPTURE_PHOTO");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const photo = pendingDelete;
    setDeleting(true);
    try {
      await apiFetch(`/api/devices/${deviceId}/photos/${photo.id}`, {
        method: "DELETE",
      });
      if (selected?.id === photo.id) setSelected(null);
      setPendingDelete(null);
      push({ title: "Photo deleted", tone: "success" });
      await onRefresh();
    } catch (caught) {
      push({
        title: "Could not delete the photo",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[12.5px] font-semibold">Evidence photos</h2>
            <p className="mt-0.5 max-w-[68ch] text-[10.5px] leading-4 text-faint">
              Photos are taken by the person holding the device after a request.
              Images are encrypted at rest, visible only to your account, and
              removed after 30 days or once 20 newer photos exist.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              icon={<RefreshCw className="size-3.5" />}
              loading={refreshing}
              onClick={() => void refresh()}
              size="sm"
              variant="ghost"
            >
              Refresh
            </Button>
            <Button
              icon={<Camera className="size-3.5" />}
              loading={sending === "CAPTURE_PHOTO"}
              onClick={() => setConfirmPhoto(true)}
              size="sm"
            >
              Request photo
            </Button>
          </div>
        </div>

        {loading && photos.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="aspect-[4/3] animate-pulse rounded-lg bg-surface-2"
                key={index}
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-line bg-surface-2">
              {error ? (
                <TriangleAlert className="size-4 text-warning" />
              ) : (
                <Images className="size-4 text-muted" />
              )}
            </span>
            <p className="mt-3 text-[13px] font-semibold">
              {error ? "Photos could not be loaded" : "No photos yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[42ch] text-[11.5px] leading-5 text-muted">
              {error ??
                "Requesting a photo does not silently open the camera. Android requires someone to open Beacon, approve the prompt and take the picture; the encrypted result then appears here."}
            </p>
            {error ? (
              <Button
                className="mt-4"
                loading={refreshing}
                onClick={() => void refresh()}
                size="sm"
                variant="secondary"
              >
                Try again
              </Button>
            ) : (
              <Button
                className="mt-4"
                icon={<Camera className="size-3.5" />}
                onClick={() => setConfirmPhoto(true)}
                size="sm"
                variant="secondary"
              >
                Request a photo
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
            {photos.map((photo) => (
              <button
                aria-label={`Open photo from ${formatDateTime(photo.capturedAt, timezone)}`}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-2 text-left"
                key={photo.id}
                onClick={() => setSelected(photo)}
                type="button"
              >
                {/* Private API images cannot use the Next.js optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`Evidence photo captured ${formatDateTime(photo.capturedAt, timezone)}`}
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={photo.url}
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-7">
                  <span className="text-[10px] font-medium text-white">
                    {formatRelative(photo.capturedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2 border-t border-line bg-surface-2/40 px-4 py-3">
          <Camera className="mt-0.5 size-3.5 shrink-0 text-faint" />
          <p className="text-[10px] leading-4 text-faint">
            Beacon never captures photos covertly. Android blocks background
            camera access, so every request needs a person to act on the device.
          </p>
        </div>
      </section>

      <Dialog
        className="max-w-3xl"
        description={
          selected
            ? `Captured ${formatDateTime(selected.capturedAt, timezone)}`
            : undefined
        }
        footer={
          selected ? (
            <>
              <Button
                icon={<Trash2 className="size-3.5" />}
                onClick={() => {
                  setPendingDelete(selected);
                  setSelected(null);
                }}
                size="sm"
                variant="danger"
              >
                Delete
              </Button>
              <a
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                download={`beacon-photo-${selected.id}.jpg`}
                href={selected.url}
              >
                <Download className="size-3.5" />
                Download
              </a>
              <Button onClick={() => setSelected(null)} size="sm" variant="ghost">
                Close
              </Button>
            </>
          ) : null
        }
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        open={selected !== null}
        title="Evidence photo"
      >
        {selected ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`Evidence photo captured ${formatDateTime(selected.capturedAt, timezone)}`}
              className="max-h-[62vh] w-full rounded-lg border border-line bg-surface-2 object-contain"
              referrerPolicy="no-referrer"
              src={selected.url}
            />
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              <div className="bg-surface-2 px-3 py-2.5">
                <p className="mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                  Captured
                </p>
                <p className="mt-1 text-[10.5px] text-ink">
                  {formatDateTime(selected.capturedAt, timezone)}
                </p>
              </div>
              <div className="bg-surface-2 px-3 py-2.5">
                <p className="mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                  Dimensions
                </p>
                <p className="mono mt-1 text-[10.5px] text-ink">
                  {selected.width} × {selected.height}
                </p>
              </div>
              <div className="bg-surface-2 px-3 py-2.5">
                <p className="mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                  Size
                </p>
                <p className="mono mt-1 text-[10.5px] text-ink">
                  {formatBytes(selected.byteSize)}
                </p>
              </div>
            </div>
            <p className="text-[10px] leading-4 text-faint">
              Decrypted on demand for this session. Beacon does not cache photo
              bytes in the browser or on a CDN.
            </p>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        description={
          pendingDelete
            ? `This removes the photo captured ${formatDateTime(pendingDelete.capturedAt, timezone)} from the server. It cannot be recovered.`
            : undefined
        }
        footer={
          <>
            <Button
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button loading={deleting} onClick={() => void confirmDelete()} variant="danger">
              Delete photo
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
        title="Delete this photo?"
      />

      <Dialog
        description={request?.description}
        footer={
          <>
            <Button onClick={() => setConfirmPhoto(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              loading={sending === "CAPTURE_PHOTO"}
              onClick={() => void queuePhotoRequest()}
            >
              {request?.confirmLabel ?? "Request photo"}
            </Button>
          </>
        }
        onOpenChange={setConfirmPhoto}
        open={confirmPhoto}
        title={request?.title ?? "Request a photo?"}
      />
    </div>
  );
}
