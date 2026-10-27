"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function ProfileForm({
  name: initialName,
  email,
  timezone: initialTimezone,
  emailVerified,
  timezones,
}: {
  name: string;
  email: string;
  timezone: string;
  emailVerified: boolean;
  timezones: string[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone }),
      });
      push({
        title: "Profile saved",
        description: "Times across the dashboard now use this timezone.",
        tone: "success",
      });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[12.5px] font-semibold">Profile</h2>
        <p className="mt-0.5 text-[10.5px] text-faint">
          Used in email greetings and for displaying timestamps.
        </p>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {error ? <FormMessage>{error}</FormMessage> : null}

        <Field htmlFor="profile-name" label="Name">
          <Input
            autoComplete="name"
            id="profile-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>

        <Field
          hint="Email address changes are not available in this release. Contact the operator if the address is wrong."
          label="Email address"
        >
          <div className="flex items-center gap-2">
            <Input disabled id="profile-email" type="email" value={email} />
            <Badge tone={emailVerified ? "positive" : "warning"} dot>
              {emailVerified ? "Verified" : "Unverified"}
            </Badge>
          </div>
        </Field>

        <Field
          hint="IANA timezone used for audit entries, alert emails and device dates."
          htmlFor="profile-timezone"
          label="Timezone"
        >
          <select
            className="field"
            id="profile-timezone"
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button icon={<Save className="size-3.5" />} loading={loading} type="submit">
            Save profile
          </Button>
          <p className="text-[10px] text-faint">
            Audited as {`account.profile.updated`}.
          </p>
        </div>
      </div>
    </form>
  );
}
