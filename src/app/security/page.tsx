import type { Metadata } from "next";
import Link from "next/link";
import {
  Database,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";

import { ContentPage, ContentSection } from "@/components/marketing/content-page";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Security",
  description:
    "Beacon's security model: authentication, device pairing, encryption, location privacy, hosting responsibilities, limitations and coordinated disclosure.",
  alternates: { canonical: "/security" },
};

const controls = [
  {
    icon: Fingerprint,
    title: "Password authentication",
    copy: "Argon2id with per-password salt. Passwords are never stored, logged or emailed. Optional HIBP k-anonymity checks reject known-breached passwords.",
  },
  {
    icon: KeyRound,
    title: "Sessions and factors",
    copy: "Opaque 256-bit session cookies, stored as keyed hashes, with TOTP, email codes and single-use recovery codes. Expired or revoked sessions fail closed.",
  },
  {
    icon: Smartphone,
    title: "Device pairing",
    copy: "Short-lived, single-use pairing codes exchanged for a per-device bearer token. Tokens are stored as HMACs and can be revoked independently of your account.",
  },
  {
    icon: Lock,
    title: "Encryption at rest",
    copy: "TOTP secrets, fallback SMS numbers and push tokens are encrypted with AES-256-GCM. Sensitive location payloads are encrypted in transit by TLS.",
  },
  {
    icon: Database,
    title: "Data minimisation",
    copy: "Location history is pruned by a scheduled job. IP addresses are stored as keyed hashes. Email delivery logs exclude message bodies and one-time codes.",
  },
  {
    icon: ShieldCheck,
    title: "Application hardening",
    copy: "Origin and content-type checks on state changes, nonce-based CSP, frame denial, strict referrer policy and rate limiting across authentication endpoints.",
  },
  {
    icon: Mail,
    title: "Email failover",
    copy: "Relay-first or Resend-first delivery with bounded timeouts and explicit failure logging. Security mail is not silenced by alert preferences.",
  },
  {
    icon: WifiOff,
    title: "Offline integrity",
    copy: "The Android client queues fixes locally and uploads with client-generated ids. Server-side uniqueness prevents duplicate breadcrumbs after retries.",
  },
];

export default function SecurityPage() {
  const contact =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "security@example.com";
  const operator =
    process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Beacon Project";

  return (
    <ContentPage
      eyebrow="Trust"
      summary="Beacon handles a category of data that is unusually sensitive: where a person is, where they have been, and which device they carry. This page explains what the software protects, where its limits are, and how to report a problem."
      title="Security you can inspect."
      updated="23 October 2026"
      sections={[
        { id: "model", label: "Security model" },
        { id: "authentication", label: "Authentication" },
        { id: "devices", label: "Android limits" },
        { id: "data", label: "Location and retention" },
        { id: "reporting", label: "Report a vulnerability" },
        { id: "hardening", label: "Operator duties" },
      ]}
    >
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {controls.map((item) => (
          <div className="rounded-[12px] border border-line bg-surface p-4" key={item.title}>
            <item.icon className="size-4 text-accent" />
            <h2 className="mt-3 text-[12.5px] font-semibold">{item.title}</h2>
            <p className="mt-1.5 text-[10.5px] leading-[1.7] text-muted">
              {item.copy}
            </p>
          </div>
        ))}
      </div>

      <ContentSection id="model" title="The security model">
        <p>
          Beacon is self-hostable software. There is no central Beacon service
          and no telemetry endpoint. The operator of this deployment controls
          the database, the encryption keys, the email providers and the
          retention policy. The security of your data therefore depends on both
          the code and how this instance is operated.
        </p>
        <p>
          The web application holds a session cookie and talks to a PostgreSQL
          database over TLS. The Android app holds a device-scoped bearer token,
          never your account password. Losing a device does not expose your
          dashboard password, and revoking a device does not sign out your
          browser sessions.
        </p>
      </ContentSection>

      <ContentSection id="authentication" title="Authentication and account recovery">
        <p>
          Account passwords are hashed with Argon2id. A successful password
          change and every new sign-in can produce a security email. Optional
          TOTP is the preferred second factor; email one-time codes exist as a
          fallback, and single-use recovery codes are issued when TOTP is
          enabled. Recovery codes are hashed before storage and are displayed
          exactly once.
        </p>
        <p>
          Password reset tokens are random, single-use and short-lived. The
          reset flow does not reveal whether an address is registered. Sessions
          are opaque random tokens; the database stores only a keyed hash, so a
          database read does not yield a usable cookie.
        </p>
      </ContentSection>

      <ContentSection id="devices" title="Android and device limitations">
        <p>
          Android is a hostile environment for always-on location work. Beacon
          uses the foreground-service and WorkManager APIs that Android permits,
          but manufacturers may still restrict background execution. A powered
          off, network-isolated or force-stopped device cannot upload. In that
          case the last received fix remains visible with its timestamp and is
          clearly marked stale; it is not presented as current.
        </p>
        <p>
          Remote camera capture is best-effort and only possible while Android
          permits the app to use the camera in the foreground. Beacon does not
          attempt covert capture, does not bypass lock screens and cannot
          remotely enable GPS if the operating system has disabled it. SIM
          change and SMS fallback behaviour depend on carrier, device and Android
          version. Treat these as signals, not guarantees.
        </p>
        <p>
          Beacon is not an emergency service and is not a substitute for
          Android&apos;s Find My Device, a carrier location service, or law
          enforcement. In an immediate emergency, contact local emergency
          services.
        </p>
      </ContentSection>

      <ContentSection id="data" title="Location data and retention">
        <p>
          Location points contain coordinates, accuracy, timestamp, provider,
          battery state and a mocked-location flag. They are available to every
          signed-in session on the account and to paired devices through their
          scoped APIs. Geofences are evaluated on the server. Exports are
          generated only after an authenticated request and are not cached.
        </p>
        <p>
          Map tiles are requested directly from OpenFreeMap, so the tile server
          learns the approximate map viewport and the client IP address. Beacon
          does not send your stored location history to the tile provider. See{" "}
          <Link className="text-ink underline decoration-line-strong underline-offset-4" href="/privacy">
            Privacy
          </Link>{" "}
          for the full data inventory.
        </p>
      </ContentSection>

      <ContentSection id="reporting" title="Reporting a vulnerability">
        <p>
          Please report suspected vulnerabilities privately to{" "}
          <a
            className="text-ink underline decoration-line-strong underline-offset-4"
            href={`mailto:${contact}`}
          >
            {contact}
          </a>
          . Include the affected version or commit, a description, reproduction
          steps and any proof-of-concept material. Do not include real location
          data, account credentials or other people&apos;s personal information.
        </p>
        <p>
          We aim to acknowledge reports within five working days, keep you
          informed while a fix is developed, and credit you if you want credit.
          Please do not access data that is not yours, disrupt other users, or
          test against a deployment you do not own. This is a volunteer open
          source project; there is no bounty programme.
        </p>
      </ContentSection>

      <ContentSection id="hardening" title="Operator responsibilities">
        <p>
          A secure deployment uses TLS, a private database connection, unique
          high-entropy <code className="mono text-ink">AUTH_SECRET</code> and{" "}
          <code className="mono text-ink">ENCRYPTION_KEY</code> values, provider
          keys scoped to sending only, and least-privilege hosting accounts.
          Rotate credentials after any suspected exposure. The{" "}
          <code className="mono text-ink">RELAY_API_INTEGRATION.md</code> file
          used during development is intentionally not part of the repository.
        </p>
        <p>
          Backups contain personal data. Encrypt them, restrict access, test
          restores, and document how long they persist after account deletion.
          Security headers and default rate limits are not a substitute for
          monitoring, dependency updates and an incident response plan.
        </p>
      </ContentSection>

      <div className="mt-12 flex flex-wrap gap-2 border-t border-line pt-8">
        <Link className={buttonClasses({ size: "md" })} href="/signup">
          Create an account
        </Link>
        <Link
          className={buttonClasses({ variant: "secondary", size: "md" })}
          href="/privacy"
        >
          Read the privacy notice
        </Link>
      </div>

      <p className="mt-6 text-[10px] leading-4 text-faint">
        This page describes the software and this deployment at a high level. It
        is not a certification, warranty or audit report. The operator of this
        instance is {operator}.
      </p>
    </ContentPage>
  );
}
