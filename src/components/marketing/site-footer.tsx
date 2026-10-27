import Link from "next/link";

import { Wordmark } from "@/components/brand/logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#capabilities", label: "Capabilities" },
      { href: "/#android", label: "Android app" },
      { href: "/#questions", label: "Questions" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  const github = process.env.NEXT_PUBLIC_GITHUB_URL;
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "security@example.com";
  const apk = process.env.NEXT_PUBLIC_APK_URL;

  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark size="sm" />
          <p className="mt-4 max-w-[300px] text-[13px] leading-5 text-muted">
            An Android-first device locator with offline breadcrumbs and a
            security model you can audit. Built to be self-hosted.
          </p>
          <p className="mono mt-5 text-[11px] uppercase tracking-[0.12em] text-faint">
            AGPL-3.0-or-later
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <p className="eyebrow mb-4">{column.title}</p>
            <ul className="space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="eyebrow mb-4">Elsewhere</p>
          <ul className="space-y-2.5">
            {apk ? (
              <li>
                <a
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                  href={apk}
                >
                  Download APK
                </a>
              </li>
            ) : null}
            {github ? (
              <li>
                <a
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                  href={github}
                  rel="noreferrer"
                  target="_blank"
                >
                  Source code
                </a>
              </li>
            ) : null}
            <li>
              <a
                className="text-[13px] text-muted transition-colors hover:text-ink"
                href={`mailto:${contact}`}
              >
                Security contact
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-[11px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>Beacon is independent, open-source software. No trackers, no ad SDKs.</p>
          <p className="mono uppercase tracking-[0.1em]">
            Maps by OpenStreetMap · OpenFreeMap
          </p>
        </div>
      </div>
    </footer>
  );
}
