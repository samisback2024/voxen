-- ════════════════════════════════════════════════════════════
-- ORBIT THREAD · Database Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ════════════════════════════════════════════════════════════

-- 1. PROFILES (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  handle text unique not null,
  initials text not null default '',
  avatar_color text not null default 'linear-gradient(135deg,#E8845A,#C4624A)',
  bio text default '',
  topics text[] default '{}',
  is_verified boolean default false,
  sub_plan text default null,  -- 'monthly' | 'yearly' | null
  profile_public boolean default true,
  show_status boolean default true,
  allow_connect boolean default true,
  email_notifs boolean default true,
  status text default 'online',  -- online | idle | dnd | offline
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- 2. ROOMS (circles)
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text default '',
  type text not null default 'public' check (type in ('public','private')),
  creator_id uuid references public.profiles(id) on delete cascade not null,
  member_limit int default 50,
  schedule_date text default null,
  schedule_time text default null,
  pinned_conclusion text default null,
  pinned_by uuid references public.profiles(id) default null,
  created_at timestamptz default now()
);

-- 3. ROOM MEMBERS
create table public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member' check (role in ('owner','member')),
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

-- 4. MESSAGES
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  reply_to uuid references public.messages(id) on delete set null default null,
  reactions text[] default '{}',
  created_at timestamptz default now()
);

-- 5. CONNECTIONS
create table public.connections (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  unique(sender_id, receiver_id)
);

-- 6. NOTIFICATIONS
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  text text not null,
  type text default 'system',
  is_read boolean default false,
  meta jsonb default null,
  created_at timestamptz default now()
);

-- 7. DAILY ROOM CREATION TRACKING (for 5/day limit)
create table public.room_creations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════
create index idx_messages_room on public.messages(room_id, created_at);
create index idx_room_members_user on public.room_members(user_id);
create index idx_notifications_user on public.notifications(user_id, created_at desc);
create index idx_connections_receiver on public.connections(receiver_id);
create index idx_room_creations_user on public.room_creations(user_id, created_at);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.connections enable row level security;
alter table public.notifications enable row level security;
alter table public.room_creations enable row level security;

-- PROFILES: anyone can read public profiles, users can update their own
create policy "Public profiles are viewable" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- ROOMS: anyone can read public rooms; private rooms visible to members
create policy "Public rooms viewable" on public.rooms for select using (
  type = 'public' or creator_id = auth.uid() or
  exists (select 1 from public.room_members where room_id = id and user_id = auth.uid())
);
create policy "Auth users create rooms" on public.rooms for insert with check (auth.uid() = creator_id);
create policy "Owners update rooms" on public.rooms for update using (creator_id = auth.uid());
create policy "Owners delete rooms" on public.rooms for delete using (creator_id = auth.uid());

-- ROOM MEMBERS
create policy "Members visible" on public.room_members for select using (true);
create policy "Join room" on public.room_members for insert with check (auth.uid() = user_id);
create policy "Leave room" on public.room_members for delete using (auth.uid() = user_id);

-- MESSAGES: readable by room members of public rooms; writable by auth users
create policy "Read messages" on public.messages for select using (
  exists (select 1 from public.rooms where id = room_id and (type = 'public' or creator_id = auth.uid()))
  or exists (select 1 from public.room_members where room_id = messages.room_id and user_id = auth.uid())
);
create policy "Send messages" on public.messages for insert with check (auth.uid() = author_id);
create policy "Edit own messages" on public.messages for update using (auth.uid() = author_id);

-- CONNECTIONS
create policy "View own connections" on public.connections for select using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "Send connection" on public.connections for insert with check (auth.uid() = sender_id);
create policy "Update connection" on public.connections for update using (receiver_id = auth.uid() or sender_id = auth.uid());

-- NOTIFICATIONS
create policy "View own notifs" on public.notifications for select using (user_id = auth.uid());
create policy "Insert notifs" on public.notifications for insert with check (true);
create policy "Update own notifs" on public.notifications for update using (user_id = auth.uid());

-- ROOM CREATIONS
create policy "View own creations" on public.room_creations for select using (user_id = auth.uid());
create policy "Track creation" on public.room_creations for insert with check (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════
-- FUNCTION: Auto-create profile on signup
-- ════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, handle, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    '@' || lower(replace(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), ' ', '')),
    upper(left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 2))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: run on every new signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════
-- REALTIME: Enable for messages, notifications, connections
-- ════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.connections;
