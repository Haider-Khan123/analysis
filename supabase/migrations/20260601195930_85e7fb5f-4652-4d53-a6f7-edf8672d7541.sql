
-- Enums
create type public.app_role as enum ('admin', 'teacher', 'parent');

-- Schools
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  school_id uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role, school_id)
);

-- Classes
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  grade_level text,
  created_at timestamptz not null default now()
);
create index on public.classes(school_id);

-- Sections
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  teacher_id uuid,
  created_at timestamptz not null default now()
);
create index on public.sections(class_id);
create index on public.sections(school_id);

-- Teachers
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.teachers(school_id);

-- Students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  section_id uuid references public.sections(id) on delete set null,
  full_name text not null,
  admission_number text,
  date_of_birth date,
  gender text,
  enrollment_date date default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.students(school_id);
create index on public.students(class_id);
create index on public.students(section_id);

-- Parents
create table public.parents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.parents(school_id);

-- Parent-Student link
create table public.parent_students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

-- Section -> teacher FK (added after teachers table exists)
alter table public.sections add constraint sections_teacher_fk
  foreign key (teacher_id) references public.teachers(id) on delete set null;

-- Section teacher assignments (a teacher can teach multiple sections)
create table public.section_teachers (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (section_id, teacher_id)
);

-- GRANTS
grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, update, delete on public.teachers to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.parents to authenticated;
grant select, insert, update, delete on public.parent_students to authenticated;
grant select, insert, update, delete on public.section_teachers to authenticated;
grant all on public.schools, public.profiles, public.user_roles, public.classes,
  public.sections, public.teachers, public.students, public.parents,
  public.parent_students, public.section_teachers to service_role;

-- has_role security definer
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Current user's school
create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;

-- Trigger: on new auth user, create profile (school created separately by admin signup flow)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.classes enable row level security;
alter table public.sections enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.parent_students enable row level security;
alter table public.section_teachers enable row level security;

-- Profiles policies
create policy "users view own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or school_id = public.current_school_id());
create policy "users update own profile" on public.profiles for update to authenticated
  using (id = auth.uid());
create policy "users insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- User roles policies (read-only to user; managed server-side)
create policy "users view own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- Schools policies
create policy "members view their school" on public.schools for select to authenticated
  using (id = public.current_school_id() or created_by = auth.uid());
create policy "any authenticated creates school" on public.schools for insert to authenticated
  with check (created_by = auth.uid());
create policy "admin updates school" on public.schools for update to authenticated
  using (id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Helper: scope to own school
-- Classes
create policy "school members view classes" on public.classes for select to authenticated
  using (school_id = public.current_school_id());
create policy "admin manages classes" on public.classes for all to authenticated
  using (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'))
  with check (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Sections
create policy "school members view sections" on public.sections for select to authenticated
  using (school_id = public.current_school_id());
create policy "admin manages sections" on public.sections for all to authenticated
  using (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'))
  with check (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Teachers
create policy "school members view teachers" on public.teachers for select to authenticated
  using (school_id = public.current_school_id());
create policy "admin manages teachers" on public.teachers for all to authenticated
  using (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'))
  with check (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Students
create policy "school members view students" on public.students for select to authenticated
  using (school_id = public.current_school_id());
create policy "admin manages students" on public.students for all to authenticated
  using (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'))
  with check (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Parents
create policy "school members view parents" on public.parents for select to authenticated
  using (school_id = public.current_school_id());
create policy "admin manages parents" on public.parents for all to authenticated
  using (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'))
  with check (school_id = public.current_school_id() and public.has_role(auth.uid(), 'admin'));

-- Parent-Students
create policy "school members view parent_students" on public.parent_students for select to authenticated
  using (exists (select 1 from public.parents p where p.id = parent_id and p.school_id = public.current_school_id()));
create policy "admin manages parent_students" on public.parent_students for all to authenticated
  using (public.has_role(auth.uid(), 'admin') and exists (select 1 from public.parents p where p.id = parent_id and p.school_id = public.current_school_id()))
  with check (public.has_role(auth.uid(), 'admin') and exists (select 1 from public.parents p where p.id = parent_id and p.school_id = public.current_school_id()));

-- Section teachers
create policy "school members view section_teachers" on public.section_teachers for select to authenticated
  using (exists (select 1 from public.sections s where s.id = section_id and s.school_id = public.current_school_id()));
create policy "admin manages section_teachers" on public.section_teachers for all to authenticated
  using (public.has_role(auth.uid(), 'admin') and exists (select 1 from public.sections s where s.id = section_id and s.school_id = public.current_school_id()))
  with check (public.has_role(auth.uid(), 'admin') and exists (select 1 from public.sections s where s.id = section_id and s.school_id = public.current_school_id()));
