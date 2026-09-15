"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function useVolunteerNavigation() {
  const params = useSearchParams();
  const router = useRouter();
  function navigate(values: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    url.hash = "";
    if ("month" in values && url.pathname !== "/dev/voluntariado") {
      router.push(`${url.pathname}${url.search}`, { scroll: false });
      return;
    }
    window.history.pushState(null, "", url);
  }
  return { params, navigate };
}
