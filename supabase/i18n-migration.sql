begin;

alter table public.project_types
  add column if not exists name_en text;

alter table public.projects
  add column if not exists title_en text,
  add column if not exists category_en text,
  add column if not exists service_en text,
  add column if not exists task_en text,
  add column if not exists solution_en text,
  add column if not exists summary_en text;

update public.project_types as destination
set name_en = source.name_en
from (values
  ('identity', 'Visual Identity'),
  ('branding', 'Branding'),
  ('logo', 'Logo Design'),
  ('art-direkshn', 'Art Direction'),
  ('art-i-graffiti', 'Art & Graffiti')
) as source(slug, name_en)
where destination.slug = source.slug;

update public.projects as destination
set title_en = source.title,
    category_en = source.category,
    service_en = source.service,
    task_en = source.task,
    solution_en = source.solution,
    summary_en = source.summary
from jsonb_to_recordset($translations$
[
  {
    "slug": "koryagin-design",
    "title": "KORYAGIN DESIGN",
    "category": "Brand design studio",
    "service": "Branding",
    "task": "Build a recognizable identity for brand designer Anton Koryagin, rooted in his graffiti background and signature approach to letterforms.",
    "solution": "I created a complete design system across a wide range of touchpoints. The concept combines contemporary typography with a custom K symbol based on the first letter of Koryagin.",
    "summary": "A complete identity for my own brand, KORYAGIN DESIGN™."
  },
  {
    "slug": "flamin-go",
    "title": "FLAMIN-GO",
    "category": "Logistics services",
    "service": "Logo Design",
    "task": "Rethink the logo of FLAMIN-GO, a logistics company from St. Petersburg, so it reflects both the name and the nature of the business more clearly. The new mark had to feel recognizable, dynamic and ready to anchor the company’s future visual identity.",
    "solution": "I combined three key images in one mark: a flamingo, a box and movement. The bird reveals the name, the box connects it to logistics and the upward composition adds momentum. The result is a coherent symbol designed to work across different touchpoints.",
    "summary": "A logo redesign for FLAMIN-GO, a logistics company from St. Petersburg. The concept combines a flamingo, a box and movement, turning the company name and service into one recognizable mark."
  },
  {
    "slug": "gsm-store",
    "title": "GSM-STORE",
    "category": "Apple retailer and service center",
    "service": "Logo Design",
    "task": "Create a concise, recognizable logo that brings the retail store and service center into one visual image. The mark had to communicate technology and trust while working confidently across digital and physical touchpoints.",
    "solution": "The mark combines the G and S from GSM-STORE with a stylized digital connection. Their fusion creates a compact monogram that conveys technology, engineering precision and the link between device sales and service.",
    "summary": "Logo design for GSM-STORE, an electronics retailer and service center. A minimal digital aesthetic builds a modern brand image based on technology, reliability and professional expertise."
  },
  {
    "slug": "pants-bands",
    "title": "PANTS BANDS",
    "category": "Clothing and accessories",
    "service": "Visual Identity",
    "task": "Create a bold, flexible identity that captures the character of PANTS BANDS and makes the brand stand out. The system had to work equally well across clothing, packaging, print and digital media.",
    "solution": "I built the identity around a gorilla as a symbol of strength, confidence and individuality, integrating the brand name into its silhouette. Several logo versions, a signature color palette and clear usage rules keep the identity recognizable in every format.",
    "summary": "A visual identity for PANTS BANDS, a clothing brand built around self-expression. The project brings together the logo, its variations, a signature palette and usage rules in one recognizable system."
  },
  {
    "slug": "saintnic",
    "title": "SAINT NIC™",
    "category": "Tobacco and vape retailer",
    "service": "Logo Design",
    "task": "Create a bold, memorable logo that helps SAINT NIC stand apart from its competitors. The mark had to stay concise, easy to recognize and equally strong across digital and physical media.",
    "solution": "I combined the S and N initials into a balanced minimal monogram. A neon green accent strengthens the contrast and gives SAINT NIC a distinct presence within the category.",
    "summary": "Logo design for SAINT NIC, a tobacco and vape retailer. The project moves away from the category’s typical visual language and builds a clean, confident image with a strong connection to its audience."
  },
  {
    "slug": "verifiq",
    "title": "VerifiQ",
    "category": "Fintech SaaS",
    "service": "Logo Design",
    "task": "Create a minimal logo with a clean wordmark and compact symbol. It had to communicate verification and secure transactions while remaining clear in interfaces, navigation and small digital formats.",
    "solution": "The symbol combines the letter V, a confirmation mark and a smooth path that suggests both a transaction route and verification. Modular geometry and a compact square form make it easy to scale and use independently from the name.",
    "summary": "Logo design for VerifiQ, a fintech SaaS platform that simplifies payouts and compliance for marketplaces and subscription services. The identity balances technology, reliability and clarity."
  },
  {
    "slug": "yellowtech",
    "title": "YellowTech Solutions",
    "category": "Solar energy",
    "service": "Logo Design",
    "task": "Create a distinctive mark that stays clear across every touchpoint, from business cards to the website. The logo had to express clean energy, technological progress and forward movement.",
    "solution": "I combined two core symbols: the sun as a source of clean energy and an incandescent bulb as a reference to traditional technology. Their fusion captures the shift toward a new energy future, while the yellow and black palette makes the mark visible and memorable.",
    "summary": "Logo design for YellowTech Solutions, a solar energy company. The concept reflects the transition from traditional technology to clean renewable energy and builds a modern, confident brand image."
  },
  {
    "slug": "aura",
    "title": "Aura Coffee Roasters",
    "category": "Specialty coffee roaster",
    "service": "Visual Identity",
    "task": "Create a complete visual image that communicates both the product and the atmosphere around fresh roasting. The identity had to feel distinctive, elegant and flexible across packaging, cups, merchandise, signage and digital media.",
    "solution": "The concept builds on the double meaning of Aura: an atmosphere and the Greek goddess of the light breeze. The mark combines her silhouette with movement, a coffee bean and a crown, while the flowing hair suggests the aroma of freshly roasted coffee. A natural palette adds warmth and a premium feel.",
    "summary": "A visual identity created from scratch for AURA COFFEE ROASTERS, a new specialty coffee brand. The system combines the logo, color, typography, packaging and brand touchpoints around the atmosphere of the coffee ritual."
  },
  {
    "slug": "lumina-glow",
    "title": "Lumina Glow",
    "category": "Cosmetics and skincare",
    "service": "Logo Design",
    "task": "Create a stylish, scalable logo that remains clear and expressive across packaging, print and digital formats.",
    "solution": "The mark combines the silhouettes of a flower, a leaf and a shuriken, a symbol of energy and youth. Strict monogram geometry and restrained typography bring out the brand’s premium character.",
    "summary": "Logo design for Lumina Glow, a cosmetics brand. A distinctive monogram and restrained typography create a modern, premium image."
  },
  {
    "slug": "slavtrad",
    "title": "SlavTrad",
    "category": "Financial market analytics",
    "service": "Visual Identity",
    "task": "Create a strict, recognizable image for an analytics brand that connects global financial markets with Slavic cultural roots and feels confident in a business environment.",
    "solution": "I built the mark from a geometric Slavic ornament assembled into a diamond-shaped monogram. A red accent, achromatic palette and bold grotesque type formed a coherent system for digital and print media.",
    "summary": "A visual identity for SlavTrad, a company that analyzes global financial markets through socionomics, Elliott Wave theory and macro analysis."
  },
  {
    "slug": "saad",
    "title": "SAAD",
    "category": "Nicotine pouches",
    "service": "Art Direction",
    "task": "Build a long-term creative partnership between KORYAGIN DESIGN™ and SAAD.",
    "solution": "I developed and supported several product lines, provided ongoing communication design for three years and helped launch a new sub-brand.",
    "summary": "Three years of art direction and design support for a nicotine pouch brand."
  },
  {
    "slug": "i-hate-mondays",
    "title": "I HATE MONDAYS",
    "category": "Graffiti art",
    "service": "Art & Graffiti",
    "task": "Turn a pencil sketch into a complete digital artwork.",
    "solution": "I created a full graffiti piece that uses bright colors to keep the mood energetic despite the gloomy message.",
    "summary": "A themed graffiti artwork built around the shared dislike of Mondays."
  },
  {
    "slug": "f-cking-problems",
    "title": "F#CKING PROBLEMS",
    "category": "Graffiti art",
    "service": "Art & Graffiti",
    "task": "Turn a pencil drawing into a complete digital project.",
    "solution": "I rebuilt the lettering as vector artwork and prepared it for print and future use on clothing.",
    "summary": "Custom F#CKING PROBLEMS lettering drawn in a signature graffiti style."
  },
  {
    "slug": "da-kosta",
    "title": "DA-KOSTA",
    "category": "Merchandise",
    "service": "Art & Graffiti",
    "task": "Create memorable lettering with soft, rounded forms for merchandise and large-screen visuals during the artist’s live performances.",
    "solution": "I created a custom graffiti piece in signature pink tones that matches the artist’s character and performance style. The artwork is prepared for print and large-screen use.",
    "summary": "A custom graffiti artwork created for DA-KOSTA merchandise."
  }
]
$translations$::jsonb) as source(
  slug text,
  title text,
  category text,
  service text,
  task text,
  solution text,
  summary text
)
where destination.slug = source.slug;

create or replace function public.sync_project_service_from_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_type_id is not null then
    select name, name_en
    into new.service, new.service_en
    from public.project_types
    where id = new.project_type_id;
  end if;

  return new;
end;
$$;

create or replace function public.sync_projects_after_type_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name
     or new.name_en is distinct from old.name_en then
    update public.projects
    set service = new.name,
        service_en = new.name_en
    where project_type_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists project_types_sync_service_name on public.project_types;
create trigger project_types_sync_service_name
after update of name, name_en
on public.project_types
for each row execute function public.sync_projects_after_type_rename();

commit;
