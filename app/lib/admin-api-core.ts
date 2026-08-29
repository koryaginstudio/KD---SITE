import {
  ProjectImageRecord,
  ProjectRecord,
  ProjectTypeRecord,
  removePortfolioObjects,
  rest,
  storagePathFromPublicUrl,
  uploadPortfolioObject,
} from "./supabase-admin";
import {
  PORTFOLIO_IMAGE_MAX_BYTES,
  PORTFOLIO_IMAGE_TYPES,
} from "./portfolio-image-rules";
import {
  canonicalImageExtension,
  validatePortfolioImage,
} from "./portfolio-image-validation";

const ADMIN_COMMAND_MAX_BYTES = 512 * 1024;
const ADMIN_MEDIA_MAX_BYTES = PORTFOLIO_IMAGE_MAX_BYTES + 1024 * 1024;

type ActionBody = {
  action?: string;
  id?: string;
  ids?: string[];
  project?: Partial<ProjectRecord>;
  projectType?: Partial<ProjectTypeRecord>;
  image?: Partial<ProjectImageRecord>;
};

const projectFields = [
  "slug",
  "title",
  "title_en",
  "category",
  "category_en",
  "service",
  "service_en",
  "year",
  "task",
  "task_en",
  "solution",
  "solution_en",
  "summary",
  "summary_en",
  "behance",
  "featured",
  "hero",
  "published",
  "in_portfolio",
  "sort",
  "project_type_id",
] as const;

export async function handleAdminGet(serviceKey?: string) {
  try {
    const [projects, images, projectTypes] = await Promise.all([
      rest<ProjectRecord[]>(
        "projects?select=*&order=sort.asc,created_at.asc",
        {},
        undefined,
        serviceKey,
      ),
      rest<ProjectImageRecord[]>(
        "project_images?select=*&order=sort.asc,created_at.asc",
        {},
        undefined,
        serviceKey,
      ),
      rest<ProjectTypeRecord[]>(
        "project_types?select=*&order=sort.asc,created_at.asc",
        {},
        undefined,
        serviceKey,
      ),
    ]);

    return json({ projects, images, projectTypes });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAdminPost(
  request: Request,
  serviceKey?: string,
) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const maxRequestBytes = contentType.includes("multipart/form-data")
      ? ADMIN_MEDIA_MAX_BYTES
      : ADMIN_COMMAND_MAX_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
      return json({ error: "Запрос превышает допустимый размер" }, 413);
    }
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(await request.formData(), serviceKey);
    }

    const body = await readActionBody(request, contentType);

    switch (body.action) {
      case "createProject":
        return createProject(body.project, serviceKey);
      case "updateProject":
        return updateProject(body.id, body.project, serviceKey);
      case "deleteProject":
        return deleteProject(body.id, serviceKey);
      case "reorderProjects":
        return reorderProjects(body.ids, serviceKey);
      case "createType":
        return createType(body.projectType, serviceKey);
      case "updateType":
        return updateType(body.id, body.projectType, serviceKey);
      case "deleteType":
        return deleteType(body.id, serviceKey);
      case "reorderTypes":
        return reorderTypes(body.ids, serviceKey);
      case "updateImage":
        return updateImage(body.id, body.image, serviceKey);
      case "deleteImage":
        return deleteImage(body.id, serviceKey);
      default:
        return json({ error: "Неизвестное действие" }, 400);
    }
  } catch (error) {
    return apiError(error);
  }
}

async function readActionBody(request: Request, contentType: string) {
  if (
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/json")
  ) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > ADMIN_COMMAND_MAX_BYTES) {
      throw new Error("Данные проекта превышают допустимый размер");
    }
    return JSON.parse(new TextDecoder().decode(buffer)) as ActionBody;
  }
  throw new Error("Неверный формат запроса");
}

async function createProject(
  input?: Partial<ProjectRecord>,
  serviceKey?: string,
) {
  const project = cleanProject(input);
  if (!project.title || !project.slug) {
    return json({ error: "Название и адрес проекта обязательны" }, 400);
  }

  const [created] = await rest<ProjectRecord[]>(
    "projects",
    { method: "POST", body: JSON.stringify(project) },
    "return=representation",
    serviceKey,
  );
  if (!created) throw new Error("Supabase не вернул созданный проект");
  return json({ project: created });
}

async function updateProject(
  id?: string,
  input?: Partial<ProjectRecord>,
  serviceKey?: string,
) {
  if (!id) return missingId();
  const project = cleanProject(input);
  if (!project.title || !project.slug) {
    return json({ error: "Название и адрес проекта обязательны" }, 400);
  }

  const [updated] = await rest<ProjectRecord[]>(
    `projects?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(project) },
    "return=representation",
    serviceKey,
  );
  if (!updated) throw new Error("Проект не найден или не был обновлён");
  return json({ project: updated });
}

async function deleteProject(id?: string, serviceKey?: string) {
  if (!id) return missingId();
  const images = await rest<ProjectImageRecord[]>(
    `project_images?select=*&project_id=eq.${encodeURIComponent(id)}`,
    {},
    undefined,
    serviceKey,
  );
  await rest<void>(
    `projects?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    undefined,
    serviceKey,
  );
  await removePortfolioObjects(
    images
      .map((image) => storagePathFromPublicUrl(image.url))
      .filter((path): path is string => Boolean(path)),
    serviceKey,
  );
  return json({ ok: true });
}

async function reorderProjects(ids?: string[], serviceKey?: string) {
  if (!Array.isArray(ids)) {
    return json({ error: "Неверный порядок проектов" }, 400);
  }
  await Promise.all(
    ids.map((id, index) =>
      rest<void>(
        `projects?id=eq.${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify({ sort: index + 1 }) },
        undefined,
        serviceKey,
      ),
    ),
  );
  return json({ ok: true });
}

async function createType(
  input?: Partial<ProjectTypeRecord>,
  serviceKey?: string,
) {
  const name = String(input?.name ?? "").trim();
  if (!name) return json({ error: "Введите название типа" }, 400);
  const payload = {
    name,
    name_en: String(input?.name_en ?? "").trim() || null,
    slug: String(input?.slug || slugify(name)),
    sort: nonNegativeNumber(input?.sort),
    active: input?.active !== false,
  };
  const [projectType] = await rest<ProjectTypeRecord[]>(
    "project_types",
    { method: "POST", body: JSON.stringify(payload) },
    "return=representation",
    serviceKey,
  );
  if (!projectType) throw new Error("Supabase не вернул созданный тип проекта");
  return json({ projectType });
}

async function updateType(
  id?: string,
  input?: Partial<ProjectTypeRecord>,
  serviceKey?: string,
) {
  if (!id) return missingId();
  const payload: Partial<ProjectTypeRecord> = {};
  if (typeof input?.name === "string") payload.name = input.name.trim();
  if (typeof input?.name_en === "string") payload.name_en = input.name_en.trim() || null;
  if (typeof input?.slug === "string") payload.slug = input.slug.trim();
  if (typeof input?.sort === "number") payload.sort = nonNegativeNumber(input.sort);
  if (typeof input?.active === "boolean") payload.active = input.active;

  const [projectType] = await rest<ProjectTypeRecord[]>(
    `project_types?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "return=representation",
    serviceKey,
  );
  if (!projectType) throw new Error("Тип проекта не найден или не был обновлён");
  return json({ projectType });
}

async function deleteType(id?: string, serviceKey?: string) {
  if (!id) return missingId();
  await rest<void>(
    `project_types?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    undefined,
    serviceKey,
  );
  return json({ ok: true });
}

async function reorderTypes(ids?: string[], serviceKey?: string) {
  if (!Array.isArray(ids)) {
    return json({ error: "Неверный порядок типов" }, 400);
  }
  await Promise.all(
    ids.map((id, index) =>
      rest<void>(
        `project_types?id=eq.${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify({ sort: index + 1 }) },
        undefined,
        serviceKey,
      ),
    ),
  );
  return json({ ok: true });
}

async function updateImage(
  id?: string,
  input?: Partial<ProjectImageRecord>,
  serviceKey?: string,
) {
  if (!id) return missingId();
  const payload: Partial<ProjectImageRecord> = {};
  if (typeof input?.alt === "string") payload.alt = input.alt.trim();
  if (typeof input?.is_cover === "boolean") payload.is_cover = input.is_cover;
  if (typeof input?.sort === "number") payload.sort = nonNegativeNumber(input.sort);

  const [image] = await rest<ProjectImageRecord[]>(
    `project_images?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "return=representation",
    serviceKey,
  );
  if (!image) throw new Error("Фотография не найдена или не была обновлена");
  return json({ image });
}

async function deleteImage(id?: string, serviceKey?: string) {
  if (!id) return missingId();
  const [image] = await rest<ProjectImageRecord[]>(
    `project_images?select=*&id=eq.${encodeURIComponent(id)}`,
    {},
    undefined,
    serviceKey,
  );
  await rest<void>(
    `project_images?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    undefined,
    serviceKey,
  );
  const path = image ? storagePathFromPublicUrl(image.url) : null;
  if (path) await removePortfolioObjects([path], serviceKey);
  return json({ ok: true });
}

async function handleUpload(formData: FormData, serviceKey?: string) {
  const action = String(formData.get("action") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");
  if (action !== "uploadImage" || !projectId || !(file instanceof File)) {
    return json({ error: "Не удалось прочитать файл" }, 400);
  }
  if (!PORTFOLIO_IMAGE_TYPES.includes(file.type as (typeof PORTFOLIO_IMAGE_TYPES)[number])) {
    return json({ error: "Поддерживаются JPG, PNG, WebP и AVIF" }, 400);
  }
  if (file.size > PORTFOLIO_IMAGE_MAX_BYTES) {
    return json({ error: "Файл больше 8 МБ" }, 400);
  }

  const validation = await validatePortfolioImage(file);
  if (!validation.ok) {
    return json({ error: validation.error }, 400);
  }

  const existing = await rest<ProjectImageRecord[]>(
    `project_images?select=*&project_id=eq.${encodeURIComponent(projectId)}&order=sort.asc`,
    {},
    undefined,
    serviceKey,
  );
  if (existing.length >= 4) {
    return json(
      { error: "У одного проекта может быть не более четырёх фотографий" },
      400,
    );
  }

  const filename = safeFilename(file.name || "project", file.type);
  const path = `${projectId}/${Date.now()}-${filename}`;
  const url = await uploadPortfolioObject(path, file, serviceKey);

  try {
    const [image] = await rest<ProjectImageRecord[]>(
      "project_images",
      {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          url,
          alt: String(formData.get("alt") ?? "").trim(),
          is_cover: existing.length === 0,
          sort: existing.length,
        }),
      },
      "return=representation",
      serviceKey,
    );
    if (!image) throw new Error("Supabase не вернул загруженную фотографию");
    return json({ image });
  } catch (error) {
    await removePortfolioObjects([path], serviceKey);
    throw error;
  }
}

function cleanProject(input?: Partial<ProjectRecord>) {
  const clean: Record<string, unknown> = {};
  for (const field of projectFields) {
    const value = input?.[field];
    if (value === undefined) continue;
    clean[field] = typeof value === "string" ? value.trim() : value;
  }
  clean.slug = String(clean.slug ?? "").toLowerCase();
  clean.title = String(clean.title ?? "");
  clean.sort = nonNegativeNumber(clean.sort);
  clean.behance = clean.behance ? String(clean.behance) : null;
  clean.project_type_id = clean.project_type_id || null;
  return clean as Partial<ProjectRecord>;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function safeFilename(value: string, type: string) {
  const dot = value.lastIndexOf(".");
  const name = (dot >= 0 ? value.slice(0, dot) : value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${name || "image"}${canonicalImageExtension(type)}`;
}

function slugify(value: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return value
    .toLowerCase()
    .split("")
    .map((character) => map[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `type-${Date.now()}`;
}

function missingId() {
  return json({ error: "Не указан идентификатор" }, 400);
}

function apiError(error: unknown) {
  console.error("Admin API error", error);
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  const friendly = message.includes("projects_project_type_id_fkey")
    ? "Этот тип используется в проектах. Сначала выберите для них другой тип или отключите текущий."
    : message.includes("duplicate key")
      ? "Такое название или адрес уже используется"
      : message;
  return json({ error: friendly }, 500);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
