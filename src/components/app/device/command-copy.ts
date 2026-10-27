import type { CommandType } from "@/lib/constants";

export type CommandConfirmation = {
  type: CommandType;
  title: string;
  description: string;
  confirmLabel: string;
};

/**
 * Confirmation copy for commands that have a visible or privacy-sensitive
 * effect on the device. Commands without an entry are queued immediately.
 */
export const COMMAND_CONFIRMATIONS: Partial<
  Record<CommandType, CommandConfirmation>
> = {
  RING: {
    type: "RING",
    title: "Sound the alarm?",
    description:
      "The device will play a full-volume alarm until it is dismissed on the phone. Use this when you are close enough to hear it.",
    confirmLabel: "Sound alarm",
  },
  LOCK_DEVICE: {
    type: "LOCK_DEVICE",
    title: "Lock the device?",
    description:
      "This asks Android to lock the screen. It requires device-admin permission granted during setup; otherwise the command will report unsupported.",
    confirmLabel: "Request lock",
  },
  LOST_MODE_ON: {
    type: "LOST_MODE_ON",
    title: "Enable lost mode?",
    description:
      "The app raises its location cadence, shows a lost screen and rings the alarm. Battery use will increase while the mode is active.",
    confirmLabel: "Enable lost mode",
  },
  LOST_MODE_OFF: {
    type: "LOST_MODE_OFF",
    title: "Exit lost mode?",
    description:
      "The alarm and lost screen stop, and the device returns to the balanced tracking profile.",
    confirmLabel: "Exit lost mode",
  },
  CAPTURE_PHOTO: {
    type: "CAPTURE_PHOTO",
    title: "Request a photo?",
    description:
      "Beacon queues the request, but Android only allows the camera while the Beacon app is open in the foreground. Someone must unlock the device and take the photo in the app. The encrypted upload appears on the Photos tab, and the request expires if nobody can do that.",
    confirmLabel: "Request photo",
  },
};
