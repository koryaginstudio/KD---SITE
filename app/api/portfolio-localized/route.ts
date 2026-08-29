import {
  projectTranslations,
  projectTypeTranslations,
} from "../../i18n/project-translations";

export const dynamic = "force-dynamic";

const SUPABASE_URL = "https://ddbsprjohemfmaasrzgg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_yvWwTn4EUBmbX5OqLbukKQ_RosSTMM1";

type ProjectRow = Record<string, unknown> & { slug?: string };
type TypeRow = Record<string, unknown> & { slug?: string; name?: string };

export async function GET() {
  try {
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
    const [projectsResponse, typesResponse] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/projects?select=*&published=eq.true&order=sort.asc`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/project_types?select=*&active=eq.true&order=sort.asc`,
        { headers, cache: "no-store" },
      ),
    ]);

    if (!projectsResponse.ok || !typesResponse.ok) {
      throw new Error("Localized portfolio data is unavailable");
    }

    const projects = (await projectsResponse.json()) as ProjectRow[];
    const projectTypes = (await typesResponse.json()) as TypeRow[];
    const fallbackBySlug = new Map(
      projectTranslations.map((project) => [project.slug, project]),
    );

    return Response.json(
      {
        projects: projects.map((project) => {
          const fallback = fallbackBySlug.get(String(project.slug ?? ""));
          return {
            slug: project.slug,
            source: pickProjectLocale(project, ""),
            target: pickProjectLocale(project, "_en", fallback),
          };
        }),
        projectTypes: projectTypes.map((projectType) => ({
          slug: projectType.slug,
          source: String(projectType.name ?? ""),
          target: canonicalizeEnglishService(String(
            projectType.name_en ??
              projectTypeTranslations[String(projectType.slug ?? "")] ??
              projectType.name ??
              "",
          )),
        })),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Localized portfolio API error", error);
    return Response.json(
      { error: "Localized portfolio data is unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function pickProjectLocale(
  project: ProjectRow,
  suffix: "" | "_en",
  fallback?: {
    title: string;
    category: string;
    service: string;
    task: string;
    solution: string;
    summary: string;
  },
) {
  const fields = [
    "title",
    "category",
    "service",
    "task",
    "solution",
    "summary",
  ] as const;
  const localized = Object.fromEntries(
    fields.map((field) => [
      field,
      String(project[`${field}${suffix}`] ?? fallback?.[field] ?? project[field] ?? ""),
    ]),
  );
  if (suffix === "_en") localized.service = canonicalizeEnglishService(localized.service);
  return localized;
}

function canonicalizeEnglishService(value: string) {
  return value.replace(/\bBrand Identity\b/gi, "Visual Identity");
}
