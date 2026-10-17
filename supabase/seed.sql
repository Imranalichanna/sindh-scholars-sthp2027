-- Development-only seed data. Applied by local supabase db reset when configured.
-- Do not add real student records, answer keys, or production credentials here.
insert into public.exam_categories (slug,name,description,icon,sort_order,is_published)
values
('sthp-2027','STHP 2027','Sindh Talent Hunt Program preparation and practice.','graduation-cap',1,true),
('stsp','STSP Preparation','Scholarship test preparation resources.','book-open',2,true),
('nthp','NTHP Preparation','National talent hunt and foundation preparation resources.','sparkles',3,true),
('foundation-programmes','Foundation Programmes','Build academic foundations for future study.','layers',4,true),
('university-admissions','University Admission Tests','Prepare for university entrance and direct admission tests.','school',5,true)
on conflict (slug) do update set
 name=excluded.name,
 description=excluded.description,
 icon=excluded.icon,
 sort_order=excluded.sort_order,
 is_published=excluded.is_published,
 updated_at=now();

insert into public.site_settings (key,value,is_public)
values
('academy_branding','{"name":"Sindh Scholars Academy","tagline":"Learn for Free. Practice with Purpose. Achieve More."}'::jsonb,true),
('announcement_banner','{"text":"Welcome to Sindh Scholars Academy — free preparation resources for students."}'::jsonb,true)
on conflict (key) do nothing;

insert into public.announcements (title,body,is_published)
values ('Welcome to Sindh Scholars Academy','Explore free preparation resources and check official programme requirements before applying.',false);
