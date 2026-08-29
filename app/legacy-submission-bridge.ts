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
      if (details?.error === "slot_unavailable") {
        throw new Error(
          document.documentElement.dataset.kdLocale === "en"
            ? "This time has just been booked. Please choose another slot."
            : "Это время только что заняли. Выбери другой слот.",
        );
      }
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
