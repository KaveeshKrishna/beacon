import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, ContentSection } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms for using this Beacon deployment, including acceptable use, device ownership, remote actions, availability and the open-source licence.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const operator =
    process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Beacon Project";
  const contact =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "security@example.com";

  return (
    <ContentPage
      eyebrow="Terms"
      summary="These terms apply to this hosted Beacon deployment. The software itself is open source and can be self-hosted under the AGPL. Read the limits carefully: Beacon is a locator, not an emergency service, and several remote actions are best-effort on modern Android."
      title="Clear terms. No dark patterns."
      updated="23 October 2026"
      sections={[
        { id: "agreement", label: "Using this deployment" },
        { id: "accounts", label: "Accounts and security" },
        { id: "acceptable-use", label: "Acceptable use" },
        { id: "devices", label: "Device control" },
        { id: "emergencies", label: "Emergency limits" },
        { id: "availability", label: "Availability" },
        { id: "intellectual-property", label: "Licence and content" },
        { id: "warranty", label: "Disclaimer and liability" },
        { id: "termination", label: "Closing your account" },
        { id: "law", label: "Governing law" },
      ]}
    >
      <ContentSection id="agreement" title="Using this deployment">
        <p>
          This deployment is operated by {operator}. By creating an account or
          using the service, you agree to these terms. If you do not agree, do
          not use the deployment. The{" "}
          <Link className="text-ink underline decoration-line-strong underline-offset-4" href="/privacy">
            privacy notice
          </Link>{" "}
          explains how data is handled.
        </p>
        <p>
          You must be old enough to form a binding contract in your jurisdiction.
          You are responsible for the accuracy of your account details and for
          all activity under your account and paired devices.
        </p>
      </ContentSection>

      <ContentSection id="accounts" title="Accounts and security">
        <p>
          Keep your password and second factor private. Use a unique password and
          enable an authenticator app where possible. Notify the operator
          promptly if you believe your account, a session or a paired device has
          been compromised. The security controls are only effective if you use
          them.
        </p>
        <p>
          You may not share an account in a way that defeats its security model,
          attempt to access another person&apos;s data, or use the service to
          harass, stalk, locate or monitor a person without lawful authority or
          consent. Device pairing is intended for devices you own or are
          authorised to manage.
        </p>
      </ContentSection>

      <ContentSection id="acceptable-use" title="Acceptable use">
        <p>You must not:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use Beacon in violation of applicable privacy, surveillance, harassment or location-tracking law.</li>
          <li>Track a person covertly where their consent or a legal basis is required and absent.</li>
          <li>Probe, scan, overload, reverse engineer or attempt to bypass the service&apos;s authentication, rate limits or security controls.</li>
          <li>Upload malware, abuse the API, automate account creation, or interfere with other users.</li>
          <li>Use the service to commit a crime, locate a person for a harmful purpose, or evade lawful process.</li>
          <li>Resell or rebrand the hosted service without the operator&apos;s written permission.</li>
        </ul>
        <p>
          The operator may suspend or remove an account that creates a security,
          legal or operational risk. Where practical, notice will be given first.
        </p>
      </ContentSection>

      <ContentSection id="devices" title="Device control and remote actions">
        <p>
          Remote actions such as ring, lock, lost mode, messages and best-effort
          photo requests are executed by the Android app using permissions the
          user grants. Android and device manufacturers may restrict or block
          them. Beacon reports what it knows, but does not guarantee delivery,
          execution or a particular result.
        </p>
        <p>
          Lost mode is not a substitute for locking the device with Android, notifying
          your carrier, changing account passwords, or contacting law enforcement.
          An alarm may reveal that the device is being tracked. A lock command may
          fail if device administration is not granted. A photo request may never
          produce an image. Plan accordingly.
        </p>
      </ContentSection>

      <ContentSection id="emergencies" title="Not an emergency service">
        <p>
          Beacon is not a 911/112 service, an alarm monitoring company, a
          guarantee of connectivity or a life-safety device. Do not rely on it as
          the only way to find a person or device in an emergency. If someone is
          in immediate danger, contact local emergency services and use the tools
          provided by the device platform and carrier.
        </p>
      </ContentSection>

      <ContentSection id="availability" title="Availability and changes">
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. Features may be added, changed or removed. The
          operator may suspend the deployment for maintenance, security or legal
          reasons, and may discontinue it with reasonable notice where possible.
          You can export your data before closing your account.
        </p>
        <p>
          Free-tier hosting, network providers and email providers can impose
          limits or outages. Scheduled alerts may be delayed. No uptime or
          delivery guarantee is offered unless the operator separately agrees in
          writing.
        </p>
      </ContentSection>

      <ContentSection id="intellectual-property" title="Software licence and content">
        <p>
          The Beacon source code is distributed under the GNU Affero General
          Public License, version 3 or later. Your use of the hosted service is
          also subject to these terms, but the software licence governs your
          rights to copy, modify and redistribute the code. This deployment may
          include modifications not published by the upstream project.
        </p>
        <p>
          You retain ownership of the data you put into the service. You grant
          the operator permission to host, process and transmit it only as needed
          to operate the service and as described in the privacy notice. Do not
          upload content you have no right to use.
        </p>
      </ContentSection>

      <ContentSection id="warranty" title="Disclaimer and liability">
        <p>
          To the fullest extent permitted by law, the service is provided without
          warranties of any kind, express or implied, including fitness for a
          particular purpose, accuracy of location data, availability or
          non-infringement. Some jurisdictions do not allow certain exclusions, so
          parts of this section may not apply to you.
        </p>
        <p>
          To the fullest extent permitted by law, the operator is not liable for
          indirect, incidental, special, consequential or punitive damages, or for
          lost or inaccurate location data, failed remote actions, missed alerts,
          loss of a device or personal injury arising from use of the service.
          Nothing in these terms limits liability that cannot lawfully be
          limited.
        </p>
      </ContentSection>

      <ContentSection id="termination" title="Closing your account">
        <p>
          You can delete your account from{" "}
          <Link className="text-ink underline decoration-line-strong underline-offset-4" href="/app/settings/data">
            Settings
          </Link>
          . Deletion removes application data as described in the privacy notice.
          These terms survive where their nature requires it, including
          disclaimers, limitations and provisions about disputes.
        </p>
      </ContentSection>

      <ContentSection id="law" title="Governing law and contact">
        <p>
          The operator must specify the governing law and courts that apply to
          this deployment. Nothing here overrides mandatory consumer protection
          rights in your country. Before relying on these terms, the operator
          should have them reviewed for the jurisdiction in which the service is
          offered.
        </p>
        <p>
          Questions about these terms:{" "}
          <a
            className="text-ink underline decoration-line-strong underline-offset-4"
            href={`mailto:${contact}`}
          >
            {contact}
          </a>
          .
        </p>
      </ContentSection>

      <p className="mt-10 rounded-[10px] border border-line bg-surface-2/60 px-4 py-3 text-[10px] leading-[1.7] text-faint">
        Template notice: these terms are not legal advice. The operator must
        review and adapt them, including the governing-law clause, before making
        the hosted service available.
      </p>
    </ContentPage>
  );
}
