import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, ContentSection } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Beacon stores, why it stores it, how long it is retained, which infrastructure providers may process it, and how to exercise your data rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const operator =
    process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Beacon Project";
  const contact =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "security@example.com";

  return (
    <ContentPage
      eyebrow="Privacy"
      summary="Beacon is a self-hostable device locator, so this notice is a template for the operator of this deployment. It describes the data the software handles and the choices built into it. The operator is responsible for adapting it to local law and their actual infrastructure."
      title="Your location is not our product."
      updated="23 October 2026"
      sections={[
        { id: "controller", label: "Who is responsible" },
        { id: "data", label: "What is collected" },
        { id: "why", label: "Why it is used" },
        { id: "retention", label: "Retention" },
        { id: "processors", label: "Where data goes" },
        { id: "cookies", label: "Cookies" },
        { id: "security", label: "Security" },
        { id: "rights", label: "Your rights" },
        { id: "children", label: "Children and changes" },
      ]}
    >
      <ContentSection id="controller" title="Who is responsible">
        <p>
          This deployment is operated by {operator}. That operator decides why
          and how account data is processed and is the data controller for the
          purposes of applicable privacy law. Beacon is open-source software; the
          project maintainers do not receive data from this deployment.
        </p>
        <p>
          Privacy questions and rights requests should go to{" "}
          <a
            className="text-ink underline decoration-line-strong underline-offset-4"
            href={`mailto:${contact}`}
          >
            {contact}
          </a>
          . The operator may need to verify that you control the account before
          acting on a request.
        </p>
      </ContentSection>

      <ContentSection id="data" title="What is collected">
        <p>
          <strong className="font-medium text-ink">Account identity.</strong>{" "}
          Name, email address, password hash, timezone, notification choices,
          MFA configuration, account creation date and sign-in timestamps. Email
          verification and password-reset tokens are stored as hashes.
        </p>
        <p>
          <strong className="font-medium text-ink">Device and location data.</strong>{" "}
          Device name, manufacturer, model, Android and app versions, tracking
          profile, battery level, charging state, network and SIM state, plus
          location coordinates, accuracy, altitude, speed, heading, provider and
          timestamps. Geofences you create and the transition events they
          produce are also stored.
        </p>
        <p>
          <strong className="font-medium text-ink">Remote actions.</strong>{" "}
          Commands you send to a device, their status, acknowledgement and any
          message text you choose to include. Command results may include device
          state needed to explain success or failure.
        </p>
        <p>
          <strong className="font-medium text-ink">Security records.</strong>{" "}
          Sign-ins, MFA changes, session revocations, pairing, geofence
          transitions and account changes are written to an audit log. IP
          addresses are reduced to a keyed hash. User-agent strings are stored
          to describe sessions and may identify a browser and operating system.
        </p>
        <p>
          <strong className="font-medium text-ink">Session data.</strong> A
          random session token is stored in an <code className="mono text-ink">HttpOnly</code>{" "}
          cookie. The server stores only a keyed hash of that token, along with
          the browser user agent and hashed IP address.
        </p>
        <p>
          <strong className="font-medium text-ink">Email delivery metadata.</strong>{" "}
          Recipient, template type, provider, delivery status, provider message
          id, error code and latency are logged. Message bodies and one-time codes
          are not written to delivery logs.
        </p>
        <p>
          Beacon does not include advertising SDKs, behavioural analytics,
          session replay, fingerprinting scripts or third-party tracking pixels.
        </p>
      </ContentSection>

      <ContentSection id="why" title="Why it is used">
        <ul className="list-disc space-y-2 pl-5">
          <li>To authenticate you and protect your account and paired devices.</li>
          <li>To display current and historical device location to you.</li>
          <li>To evaluate geofences and deliver the alerts you request.</li>
          <li>To carry out remote actions that you initiate.</li>
          <li>To send transactional email such as verification and security notices.</li>
          <li>To investigate abuse, secure the service and maintain audit records.</li>
          <li>To produce an export or delete data when you ask us to.</li>
        </ul>
        <p>
          Location tracking is user-initiated. Beacon is not intended to track a
          person without their knowledge or consent where that is required by
          law. If you use Beacon on a device you do not own, you are responsible
          for obtaining any necessary consent and for complying with applicable
          law.
        </p>
      </ContentSection>

      <ContentSection id="retention" title="How long it is kept">
        <p>
          Delivery metadata and account data are kept while the account exists,
          unless a shorter operational period applies. Location history is pruned
          by a scheduled job according to the deployment&apos;s{" "}
          <code className="mono text-ink">LOCATION_RETENTION_DAYS</code> setting.
          Audit events are pruned according to{" "}
          <code className="mono text-ink">AUDIT_RETENTION_DAYS</code>. Sessions
          expire automatically and can be revoked at any time.
        </p>
        <p>
          Account deletion removes the user record and cascades to devices,
          location history, geofences, sessions, recovery codes and email logs.
          Encrypted infrastructure backups may retain copies for the operator&apos;s
          backup window; they are not used for normal application queries and are
          overwritten on the backup schedule.
        </p>
      </ContentSection>

      <ContentSection id="processors" title="Where data goes">
        <p>
          This deployment depends on infrastructure chosen by its operator. It
          may include:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-ink">Hosting and database.</strong>{" "}
            The web application and database may run on Vercel, Neon or another
            provider. Those providers process account and location data on the
            operator&apos;s instructions.
          </li>
          <li>
            <strong className="font-medium text-ink">Email.</strong> Relay and/or
            Resend receive the recipient address, subject and rendered message
            needed to deliver transactional mail. The operator chooses which
            providers are enabled and the per-account ordering.
          </li>
          <li>
            <strong className="font-medium text-ink">Maps.</strong> MapLibre loads
            style and tile resources from OpenFreeMap. Your browser connects
            directly, disclosing your IP address and approximate viewport. Stored
            location history is not sent to the tile provider.
          </li>
          <li>
            <strong className="font-medium text-ink">Push, if enabled.</strong>{" "}
            Firebase Cloud Messaging may receive a device push token and a
            notification payload used to wake the Android app for commands.
          </li>
          <li>
            <strong className="font-medium text-ink">Legal requirements.</strong>{" "}
            The operator may disclose data if required by applicable law, after
            assessing the request. The open-source project cannot access this
            deployment&apos;s data.
          </li>
        </ul>
        <p>
          Beacon does not sell personal data, share it for cross-context
          behavioural advertising, or use location history to train advertising
          models.
        </p>
      </ContentSection>

      <ContentSection id="cookies" title="Cookies and local storage">
        <p>
          Beacon uses a small number of first-party cookies: an{" "}
          <code className="mono text-ink">HttpOnly</code> session cookie, a
          short-lived MFA challenge cookie during sign-in, and a theme preference
          cookie. The Android app stores a device token and an encrypted local
          location queue in app-private storage. No advertising or analytics
          cookies are set.
        </p>
      </ContentSection>

      <ContentSection id="security" title="Security">
        <p>
          Passwords use Argon2id. Sensitive fields such as TOTP secrets, fallback
          phone numbers and push tokens are encrypted with AES-256-GCM. Transport
          is protected by TLS in a correctly configured deployment. Access to the
          database is limited to the operator and hosting provider.
        </p>
        <p>
          No system is perfectly secure. If you believe data has been exposed,
          change your password, revoke sessions and devices, and contact the
          operator. See the{" "}
          <Link className="text-ink underline decoration-line-strong underline-offset-4" href="/security">
            security page
          </Link>{" "}
          for reporting details.
        </p>
      </ContentSection>

      <ContentSection id="rights" title="Your choices and rights">
        <p>
          You can update your profile and alert preferences, revoke individual
          sessions and paired devices, export your data as JSON, and delete your
          account from Settings. Depending on your location, you may also have
          rights to access, correct, delete, restrict or object to processing, and
          to complain to a data protection authority.
        </p>
        <p>
          Some data must be retained to comply with law or resolve security
          incidents. The operator will explain any lawful restriction that
          applies to a request. You can use the export and delete controls even if
          you do not want to contact the operator.
        </p>
      </ContentSection>

      <ContentSection id="children" title="Children and changes">
        <p>
          Beacon is not directed at children. Do not create an account for a child
          without appropriate authority and consent. Material changes to this
          notice will be published on this page and, where appropriate,
          communicated by email before they take effect.
        </p>
      </ContentSection>

      <p className="mt-10 rounded-[10px] border border-line bg-surface-2/60 px-4 py-3 text-[10px] leading-[1.7] text-faint">
        This notice is a starting point for self-hosters, not legal advice. The
        operator must review it against the actual deployment, contracts,
        retention settings, data location and applicable law before relying on
        it.
      </p>
    </ContentPage>
  );
}
