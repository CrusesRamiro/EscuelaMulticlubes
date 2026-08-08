-- Escuela Multiclubes - esquema nuevo
-- Reemplaza: clubes(sin cambios), alumnos, profesores, clases,
-- clase_asistencias, asistencia, evento_asistencia
-- por: clubes, alumnos, profesores, eventos, sesiones, asistencias

create extension if not exists pgcrypto;   -- para password_hash (crypt/gen_salt) y hmac()
-- El JWT de login_profesor (0002_functions.sql) se firma a mano con hmac()
-- de pgcrypto en vez de con la extensión pgjwt: pgjwt 0.2.0 tiene
-- hardcodeado `public.hmac(...)` en su código fuente, y en Supabase
-- pgcrypto vive en el schema `extensions`, no en `public` — falla out of
-- the box en cualquier proyecto Supabase estándar.

-- ============================================================
-- clubes
-- ============================================================
create table if not exists clubes (
    id          bigint generated always as identity primary key,
    nombre      text not null unique
);

-- ============================================================
-- alumnos
-- ============================================================
create table if not exists alumnos (
    id                  bigint generated always as identity primary key,
    dni                 bigint not null unique,
    nombre_completo     text not null,
    fecha_nacimiento    date not null,
    club_id             bigint references clubes (id) on delete set null,
    -- {"casco": true, "patines": false, ...} en vez de 8 columnas boolean sueltas
    equipamiento        jsonb not null default '{}'::jsonb,
    nombre_adulto       text not null,
    telefono_adulto     text not null,
    created_at          timestamptz not null default now()
);

create index if not exists idx_alumnos_club_id on alumnos (club_id);
create index if not exists idx_alumnos_nombre_completo on alumnos (nombre_completo);

-- ============================================================
-- profesores (nunca legible por REST, ver 0003_rls.sql)
-- ============================================================
create table if not exists profesores (
    id              uuid primary key default gen_random_uuid(),
    username        text not null unique,
    password_hash   text not null,
    nombre          text not null,
    activo          boolean not null default true,
    created_at      timestamptz not null default now()
);

-- ============================================================
-- eventos: la "clase semanal" es una fila mas (tipo = recurrente),
-- Torneo/Copa/etc son filas tipo = unico. Crear un evento nuevo = un INSERT.
-- ============================================================
create table if not exists eventos (
    id                          uuid primary key default gen_random_uuid(),
    slug                        text not null unique,
    nombre                      text not null,
    tipo                        text not null check (tipo in ('recurrente', 'unico')),
    -- solo aplica a tipo = recurrente. 0 = domingo, igual que extract(dow from ...)
    dia_semana                  int check (dia_semana between 0 and 6),
    hora_limite_confirmacion    time not null default '20:00',
    -- solo aplica a tipo = unico
    fecha_unica                 date,
    activo                      boolean not null default true,
    created_at                  timestamptz not null default now(),
    constraint chk_evento_recurrente_tiene_dia
        check (tipo <> 'recurrente' or dia_semana is not null)
);

-- ============================================================
-- sesiones: ocurrencia concreta (con fecha) de un evento.
-- Reemplaza "clases". Para eventos unicos, normalmente hay una sola sesion.
-- ============================================================
create table if not exists sesiones (
    id          bigint generated always as identity primary key,
    evento_id   uuid not null references eventos (id) on delete cascade,
    fecha       date not null,
    created_at  timestamptz not null default now(),
    unique (evento_id, fecha)
);

create index if not exists idx_sesiones_evento_id on sesiones (evento_id);

-- ============================================================
-- asistencias: reemplaza asistencia + clase_asistencias + evento_asistencia.
-- Una fila por (sesion, alumno). confirmacion_padre la escribe el padre
-- (sin login), asistio/pago_tipo los escribe el profesor (logueado).
-- ============================================================
create table if not exists asistencias (
    id                  bigint generated always as identity primary key,
    sesion_id           bigint not null references sesiones (id) on delete cascade,
    alumno_id           bigint not null references alumnos (id) on delete cascade,
    confirmacion_padre  boolean,                 -- null = sin confirmar
    confirmado_at       timestamptz,
    asistio             boolean,                 -- null = sin registrar por el profesor
    pago_tipo           text check (pago_tipo in ('1hs', '2hs')),
    registrado_por      uuid references profesores (id) on delete set null,
    registrado_at       timestamptz,
    unique (sesion_id, alumno_id)
);

create index if not exists idx_asistencias_sesion_id on asistencias (sesion_id);
create index if not exists idx_asistencias_alumno_id on asistencias (alumno_id);
