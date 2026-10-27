import {
  BatteryMedium,
  BellRing,
  Camera,
  Lock,
  MapPin,
  Radio,
  Volume2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

const commands = [
  { icon: Volume2, label: "Alarm" },
  { icon: Lock, label: "Lock" },
  { icon: Camera, label: "Photo" },
  { icon: BellRing, label: "Notify" },
];

export function ConsolePreview() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[32px] bg-accent/5 blur-2xl"
      />
      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[0_40px_100px_-40px_rgba(10,11,13,0.45)]">
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink text-[10px] font-semibold text-bg">
              FP
            </span>
            <div className="leading-tight">
              <p className="text-[12.5px] font-semibold">Field phone</p>
              <p className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
                Pixel 9a · Android 16
              </p>
            </div>
          </div>
          <Badge dot tone="positive">
            Live
          </Badge>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.55fr_1fr]">
          <div className="relative h-[288px] overflow-hidden bg-[#0d0f12] sm:h-[330px]">
            <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_66%_38%,rgba(255,106,69,0.16),transparent_38%)]" />

            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              fill="none"
              viewBox="0 0 600 360"
            >
              <g opacity="0.22" stroke="#F4F1EA" strokeWidth="1">
                <path d="M-20 92 620 168" />
                <path d="M-20 224 620 286" />
                <path d="M92 -20 148 380" />
                <path d="M330 -20 286 380" />
                <path d="M500 -20 540 380" />
              </g>
              <g opacity="0.1" stroke="#F4F1EA" strokeWidth="7" strokeLinecap="round">
                <path d="M-10 262C120 240 214 300 330 274S520 198 620 214" />
                <path d="M120 380C154 280 258 234 300 148S348 20 374 -10" />
              </g>
              <path
                className="dash-path"
                d="M74 288C128 282 154 232 208 226S286 250 322 200 376 132 438 142 502 108 540 96"
                stroke="#FF6A45"
                strokeDasharray="5 7"
                strokeLinecap="round"
                strokeWidth="2"
              />
              <g fill="#0d0f12" stroke="#FF6A45" strokeWidth="2">
                <circle cx="74" cy="288" r="4" />
                <circle cx="208" cy="226" r="3.5" />
                <circle cx="322" cy="200" r="3.5" />
                <circle cx="438" cy="142" r="3.5" />
              </g>
            </svg>

            <div className="absolute left-[47%] top-[22%]">
              <div className="relative flex size-4 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-[#FF6A45] [animation:ping-soft_2.4s_cubic-bezier(0,0,0.2,1)_infinite]" />
                <span className="relative size-4 rounded-full border-[3px] border-[#0d0f12] bg-[#FF6A45] shadow-[0_0_0_1px_rgba(255,106,69,0.5)]" />
              </div>
            </div>

            <div className="absolute left-[52%] top-[12%] flex items-center gap-1.5 rounded-md border border-white/10 bg-black/45 px-2 py-1 backdrop-blur">
              <MapPin className="size-3 text-[#FF6A45]" />
              <span className="mono text-[10px] text-white/80">accuracy ±8 m</span>
            </div>

            <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur">
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                Last fix
              </p>
              <p className="mono mt-0.5 text-[11px] text-white/90">12 s ago · fused</p>
            </div>

            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              {["+", "−"].map((symbol) => (
                <span
                  className="flex size-6 items-center justify-center rounded-[5px] border border-white/10 bg-black/50 text-[13px] text-white/70 backdrop-blur"
                  key={symbol}
                >
                  {symbol}
                </span>
              ))}
            </div>

            <p className="absolute bottom-1.5 right-2 text-[8px] text-white/25">
              © OpenStreetMap · OpenFreeMap
            </p>
          </div>

          <div className="flex flex-col border-t border-line lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-px bg-line">
              <Metric label="Battery" value="62%" icon={BatteryMedium} />
              <Metric label="Network" value="LTE" icon={Radio} />
            </div>
            <div className="border-t border-line p-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Geofence</p>
                <span className="mono text-[10px] text-positive">Inside</span>
              </div>
              <p className="mt-2 text-[13px] font-medium">Home perimeter</p>
              <p className="mt-0.5 text-[11.5px] text-muted">250 m radius · entered 14:12</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-[68%] rounded-full bg-accent" />
              </div>
            </div>
            <div className="border-t border-line p-4">
              <p className="eyebrow mb-2.5">Actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                {commands.map((command) => (
                  <div
                    className="flex items-center gap-1.5 rounded-[7px] border border-line bg-surface-2 px-2 py-1.5"
                    key={command.label}
                  >
                    <command.icon className="size-3 text-muted" />
                    <span className="text-[10.5px] font-medium text-muted">
                      {command.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-auto border-t border-line p-4">
              <div className="flex items-center gap-2">
                <span className="status-dot text-positive" />
                <p className="text-[11px] text-muted">
                  Queue synced · <span className="mono">48 points</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BatteryMedium;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface p-3.5">
      <div className="flex items-center gap-1.5 text-faint">
        <Icon className="size-3" />
        <span className="mono text-[9px] uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mono mt-1.5 text-[15px] font-medium">{value}</p>
    </div>
  );
}
