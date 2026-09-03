const SUPABASE_PROJECT = "ddbsprjohemfmaasrzgg.supabase.co";

export function installLegacySubmissionBridge() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(
      request?.url ?? String(input),
      window.location.href,
    );
    const target = submissionTarget(url);
    if (!target) return originalFetch(input, init);

    const body = init?.body ?? (request ? await request.clone().text() : null);
    const submissionKey = crypto.randomUUID();
    const response = await originalFetch(target, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Submission-Key": submissionKey,
      },
      body,
      signal: init?.signal ?? request?.signal,
    });

    if (!response.ok) {
      const details = await response.clone().json().catch(() => null) as {
        error?: string;
      } | null;
      if (
        details?.error === "slot_unavailable" ||
        details?.error === "daily_limit_reached"
      ) {
        throw new Error(
          document.documentElement.dataset.kdLocale === "en"
            ? "This time is unavailable. Please choose another slot."
            : "Это время недоступно. Выбери другой слот.",
        );
      }
    } else {
      let source = "website";
      try {
        const payload = typeof body === "string" ? JSON.parse(body) as Record<string, unknown> : null;
        if (typeof payload?.source === "string") source = payload.source.slice(0, 80);
      } catch {
        // Analytics remains intentionally free of submitted personal data.
      }
      window.dispatchEvent(new CustomEvent("kd:conversion", {
        detail: {
          kind: target === "/api/bookings" ? "booking" : "lead",
          source,
        },
      }));
    }

    return response;
  };

  return () => {
    window.fetch = originalFetch;
  };
}

function submissionTarget(url: URL) {
  if (url.hostname !== SUPABASE_PROJECT) return null;
  if (url.pathname.endsWith("/functions/v1/quiz-submit")) return "/api/leads";
  if (url.pathname.endsWith("/rest/v1/leads")) return "/api/leads";
  if (url.pathname.endsWith("/rest/v1/consultation_bookings")) {
    return "/api/bookings";
  }
  return null;
}
