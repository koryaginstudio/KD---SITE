const SUPABASE_URL = "https://ddbsprjohemfmaasrzgg.supabase.co";
const STORAGE_BUCKET = "portfolio";

export type ProjectRecord = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  category: string | null;
  category_en: string | null;
  service: string | null;
  service_en: string | null;
  year: string | null;
  cover: string | null;
  images: string[] | null;
  task: string | null;
  task_en: string | null;
  solution: string | null;
  solution_en: string | null;
  summary: string | null;
  summary_en: string | null;
  behance: string | null;
  featured: boolean;
  hero: boolean;
  published: boolean;
  in_portfolio: boolean;
  sort: number;
  project_type_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectImageRecord = {
  id: string;
  project_id: string;
  url: string;
  alt: string;
  is_cover: boolean;
  sort: number;
  created_at?: string;
  updated_at?: string;
};

export type ProjectTypeRecord = {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  sort: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

function serviceKey(explicitKey?: string) {
  const key = explicitKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Панель ещё не подключена к ключу управления Supabase");
  }
  return key;
}

async function request(
  path: string,
  init: RequestInit = {},
  explicitKey?: string,
) {
  const key = serviceKey(explicitKey);
  const headers = new Headers(init.headers);
  headers.set("apikey", key);

  // Opaque Supabase secret keys are API keys, not JWTs. Sending an
  // `sb_secret_…` value as a bearer token makes PostgREST reject the request.
  // The gateway derives the service-role authorization from `apikey` instead.
  if (key.startsWith("sb_secret_")) {
    headers.delete("Authorization");
  } else {
    headers.set("Authorization", `Bearer ${key}`);
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    let message = details || `Ошибка Supabase: ${response.status}`;
    try {
      const parsed = JSON.parse(details) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      // Supabase may return plain text for storage errors.
    }
    throw new Error(message);
  }

  return response;
}

export async function rest<T>(
  path: string,
  init: RequestInit = {},
  prefer?: string,
  explicitKey?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (prefer) headers.set("Prefer", prefer);
  const response = await request(
    `/rest/v1/${path}`,
    { ...init, headers },
    explicitKey,
  );
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function uploadPortfolioObject(
  path: string,
  file: File,
  explicitKey?: string,
) {
  const response = await request(
    `/storage/v1/object/${STORAGE_BUCKET}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: await file.arrayBuffer(),
    },
    explicitKey,
  );
  await response.text();
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeStoragePath(path)}`;
}

export async function removePortfolioObjects(
  paths: string[],
  explicitKey?: string,
) {
  if (!paths.length) return;
  try {
    await request(
      `/storage/v1/object/${STORAGE_BUCKET}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      },
      explicitKey,
    );
  } catch (error) {
    console.warn("Не удалось удалить исходный файл из Storage", error);
  }
}

export function storagePathFromPublicUrl(url: string) {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
