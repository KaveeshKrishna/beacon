import type { ReactNode } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export function ContentPage({
  eyebrow,
  title,
  summary,
  updated,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated?: string;
  sections?: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main id="main">
        <div className="border-b border-line bg-surface">
          <div className="container-page py-16 sm:py-20">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display mt-4 max-w-[18ch] text-[42px] sm:text-[56px]">
              {title}
            </h1>
            <p className="mt-5 max-w-[68ch] text-[14px] leading-6 text-muted">
              {summary}
            </p>
            {updated ? (
              <p className="mono mt-6 text-[10px] uppercase tracking-[0.12em] text-faint">
                Last updated {updated}
              </p>
            ) : null}
          </div>
        </div>
        <article className="container-page grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_240px] lg:py-16">
          <div className="min-w-0">{children}</div>
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[12px] border border-line bg-surface p-4">
              <p className="eyebrow">On this page</p>
              {sections && sections.length > 0 ? (
                <nav className="mt-3 space-y-2" aria-label="On this page">
                  {sections.map((section) => (
                    <a
                      className="block text-[11px] leading-4 text-muted transition-colors hover:text-ink"
                      href={`#${section.id}`}
                      key={section.id}
                    >
                      {section.label}
                    </a>
                  ))}
                </nav>
              ) : (
                <p className="mt-3 text-[11px] leading-4 text-muted">
                  Use the headings below to navigate this page.
                </p>
              )}
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-[10px] leading-4 text-faint">
                  Questions about this deployment? Use the security contact in
                  the footer.
                </p>
              </div>
            </div>
          </aside>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function ContentSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10 scroll-mt-24 last:mb-0" id={id}>
      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-6 text-muted">
        {children}
      </div>
    </section>
  );
}
