"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  PORTFOLIO_IMAGE_MAX_BYTES,
  PORTFOLIO_IMAGE_MAX_LONG_EDGE,
  PORTFOLIO_IMAGE_RECOMMENDED_HEIGHT,
  PORTFOLIO_IMAGE_RECOMMENDED_WIDTH,
  PORTFOLIO_IMAGE_TYPES,
} from "../lib/portfolio-image-rules";

type Project = {
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
};

type ProjectImage = {
  id: string;
  project_id: string;
  url: string;
  alt: string;
  is_cover: boolean;
  sort: number;
};

type ProjectType = {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  sort: number;
  active: boolean;
};

type AdminData = {
  projects: Project[];
  images: ProjectImage[];
  projectTypes: ProjectType[];
};

type ProjectDraft = Omit<Project, "id" | "cover" | "images">;
type View = "projects" | "types";
type Filter = "all" | "published" | "drafts";
type EditorLanguage = "ru" | "en";

const emptyData: AdminData = { projects: [], images: [], projectTypes: [] };

const canonicalEnglishService = (value: string | null | undefined) =>
  (value ?? "").replace(/\bBrand Identity\b/gi, "Visual Identity");

const emptyDraft = (sort: number, type?: ProjectType): ProjectDraft => ({
  slug: "",
  title: "",
  title_en: "",
  category: "",
  category_en: "",
  service: type?.name ?? "",
  service_en: canonicalEnglishService(type?.name_en),
  year: String(new Date().getFullYear()),
  task: "",
  task_en: "",
  solution: "",
  solution_en: "",
  summary: "",
  summary_en: "",
  behance: "",
  featured: false,
  hero: false,
  published: false,
  in_portfolio: true,
  sort,
  project_type_id: type?.id ?? null,
});

export function AdminPanel({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [view, setView] = useState<View>("projects");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorLanguage, setEditorLanguage] = useState<EditorLanguage>("ru");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyDraft(1));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<null | {
    title: string;
    text: string;
    action: () => Promise<void>;
  }>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeNameEn, setNewTypeNameEn] = useState("");
  const [typeEditing, setTypeEditing] = useState<Record<string, string>>({});
  const [typeEditingEn, setTypeEditingEn] = useState<Record<string, string>>({});

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/portfolio-admin", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = await readAdminResponse(response);
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить данные");
      setData(result as AdminData);
      return result as AdminData;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Неизвестная ошибка");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the protected server API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditorOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("admin-lock-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("admin-lock-scroll");
    };
  }, [editorOpen]);

  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.projects.filter((project) => {
      if (filter === "published" && !project.published) return false;
      if (filter === "drafts" && project.published) return false;
      if (!needle) return true;
      return [project.title, project.service, project.category, project.year]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data.projects, filter, query]);

  const currentImages = useMemo(
    () =>
      editingId
        ? data.images
            .filter((image) => image.project_id === editingId)
            .sort((a, b) => a.sort - b.sort)
        : [],
    [data.images, editingId],
  );

  function openNewProject() {
    const firstType = data.projectTypes.find((type) => type.active);
    setEditingId(null);
    setDraft(emptyDraft(data.projects.length + 1, firstType));
    setEditorLanguage("ru");
    setEditorOpen(true);
  }

  function openProject(project: Project) {
    setEditingId(project.id);
    setDraft({
      slug: project.slug,
      title: project.title,
      title_en: project.title_en ?? "",
      category: project.category ?? "",
      category_en: project.category_en ?? "",
      service: project.service ?? "",
      service_en: project.service_en ?? "",
      year: project.year ?? "",
      task: project.task ?? "",
      task_en: project.task_en ?? "",
      solution: project.solution ?? "",
      solution_en: project.solution_en ?? "",
      summary: project.summary ?? "",
      summary_en: project.summary_en ?? "",
      behance: project.behance ?? "",
      featured: project.featured,
      hero: project.hero,
      published: project.published,
      in_portfolio: project.in_portfolio,
      sort: project.sort,
      project_type_id: project.project_type_id,
    });
    setEditorLanguage("ru");
    setEditorOpen(true);
  }

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateTitle(value: string) {
    setDraft((current) => ({
      ...current,
      title: value,
      slug: editingId || current.slug ? current.slug : slugify(value),
    }));
  }

  async function mutate(body: Record<string, unknown>) {
    const response = await fetch("/api/portfolio-command", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
      },
      body: new TextEncoder().encode(JSON.stringify(body)),
    });
    const result = await readAdminResponse(response);
    if (!response.ok) throw new Error(result.error || "Операция не выполнена");
    return result;
  }

  async function saveProject() {
    if (!draft.title.trim()) {
      showToast("Добавь название проекта");
      return;
    }
    if (!draft.slug.trim()) {
      showToast("Добавь адрес проекта");
      return;
    }

    setSaving(true);
    try {
      const type = data.projectTypes.find((item) => item.id === draft.project_type_id);
      const project = {
        ...draft,
        service: type?.name ?? draft.service,
        service_en: canonicalEnglishService(type?.name_en ?? draft.service_en),
      };
      const result = await mutate({
        action: editingId ? "updateProject" : "createProject",
        id: editingId,
        project,
      });
      const savedId = result.project.id as string;
      setEditingId(savedId);
      await loadData();
      showToast(editingId ? "Изменения сохранены" : "Проект создан - теперь можно добавить фото");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось сохранить проект");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentProject() {
    if (!editingId) return;
    setConfirm({
      title: "Удалить проект?",
      text: "Карточка, фотографии и данные проекта исчезнут с сайта. Это действие нельзя отменить.",
      action: async () => {
        await mutate({ action: "deleteProject", id: editingId });
        setEditorOpen(false);
        setEditingId(null);
        await loadData();
        showToast("Проект удалён");
      },
    });
  }

  async function moveProject(project: Project, direction: -1 | 1) {
    const ordered = [...data.projects].sort((a, b) => a.sort - b.sort);
    const index = ordered.findIndex((item) => item.id === project.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setData((current) => ({ ...current, projects: ordered.map((item, i) => ({ ...item, sort: i + 1 })) }));
    try {
      await mutate({ action: "reorderProjects", ids: ordered.map((item) => item.id) });
      showToast("Порядок проектов обновлён");
    } catch (error) {
      await loadData();
      showToast(error instanceof Error ? error.message : "Не удалось изменить порядок");
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editingId) return;

    if (!PORTFOLIO_IMAGE_TYPES.includes(file.type as (typeof PORTFOLIO_IMAGE_TYPES)[number])) {
      showToast("Поддерживаются только JPG, PNG, WebP и AVIF");
      return;
    }
    if (file.size > PORTFOLIO_IMAGE_MAX_BYTES) {
      showToast(`Файл весит ${formatMegabytes(file.size)}. Максимум - 8 МБ`);
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      if (Math.max(dimensions.width, dimensions.height) > PORTFOLIO_IMAGE_MAX_LONG_EDGE) {
        showToast(
          `Слишком большое разрешение: ${dimensions.width}×${dimensions.height} px. Максимум - 3840 px по длинной стороне`,
        );
        return;
      }
    } catch {
      showToast("Не удалось прочитать изображение. Пересохрани файл и попробуй снова");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("action", "uploadImage");
      form.set("projectId", editingId);
      form.set("alt", draft.title);
      form.set("file", file);
      const response = await fetch("/api/portfolio-media", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        body: form,
      });
      const result = await readAdminResponse(response);
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить фото");
      await loadData();
      showToast("Фотография загружена");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  }

  async function setCover(image: ProjectImage) {
    try {
      await mutate({ action: "updateImage", id: image.id, image: { is_cover: true } });
      await loadData();
      showToast("Главная обложка изменена");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось выбрать обложку");
    }
  }

  function requestDeleteImage(image: ProjectImage) {
    setConfirm({
      title: "Удалить фотографию?",
      text: image.is_cover
        ? "Главной станет следующая фотография проекта."
        : "Фотография будет удалена из проекта.",
      action: async () => {
        await mutate({ action: "deleteImage", id: image.id });
        await loadData();
        showToast("Фотография удалена");
      },
    });
  }

  async function moveImage(image: ProjectImage, direction: -1 | 1) {
    const ordered = [...currentImages];
    const index = ordered.findIndex((item) => item.id === image.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await Promise.all(
        ordered.map((item, itemIndex) =>
          mutate({ action: "updateImage", id: item.id, image: { sort: itemIndex } }),
        ),
      );
      await loadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось изменить порядок фото");
    }
  }

  async function addType() {
    const name = newTypeName.trim();
    if (!name) return;
    try {
      await mutate({
        action: "createType",
        projectType: {
          name,
          name_en: canonicalEnglishService(newTypeNameEn.trim()),
          sort: data.projectTypes.length + 1,
          active: true,
        },
      });
      setNewTypeName("");
      setNewTypeNameEn("");
      await loadData();
      showToast("Тип проекта добавлен");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось добавить тип");
    }
  }

  async function saveType(type: ProjectType) {
    const name = (typeEditing[type.id] ?? type.name).trim();
    const nameEn = canonicalEnglishService(typeEditingEn[type.id] ?? type.name_en).trim();
    if (!name || (name === type.name && nameEn === (type.name_en ?? ""))) {
      setTypeEditing((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      setTypeEditingEn((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      return;
    }
    try {
      await mutate({
        action: "updateType",
        id: type.id,
        projectType: { name, name_en: nameEn },
      });
      await loadData();
      setTypeEditing((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      setTypeEditingEn((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      showToast("Название обновлено");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось изменить тип");
    }
  }

  async function toggleType(type: ProjectType) {
    try {
      await mutate({
        action: "updateType",
        id: type.id,
        projectType: { active: !type.active },
      });
      await loadData();
      showToast(type.active ? "Тип скрыт из фильтров" : "Тип включён");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось изменить тип");
    }
  }

  function requestDeleteType(type: ProjectType) {
    setConfirm({
      title: `Удалить «${type.name}»?`,
      text: "Если этот тип используется в проектах, сначала выбери для них другой тип. Вместо удаления его можно просто выключить.",
      action: async () => {
        await mutate({ action: "deleteType", id: type.id });
        await loadData();
        showToast("Тип проекта удалён");
      },
    });
  }

  async function moveType(type: ProjectType, direction: -1 | 1) {
    const ordered = [...data.projectTypes].sort((a, b) => a.sort - b.sort);
    const index = ordered.findIndex((item) => item.id === type.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setData((current) => ({ ...current, projectTypes: ordered.map((item, i) => ({ ...item, sort: i + 1 })) }));
    try {
      await mutate({ action: "reorderTypes", ids: ordered.map((item) => item.id) });
      showToast("Порядок фильтров обновлён");
    } catch (error) {
      await loadData();
      showToast(error instanceof Error ? error.message : "Не удалось изменить порядок");
    }
  }

  const publishedCount = data.projects.filter((project) => project.published).length;
  const featuredCount = data.projects.filter((project) => project.featured).length;
  const heroCount = data.projects.filter((project) => project.hero).length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/assets/logos/logo-monogram-bone-plain.svg" alt="" />
          <strong>ПАНЕЛЬ<br />УПРАВЛЕНИЯ</strong>
        </div>

        <nav className="admin-nav" aria-label="Разделы панели">
          <button className={view === "projects" ? "is-active" : ""} onClick={() => setView("projects")}>
            <Icon name="grid" />
            Проекты
            <span>{data.projects.length}</span>
          </button>
          <button className={view === "types" ? "is-active" : ""} onClick={() => setView("types")}>
            <Icon name="filter" />
            Типы проектов
            <span>{data.projectTypes.length}</span>
          </button>
        </nav>

        <div className="admin-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            <Icon name="external" />
            Открыть сайт
          </a>
          <div className="admin-user">
            <div>{initials(userName)}</div>
            <span><strong>{userName}</strong><small>{userEmail}</small></span>
          </div>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <span className="admin-eyebrow">КОРЯГИН ДИЗАЙН™ / ADMIN</span>
            <h1>{view === "projects" ? "Управление проектами" : "Типы проектов"}</h1>
          </div>
          {view === "projects" && (
            <button className="admin-primary-button" onClick={openNewProject}>
              <Icon name="plus" />
              Добавить проект
            </button>
          )}
        </header>

        {view === "projects" ? (
          <>
            <div className="admin-stats">
              <Stat label="Всего проектов" value={data.projects.length} />
              <Stat label="Опубликовано" value={publishedCount} accent />
              <Stat label="На первом экране" value={heroCount} />
              <Stat label="В избранных" value={featuredCount} />
            </div>

            <div className="admin-toolbar">
              <label className="admin-search">
                <Icon name="search" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти проект" />
              </label>
              <div className="admin-segmented" aria-label="Фильтр публикации">
                {(["all", "published", "drafts"] as Filter[]).map((item) => (
                  <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
                    {item === "all" ? "Все" : item === "published" ? "На сайте" : "Черновики"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <LoadingState />
            ) : loadError ? (
              <ErrorState message={loadError} onRetry={loadData} />
            ) : projects.length ? (
              <div className="admin-project-list">
                {projects.map((project, index) => (
                  <article className="admin-project-row" key={project.id}>
                    <div className="admin-project-order">
                      <button disabled={index === 0 && !query && filter === "all"} onClick={() => moveProject(project, -1)} aria-label="Поднять проект">↑</button>
                      <span>{String(project.sort).padStart(2, "0")}</span>
                      <button disabled={index === projects.length - 1 && !query && filter === "all"} onClick={() => moveProject(project, 1)} aria-label="Опустить проект">↓</button>
                    </div>
                    <button className="admin-project-preview" onClick={() => openProject(project)} aria-label={`Редактировать ${project.title}`}>
                      {project.cover ? <img src={project.cover} alt="" /> : <img className="is-placeholder" src="/assets/logos/logo-monogram-bone-plain.svg" alt="" />}
                    </button>
                    <button className="admin-project-main" onClick={() => openProject(project)}>
                      <strong>{project.title}</strong>
                      <span>{[project.service, project.year].filter(Boolean).join(" · ") || "Характеристики не заполнены"}</span>
                    </button>
                    <div className="admin-project-places">
                      {project.hero && <Badge>Слайдер</Badge>}
                      {project.featured && <Badge>Избранные</Badge>}
                      {project.in_portfolio && <Badge>Портфолио</Badge>}
                    </div>
                    <span className={`admin-status ${project.published ? "is-live" : ""}`}>
                      <i />{project.published ? "На сайте" : "Черновик"}
                    </span>
                    <button className="admin-icon-button" onClick={() => openProject(project)} aria-label={`Редактировать ${project.title}`}>
                      <Icon name="edit" />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState onCreate={openNewProject} />
            )}
          </>
        ) : (
          <section className="admin-types-section">
            <div className="admin-types-intro">
              <div><h2>Фильтры портфолио</h2><p>Эти пункты посетитель видит над проектами. Меняй порядок стрелками, временно скрывай или удаляй неиспользуемые.</p></div>
              <div className="admin-add-type">
                <input value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addType()} placeholder="Название на русском" />
                <input value={newTypeNameEn} onChange={(event) => setNewTypeNameEn(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addType()} placeholder="Name in English" />
                <button onClick={() => void addType()}><Icon name="plus" />Добавить</button>
              </div>
            </div>

            {loading ? <LoadingState /> : loadError ? <ErrorState message={loadError} onRetry={loadData} /> : (
              <div className="admin-type-list">
                {data.projectTypes.map((type, index) => {
                  const count = data.projects.filter((project) => project.project_type_id === type.id).length;
                  return (
                    <article className={`admin-type-row ${type.active ? "" : "is-inactive"}`} key={type.id}>
                      <div className="admin-project-order">
                        <button disabled={index === 0} onClick={() => moveType(type, -1)} aria-label="Поднять тип">↑</button>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <button disabled={index === data.projectTypes.length - 1} onClick={() => moveType(type, 1)} aria-label="Опустить тип">↓</button>
                      </div>
                      <div className="admin-type-name">
                        <input value={typeEditing[type.id] ?? type.name} onChange={(event) => setTypeEditing((current) => ({ ...current, [type.id]: event.target.value }))} onBlur={() => void saveType(type)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
                        <input lang="en" value={typeEditingEn[type.id] ?? canonicalEnglishService(type.name_en)} onChange={(event) => setTypeEditingEn((current) => ({ ...current, [type.id]: event.target.value }))} onBlur={() => void saveType(type)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} placeholder="Name in English" />
                        <span>{count} {declension(count, "проект", "проекта", "проектов")}</span>
                      </div>
                      <label className="admin-switch-row compact">
                        <span>{type.active ? "Показывается" : "Скрыт"}</span>
                        <input type="checkbox" checked={type.active} onChange={() => void toggleType(type)} />
                        <i />
                      </label>
                      <button className="admin-icon-button danger" onClick={() => requestDeleteType(type)} aria-label={`Удалить ${type.name}`}><Icon name="trash" /></button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>

      {editorOpen && (
        <div className="admin-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditorOpen(false)}>
          <section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="admin-editor-title">
            <header className="admin-editor-header">
              <div><span>{editingId ? "РЕДАКТИРОВАНИЕ КЕЙСА" : "НОВЫЙ КЕЙС"}</span><h2 id="admin-editor-title">{draft.title || "Без названия"}</h2></div>
              <div className="admin-editor-header-actions">
                <div className="admin-language-tabs" role="group" aria-label="Язык содержимого кейса">
                  <button aria-pressed={editorLanguage === "ru"} className={editorLanguage === "ru" ? "is-active" : ""} onClick={() => setEditorLanguage("ru")} type="button">РУССКАЯ ВЕРСИЯ</button>
                  <button aria-pressed={editorLanguage === "en"} className={editorLanguage === "en" ? "is-active" : ""} onClick={() => setEditorLanguage("en")} type="button">ENGLISH VERSION</button>
                </div>
                <button className="admin-editor-close" onClick={() => setEditorOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
              </div>
            </header>

            <div className="admin-editor-body">
              <div className="admin-language-notice">
                <strong>{editorLanguage === "ru" ? "Русская версия кейса" : "English case content"}</strong>
                <span>{editorLanguage === "ru" ? "Переключись на English version, чтобы заполнить английский текст этого же проекта." : "Fill in the English title, category, description, challenge and solution for this project."}</span>
              </div>
              <EditorSection number="01" title="Основная информация">
                <div className="admin-form-grid two">
                  {editorLanguage === "ru" ? (
                    <Field label="Название проекта" required><input value={draft.title} onChange={(event) => updateTitle(event.target.value)} placeholder="Например, Aura Coffee Roasters" /></Field>
                  ) : (
                    <Field label="Project title (EN)"><input lang="en" value={draft.title_en ?? ""} onChange={(event) => updateDraft("title_en", event.target.value)} placeholder="Aura Coffee Roasters" /></Field>
                  )}
                  <Field label="Адрес страницы" hint="Латиницей, без пробелов"><div className="admin-slug-input"><span>/portfolio/</span><input value={draft.slug} onChange={(event) => updateDraft("slug", slugify(event.target.value))} placeholder="aura-coffee" /></div></Field>
                  <Field label="Тип проекта"><select className="admin-select" value={draft.project_type_id ?? ""} onChange={(event) => { const type = data.projectTypes.find((item) => item.id === event.target.value); updateDraft("project_type_id", event.target.value || null); if (type) { updateDraft("service", type.name); updateDraft("service_en", canonicalEnglishService(type.name_en)); } }}><option value="">Без типа</option>{data.projectTypes.map((type) => <option key={type.id} value={type.id}>{editorLanguage === "en" ? canonicalEnglishService(type.name_en) || type.name : type.name}{type.active ? "" : " (скрыт)"}</option>)}</select></Field>
                  <Field label="Год"><input value={draft.year ?? ""} onChange={(event) => updateDraft("year", event.target.value)} inputMode="numeric" placeholder="2026" /></Field>
                  {editorLanguage === "ru" ? (
                    <>
                      <Field label="Категория / сфера" wide><input value={draft.category ?? ""} onChange={(event) => updateDraft("category", event.target.value)} placeholder="Кофейня и обжарка" /></Field>
                      <Field label="Короткое описание" wide hint="Показывается в превью проекта"><textarea rows={3} value={draft.summary ?? ""} onChange={(event) => updateDraft("summary", event.target.value)} placeholder="Коротко о том, что было сделано" /></Field>
                    </>
                  ) : (
                    <>
                      <Field label="Category / industry (EN)" wide><input lang="en" value={draft.category_en ?? ""} onChange={(event) => updateDraft("category_en", event.target.value)} placeholder="Specialty coffee roaster" /></Field>
                      <Field label="Short description (EN)" wide hint="Shown in the English project preview"><textarea lang="en" rows={3} value={draft.summary_en ?? ""} onChange={(event) => updateDraft("summary_en", event.target.value)} placeholder="A short summary of the project" /></Field>
                    </>
                  )}
                </div>
              </EditorSection>

              <EditorSection number="02" title="Фотографии" subtitle="До четырёх изображений. Главная фотография станет обложкой во всех списках.">
                <div className="admin-image-guidance" aria-label="Требования к фотографиям">
                  <div>
                    <span>Рекомендуется</span>
                    <strong>
                      WebP · {PORTFOLIO_IMAGE_RECOMMENDED_WIDTH}×{PORTFOLIO_IMAGE_RECOMMENDED_HEIGHT} px · до 1 МБ
                    </strong>
                  </div>
                  <div>
                    <span>Максимум</span>
                    <strong>8 МБ · 3840 px по длинной стороне</strong>
                  </div>
                  <div>
                    <span>Форматы</span>
                    <strong>JPG, PNG, WebP, AVIF</strong>
                  </div>
                </div>
                <div className="admin-image-grid">
                  {Array.from({ length: 4 }).map((_, index) => {
                    const image = currentImages[index];
                    return image ? (
                      <div className={`admin-image-slot has-image ${image.is_cover ? "is-cover" : ""}`} key={image.id}>
                        <img src={image.url} alt={image.alt || draft.title} />
                        {image.is_cover && <span className="admin-cover-label">Обложка проекта</span>}
                        <div className="admin-image-actions">
                          {!image.is_cover && <button onClick={() => void setCover(image)}>На обложку</button>}
                          <button onClick={() => void moveImage(image, -1)} disabled={index === 0} aria-label="Сдвинуть фото влево">←</button>
                          <button onClick={() => void moveImage(image, 1)} disabled={index === currentImages.length - 1} aria-label="Сдвинуть фото вправо">→</button>
                          <button className="danger" onClick={() => requestDeleteImage(image)} aria-label="Удалить фото"><Icon name="trash" /></button>
                        </div>
                      </div>
                    ) : (
                      <label className={`admin-image-slot empty ${!editingId || uploading ? "is-disabled" : ""}`} key={index}>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!editingId || uploading} onChange={uploadImage} />
                        <Icon name="image" />
                        <strong>{uploading ? "Загрузка..." : "Добавить фото"}</strong>
                        <span>{editingId ? "WebP или JPG · до 8 МБ" : "Сначала сохрани проект"}</span>
                      </label>
                    );
                  })}
                </div>
              </EditorSection>

              <EditorSection number="03" title="Описание кейса">
                <div className="admin-form-grid two">
                  {editorLanguage === "ru" ? (
                    <>
                      <Field label="Задача"><textarea rows={6} value={draft.task ?? ""} onChange={(event) => updateDraft("task", event.target.value)} placeholder="Какую задачу поставил клиент" /></Field>
                      <Field label="Решение"><textarea rows={6} value={draft.solution ?? ""} onChange={(event) => updateDraft("solution", event.target.value)} placeholder="Как ты решил задачу" /></Field>
                    </>
                  ) : (
                    <>
                      <Field label="Challenge (EN)"><textarea lang="en" rows={6} value={draft.task_en ?? ""} onChange={(event) => updateDraft("task_en", event.target.value)} placeholder="What the client needed" /></Field>
                      <Field label="Solution (EN)"><textarea lang="en" rows={6} value={draft.solution_en ?? ""} onChange={(event) => updateDraft("solution_en", event.target.value)} placeholder="How the challenge was solved" /></Field>
                    </>
                  )}
                  <Field label="Ссылка на Behance" wide hint="Если оставить поле пустым, кнопки в карточке не будет"><input value={draft.behance ?? ""} onChange={(event) => updateDraft("behance", event.target.value)} placeholder="https://www.behance.net/gallery/..." inputMode="url" /></Field>
                </div>
              </EditorSection>

              <EditorSection number="04" title="Где показывать проект" subtitle="Можно включить проект сразу во всех трёх местах.">
                <div className="admin-placement-grid">
                  <Switch title="Слайдер первого экрана" text="Большая обложка на старте сайта" checked={draft.hero} onChange={(value) => updateDraft("hero", value)} />
                  <Switch title="Избранные на главной" text="Блок лучших работ ниже по странице" checked={draft.featured} onChange={(value) => updateDraft("featured", value)} />
                  <Switch title="Портфолио" text="Общий список всех проектов" checked={draft.in_portfolio} onChange={(value) => updateDraft("in_portfolio", value)} />
                </div>
                <div className="admin-publish-control">
                  <Switch title="Опубликовать на сайте" text="Главный переключатель видимости проекта" checked={draft.published} onChange={(value) => updateDraft("published", value)} accent />
                </div>
              </EditorSection>
            </div>

            <footer className="admin-editor-footer">
              <div>{editingId && <button className="admin-delete-button" onClick={() => void deleteCurrentProject()}><Icon name="trash" />Удалить проект</button>}</div>
              <div className="admin-editor-footer-actions"><button className="admin-secondary-button" onClick={() => setEditorOpen(false)}>Закрыть</button><button className="admin-primary-button" disabled={saving} onClick={() => void saveProject()}>{saving ? "Сохраняю..." : editingId ? "Сохранить изменения" : "Создать проект"}</button></div>
            </footer>
          </section>
        </div>
      )}

      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} onCancel={() => setConfirm(null)} onConfirm={async () => { try { await confirm.action(); setConfirm(null); } catch (error) { setConfirm(null); showToast(error instanceof Error ? error.message : "Операция не выполнена"); } }} />}
      {toast && <div className="admin-toast"><i /><span>{toast}</span></div>}
    </main>
  );
}

async function readAdminResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    const blocked = /you have been blocked|unable to access chatgpt\.site|cloudflare/i.test(text);
    if (response.status === 413 || /payload too large/i.test(text)) {
      throw new Error("Файл слишком большой. Максимальный размер - 8 МБ");
    }
    if (blocked) {
      throw new Error(
        "Защита хостинга временно заблокировала запрос. Не повторяй действие сразу - подожди несколько минут и обнови страницу.",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Сессия панели завершилась. Обнови страницу и войди снова.");
    }
    throw new Error(
      `Сервер админки вернул некорректный ответ${response.status ? ` (${response.status})` : ""}. Обнови страницу и повтори действие.`,
    );
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Сервер админки вернул повреждённые данные. Повтори действие.");
  }
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    image.src = url;
  });
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`admin-stat ${accent ? "is-accent" : ""}`}><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong></div>;
}

function Badge({ children }: { children: string }) {
  return <span className="admin-badge">{children}</span>;
}

function Field({ label, hint, required, wide, children }: { label: string; hint?: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return <label className={`admin-field ${wide ? "is-wide" : ""}`}><span>{label}{required && <b>*</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function EditorSection({ number, title, subtitle, children }: { number: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="admin-editor-section"><header><span>{number}</span><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></header>{children}</section>;
}

function Switch({ title, text, checked, onChange, accent = false }: { title: string; text: string; checked: boolean; onChange: (value: boolean) => void; accent?: boolean }) {
  return <label className={`admin-placement ${checked ? "is-checked" : ""} ${accent ? "is-accent" : ""}`}><div><strong>{title}</strong><span>{text}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function ConfirmDialog({ title, text, onCancel, onConfirm }: { title: string; text: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <div className="admin-confirm-backdrop"><section className="admin-confirm" role="alertdialog" aria-modal="true"><div className="admin-confirm-icon"><Icon name="trash" /></div><h2>{title}</h2><p>{text}</p><div><button className="admin-secondary-button" onClick={onCancel} disabled={busy}>Отмена</button><button className="admin-danger-button" disabled={busy} onClick={() => { setBusy(true); void onConfirm(); }}>{busy ? "Выполняю..." : "Подтвердить"}</button></div></section></div>;
}

function LoadingState() {
  return <div className="admin-loading">{Array.from({ length: 4 }).map((_, index) => <span key={index} />)}</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => Promise<AdminData | null> }) {
  return <div className="admin-error"><Icon name="alert" /><h2>Не удалось открыть данные</h2><p>{message}</p><button onClick={() => void onRetry()}>Попробовать снова</button></div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="admin-empty"><img src="/assets/logos/logo-monogram-bone-plain.svg" alt="" /><h2>Проекты не найдены</h2><p>Сбрось поиск или создай новый кейс.</p><button onClick={onCreate}><Icon name="plus" />Добавить проект</button></div>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
    alert: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v5M12 17h.01"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function slugify(value: string) {
  const map: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return value.toLowerCase().split("").map((character) => map[character] ?? character).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "АК";
}

function declension(number: number, one: string, two: string, five: string) {
  const tens = number % 100;
  const units = number % 10;
  if (tens > 10 && tens < 20) return five;
  if (units === 1) return one;
  if (units > 1 && units < 5) return two;
  return five;
}
