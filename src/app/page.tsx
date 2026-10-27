import {
  ArrowRight,
  BatteryCharging,
  Bell,
  Camera,
  Check,
  Clock,
  Crosshair,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Route,
  ShieldCheck,
  Smartphone,
  WifiOff,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { ConsolePreview } from "@/components/marketing/console-preview";
import { buttonClasses } from "@/components/ui/button";

const capabilities = [
  {
    icon: WifiOff,
    title: "Offline breadcrumbs",
    copy:
      "Points are written to an encrypted SQLite queue first. When the network returns, up to 200 points sync in one request — deduplicated by client id, never reordered.",
  },
  {
    icon: Crosshair,
    title: "Remote actions",
    copy:
      "Locate, ring, lock, enter lost mode, show a message or force a sync. Commands are queued, authenticated per device, and expire if they are no longer useful.",
  },
  {
    icon: Layers,
    title: "Geofences",
    copy:
      "Arrival and departure checks run server-side against every accepted fix, so a missed push notification does not become a missed alert.",
  },
  {
    icon: BatteryCharging,
    title: "Presence signal",
    copy:
      "Battery, charging state, network type and SIM state arrive with each heartbeat. Stale and offline are distinct states, not one vague grey dot.",
  },
  {
    icon: Mail,
    title: "Email that fails over",
    copy:
      "Relay first, Resend second — or the reverse. Set a per-account priority, see recent delivery attempts, and never lose an alert because one provider is down.",
  },
  {
    icon: Route,
    title: "Evidence, not guesses",
    copy:
      "Every fix keeps accuracy, provider, timestamp and a mocked-location flag. Export the full account as JSON and preserve the trail if you need it later.",
  },
];

const steps = [
  {
    number: "01",
    title: "Trigger from anywhere",
    copy: "Send lost mode from the dashboard or another signed-in session.",
  },
  {
    number: "02",
    title: "Make it audible",
    copy: "The device raises a full-volume alarm and shows the lost screen.",
  },
  {
    number: "03",
    title: "Tighten the fix cadence",
    copy: "A foreground service increases location frequency while the mode is active.",
  },
  {
    number: "04",
    title: "Keep the trail",
    copy: "If signal disappears, the queue holds. The last known fix stays visible.",
  },
];

const securityItems = [
  { icon: Fingerprint, label: "Argon2id password hashing" },
  { icon: KeyRound, label: "Opaque, hashed session tokens" },
  { icon: ShieldCheck, label: "AES-256-GCM field encryption" },
  { icon: Smartphone, label: "Per-device bearer tokens" },
  { icon: Lock, label: "TOTP, email OTP and recovery codes" },
  { icon: Clock, label: "Rate limits and lockouts" },
  { icon: Bell, label: "Audit log for sensitive actions" },
  { icon: Layers, label: "Strict CSP and origin checks" },
];

const faqs = [
  {
    question: "Does Beacon replace Android's Find My Device?",
    answer:
      "No. Find My Device is the fastest option when a phone is online and signed into Google. Beacon is for the cases where you want your own data, longer history, offline queues, geofences and a server you control. Run both if you like.",
  },
  {
    question: "What happens when the phone is offline?",
    answer:
      "Fixes are stored locally in an encrypted queue and uploaded when connectivity returns. The dashboard keeps showing the last received fix, clearly labelled with its age, instead of pretending the location is current.",
  },
  {
    question: "Can Beacon take a photo remotely?",
    answer:
      "It can request one, but Android only permits camera access while the app is in the foreground. Beacon reports the result honestly. It does not pretend to be spyware and cannot capture silently from the background.",
  },
  {
    question: "Why Android first?",
    answer:
      "Android exposes the background location, telephony and device-management APIs this design depends on. A Windows client is planned. iOS would require a materially different background model, so it is not promised.",
  },
  {
    question: "Where does location data live?",
    answer:
      "In the Postgres database you configure. There is no Beacon-operated cloud and no analytics SDK. Map tiles are fetched from OpenFreeMap; Google Maps opens only when you choose to follow a link.",
  },
  {
    question: "Can I self-host it?",
    answer:
      "Yes. The web app targets Vercel's free tier and any Postgres provider — Neon is the documented default. The Android app is built locally with Android Studio or Gradle. Deployment and build guides are in the repository.",
  },
];

export default function HomePage() {
  const github = process.env.NEXT_PUBLIC_GITHUB_URL;
  const apk = process.env.NEXT_PUBLIC_APK_URL;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden="true" className="absolute inset-0 grid-lines opacity-[0.45]" />
          <div
            aria-hidden="true"
            className="absolute -right-[20%] -top-[30%] size-[720px] rounded-full bg-[radial-gradient(circle,rgba(217,68,32,0.10),transparent_66%)]"
          />
          <div className="container-page relative grid items-center gap-14 py-16 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:py-24">
            <div>
              <p className="eyebrow fade-up flex items-center gap-2">
                <span className="status-dot text-accent" />
                Android-first · Open source
              </p>
              <h1 className="display fade-up fade-up-1 mt-6 max-w-[13ch] text-[clamp(44px,6.2vw,78px)]">
                The last location is the one that matters.
              </h1>
              <p className="fade-up fade-up-2 mt-6 max-w-[52ch] text-[16px] leading-7 text-muted">
                Beacon keeps an offline breadcrumb trail, accepts remote
                commands, and tells you the truth about what Android will and
                will not allow. No ad SDKs. No map bill. No mystery backend.
              </p>
              <div className="fade-up fade-up-3 mt-8 flex flex-wrap items-center gap-3">
                <Link className={buttonClasses({ size: "lg" })} href="/signup">
                  Create an account
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  className={buttonClasses({ variant: "secondary", size: "lg" })}
                  href="/security"
                >
                  Read the security model
                </Link>
              </div>
              <div className="fade-up fade-up-3 mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] text-faint">
                {[
                  "Self-host on Vercel + Neon",
                  "AGPL-3.0",
                  "Pair in under a minute",
                ].map((item) => (
                  <span className="flex items-center gap-1.5" key={item}>
                    <Check className="size-3.5 text-positive" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="fade-up fade-up-2">
              <ConsolePreview />
            </div>
          </div>

          <div className="relative border-t border-line bg-surface/70">
            <div className="container-page grid grid-cols-2 gap-px bg-line md:grid-cols-4">
              {[
                { value: "Argon2id", label: "Password hashing" },
                { value: "AES-256-GCM", label: "Encrypted fields" },
                { value: "200", label: "Points per offline sync" },
                { value: "90 days", label: "Default retention" },
              ].map((item) => (
                <div className="bg-surface px-5 py-6" key={item.label}>
                  <p className="mono text-[17px] font-medium tracking-[-0.02em]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-faint">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b border-line" id="capabilities">
          <div className="container-page py-20 lg:py-24">
            <div className="grid gap-8 md:grid-cols-[1fr_1fr] md:items-end">
              <div>
                <p className="eyebrow">Capabilities</p>
                <h2 className="display mt-4 max-w-[18ch] text-[clamp(34px,4vw,50px)]">
                  Built for the gap between losing a phone and finding it.
                </h2>
              </div>
              <p className="max-w-[46ch] text-[14.5px] leading-6 text-muted md:justify-self-end">
                Consumer finders optimise for a phone that is online, charged
                and behaving. Beacon is designed around the other case: no
                signal, low battery, a removed SIM, and a decision you need to
                make quickly.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability, index) => (
                <article
                  className="group bg-surface p-6 transition-colors hover:bg-surface-2/60"
                  key={capability.title}
                >
                  <div className="flex items-start justify-between">
                    <span className="flex size-9 items-center justify-center rounded-[9px] border border-line bg-surface-2 text-ink">
                      <capability.icon className="size-4" />
                    </span>
                    <span className="mono text-[10px] text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.015em]">
                    {capability.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                    {capability.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Lost mode */}
        <section className="border-b border-line bg-surface">
          <div className="container-page grid gap-14 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
            <div>
              <p className="eyebrow">Lost mode</p>
              <h2 className="display mt-4 max-w-[16ch] text-[clamp(34px,4vw,50px)]">
                A phone in lost mode should get louder, not smarter.
              </h2>
              <p className="mt-5 max-w-[46ch] text-[14.5px] leading-6 text-muted">
                One command starts a predictable sequence: alarm, lock screen,
                higher fix cadence, queue protection. Nothing clever happens in
                the background. You can see every state on the dashboard.
              </p>

              <div className="mt-8 space-y-0">
                {steps.map((step, index) => (
                  <div className="flex gap-4" key={step.number}>
                    <div className="flex flex-col items-center">
                      <span className="mono flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg text-[10px] text-muted">
                        {step.number}
                      </span>
                      {index < steps.length - 1 ? (
                        <span className="my-1 w-px flex-1 bg-line" />
                      ) : null}
                    </div>
                    <div className="pb-5">
                      <p className="text-[13.5px] font-semibold">{step.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-muted">
                        {step.copy}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-line-strong bg-bg shadow-[0_30px_80px_-40px_rgba(10,11,13,0.4)]">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="status-dot text-accent" />
                  <p className="mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                    Lost mode · active
                  </p>
                </div>
                <span className="mono text-[10px] text-faint">00:14:32</span>
              </div>

              <div className="border-b border-line bg-accent/[0.06] px-5 py-6">
                <p className="text-[13px] text-muted">Field phone</p>
                <p className="display mt-1 text-[30px] tracking-[-0.03em]">
                  Alarm sounding
                </p>
                <p className="mono mt-2 text-[11px] text-muted">
                  Last fix 42 s ago · ±6 m · 62% battery
                </p>
              </div>

              <div className="divide-y divide-line">
                {[
                  ["Full-volume alarm", "Active", true],
                  ["Screen lock", "Admin permission granted", true],
                  ["Location cadence", "Every 60 seconds", true],
                  ["Offline queue", "142 points stored", true],
                  ["Photo request", "Awaiting foreground", false],
                  ["SIM state", "Changed at 14:02", false],
                ].map(([label, value, done]) => (
                  <div
                    className="flex items-center justify-between gap-4 px-5 py-3"
                    key={String(label)}
                  >
                    <span className="text-[12.5px] text-ink">{label}</span>
                    <span
                      className={
                        done
                          ? "mono text-[10.5px] text-positive"
                          : "mono text-[10.5px] text-warning"
                      }
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 border-t border-line px-5 py-4">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-faint" />
                <p className="text-[11px] leading-[1.6] text-faint">
                  Android restricts background camera access and SIM monitoring.
                  Beacon reports what it could and could not do instead of
                  showing a green checkmark that means nothing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Maps */}
        <section className="border-b border-line">
          <div className="container-page py-20 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
              <div>
                <p className="eyebrow">Maps</p>
                <h2 className="display mt-4 max-w-[15ch] text-[clamp(34px,4vw,50px)]">
                  Vector maps. No billing dashboard.
                </h2>
                <p className="mt-5 max-w-[48ch] text-[14.5px] leading-6 text-muted">
                  Beacon renders OpenFreeMap styles with MapLibre GL. There is no
                  API key to leak, no per-load invoice, and no phone-home map SDK
                  embedded in the dashboard. When you want turn-by-turn
                  directions, one link opens the coordinates in Google Maps.
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {["OpenFreeMap", "MapLibre GL", "OpenStreetMap data", "No API key"].map(
                    (item) => (
                      <span
                        className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-muted"
                        key={item}
                      >
                        {item}
                      </span>
                    ),
                  )}
                </div>
                <a
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                    className: "mt-7",
                  })}
                  href="https://openfreemap.org"
                  rel="noreferrer"
                  target="_blank"
                >
                  About OpenFreeMap
                  <ArrowRight className="size-4" />
                </a>
              </div>

              <div className="overflow-hidden rounded-xl border border-line-strong bg-surface">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-line-strong" />
                    <span className="size-2 rounded-full bg-line-strong" />
                    <span className="size-2 rounded-full bg-line-strong" />
                  </div>
                  <span className="mono text-[10px] text-faint">map-style.env</span>
                </div>
                <pre className="overflow-x-auto px-5 py-5 text-[11.5px] leading-6 text-muted">
                  <code>
                    <span className="text-faint"># Light — Positron</span>
                    {"\n"}NEXT_PUBLIC_MAP_STYLE_LIGHT=
                    {"\n"}  https://tiles.openfreemap.org/styles/positron
                    {"\n\n"}
                    <span className="text-faint"># Dark — Dark Matter</span>
                    {"\n"}NEXT_PUBLIC_MAP_STYLE_DARK=
                    {"\n"}  https://tiles.openfreemap.org/styles/dark
                  </code>
                </pre>
                <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
                  {[
                    { label: "Tile provider", value: "OpenFreeMap" },
                    { label: "Renderer", value: "MapLibre GL JS" },
                    { label: "Directions", value: "Google Maps link" },
                    { label: "API key", value: "Not required" },
                  ].map((row) => (
                    <div className="bg-surface px-4 py-3" key={row.label}>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-faint">
                        {row.label}
                      </p>
                      <p className="mt-1 text-[12.5px] font-medium">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Android */}
        <section className="border-b border-line bg-surface" id="android">
          <div className="container-page grid gap-14 py-20 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-24">
            <div className="order-2 lg:order-1">
              <p className="eyebrow">Android app</p>
              <h2 className="display mt-4 max-w-[16ch] text-[clamp(34px,4vw,50px)]">
                Native, battery-aware, honest about limits.
              </h2>
              <p className="mt-5 max-w-[48ch] text-[14.5px] leading-6 text-muted">
                A Kotlin and Jetpack Compose client uses WorkManager for the
                baseline and a foreground service for live and lost mode. The
                tracking profile is a real setting, not a marketing toggle.
              </p>

              <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
                {[
                  { icon: Crosshair, label: "Fused location", copy: "Balanced by default" },
                  { icon: WifiOff, label: "Encrypted queue", copy: "Survives offline" },
                  { icon: Zap, label: "Low-power path", copy: "Doze-aware scheduling" },
                  { icon: Camera, label: "Photo request", copy: "Foreground only" },
                ].map((item) => (
                  <div className="bg-surface px-4 py-3.5" key={item.label}>
                    <item.icon className="size-3.5 text-muted" />
                    <p className="mt-2 text-[12.5px] font-medium">{item.label}</p>
                    <p className="text-[11px] text-faint">{item.copy}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {apk ? (
                  <a
                    className={buttonClasses({ size: "md" })}
                    href={apk}
                    rel="noreferrer"
                  >
                    Download the APK
                  </a>
                ) : (
                  <Link className={buttonClasses({ size: "md" })} href="/signup">
                    Create an account to pair
                    <ArrowRight className="size-4" />
                  </Link>
                )}
                {github ? (
                  <a
                    className={buttonClasses({ variant: "secondary", size: "md" })}
                    href={github}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Build from source
                  </a>
                ) : null}
              </div>
              <p className="mono mt-3 text-[10px] uppercase tracking-[0.12em] text-faint">
                Android 8.0+ · No Play Services required
              </p>
            </div>

            <div className="order-1 flex justify-center lg:order-2">
              <div className="relative w-[280px] rounded-[36px] border border-line-strong bg-[#0b0c0e] p-[9px] shadow-[0_36px_90px_-36px_rgba(10,11,13,0.55)]">
                <div className="overflow-hidden rounded-[28px] bg-[#0e1013]">
                  <div className="relative h-[520px]">
                    <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:36px_36px]" />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-4">
                      <span className="mono text-[9px] text-white/40">9:41</span>
                      <span className="mono text-[9px] text-white/40">LTE · 62%</span>
                    </div>

                    <svg
                      aria-hidden="true"
                      className="absolute inset-x-0 top-20 h-[260px] w-full"
                      fill="none"
                      viewBox="0 0 280 260"
                    >
                      <path
                        d="M40 222C76 210 88 168 124 164S176 184 198 140 226 80 252 72"
                        stroke="#FF6A45"
                        strokeDasharray="4 6"
                        strokeLinecap="round"
                        strokeWidth="2"
                      />
                      <circle cx="40" cy="222" fill="#0e1013" r="3.5" stroke="#FF6A45" strokeWidth="2" />
                      <circle cx="124" cy="164" fill="#0e1013" r="3" stroke="#FF6A45" strokeWidth="1.5" />
                      <circle cx="198" cy="140" fill="#0e1013" r="3" stroke="#FF6A45" strokeWidth="1.5" />
                    </svg>

                    <div className="absolute left-[63%] top-[23%]">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#FF6A45]/40" />
                      <span className="relative block size-4 rounded-full border-[3px] border-[#0e1013] bg-[#FF6A45]" />
                    </div>

                    <div className="absolute inset-x-3 top-14 rounded-xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[8px] uppercase tracking-[0.16em] text-white/40">
                          Lost mode
                        </span>
                        <span className="size-1.5 rounded-full bg-[#FF6A45]" />
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-white">
                        Field phone
                      </p>
                      <p className="mono mt-0.5 text-[9px] text-white/45">
                        Updated 12 s ago · ±8 m
                      </p>
                    </div>

                    <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-[#15181d]/95 p-4">
                      <p className="mono text-[8px] uppercase tracking-[0.16em] text-white/35">
                        Device queue
                      </p>
                      <div className="mt-2 flex items-end justify-between">
                        <p className="text-[24px] font-semibold tracking-[-0.03em] text-white">
                          142
                        </p>
                        <p className="mono text-[9px] text-[#48C98B]">Encrypted</p>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {["Locate", "Alarm", "Sync"].map((label, index) => (
                          <div
                            className={
                              index === 0
                                ? "rounded-md bg-[#FF6A45] py-2 text-center text-[9.5px] font-medium text-[#170b07]"
                                : "rounded-md border border-white/10 py-2 text-center text-[9.5px] text-white/60"
                            }
                            key={label}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="border-b border-line">
          <div className="container-page py-20 lg:py-24">
            <div className="overflow-hidden rounded-xl border border-line-strong bg-[#0c0d10] text-[#f4f1ea]">
              <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:p-12">
                <div>
                  <p className="eyebrow text-white/45">Security posture</p>
                  <h2 className="display mt-4 max-w-[16ch] text-[clamp(32px,3.7vw,46px)] text-white">
                    Assume the server will be attacked. Design for it.
                  </h2>
                  <p className="mt-5 max-w-[46ch] text-[13.5px] leading-6 text-white/55">
                    Beacon treats location history as sensitive by default.
                    Sessions are opaque and hashed. Sensitive columns are
                    encrypted with context-bound AES-GCM. Device tokens are
                    scoped, hashed and revocable. Every privileged action is
                    written to an audit log.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <Link
                      className={buttonClasses({
                        variant: "secondary",
                        size: "md",
                        className: "border-white/15 bg-white/5 text-white hover:bg-white/10",
                      })}
                      href="/security"
                    >
                      Read the security model
                      <ArrowRight className="size-4" />
                    </Link>
                    {github ? (
                      <a
                        className={buttonClasses({
                          variant: "ghost",
                          size: "md",
                          className: "text-white/60 hover:bg-white/10 hover:text-white",
                        })}
                        href={github}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Inspect the source
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
                  {securityItems.map((item) => (
                    <div className="bg-[#0c0d10] p-3.5" key={item.label}>
                      <item.icon className="size-3.5 text-[#FF6A45]" />
                      <p className="mt-2 text-[11.5px] leading-4 text-white/70">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-7 py-4 sm:px-10 lg:px-12">
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  Open source · AGPL-3.0-or-later
                </p>
                <p className="mono text-[10px] text-white/35">
                  No third-party analytics. Ever.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-b border-line bg-surface" id="questions">
          <div className="container-page grid gap-12 py-20 lg:grid-cols-[0.7fr_1.3fr] lg:py-24">
            <div>
              <p className="eyebrow">Questions</p>
              <h2 className="display mt-4 max-w-[12ch] text-[clamp(34px,4vw,48px)]">
                Straight answers.
              </h2>
              <p className="mt-4 max-w-[34ch] text-[13px] leading-6 text-muted">
                If something here is not true of the deployed version, it is a
                bug in the documentation. The repository is the source of truth.
              </p>
            </div>

            <div className="divide-y divide-line border-y border-line">
              {faqs.map((faq) => (
                <details className="group" key={faq.question}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[14px] font-medium tracking-[-0.01em]">
                    {faq.question}
                    <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted">
                      <span className="absolute h-px w-2 bg-current" />
                      <span className="absolute h-2 w-px bg-current transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="max-w-[64ch] pb-5 pr-10 text-[13px] leading-[1.7] text-muted">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 grid-lines opacity-40" />
          <div className="container-page relative py-20 text-center lg:py-28">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-surface">
              <ShieldCheck className="size-5 text-accent" />
            </div>
            <h2 className="display mx-auto mt-7 max-w-[17ch] text-[clamp(36px,5vw,62px)]">
              Keep the last known location. And the proof.
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-[14px] leading-6 text-muted">
              Create an account, pair an Android device, and decide how much
              history you want to keep. Bring your own infrastructure.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link className={buttonClasses({ size: "lg" })} href="/signup">
                Create your account
                <ArrowRight className="size-4" />
              </Link>
              <Link
                className={buttonClasses({ variant: "secondary", size: "lg" })}
                href="/login"
              >
                Sign in
              </Link>
            </div>
            <p className="mono mt-6 text-[10px] uppercase tracking-[0.12em] text-faint">
              Free to self-host · No credit card · No tracking pixels
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
