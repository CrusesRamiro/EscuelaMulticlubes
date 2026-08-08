-- Funciones. Todo lo que necesita ejecutarse "sin login" (padres) vive en
-- una función SECURITY DEFINER con GRANT EXECUTE a anon, nunca en un
-- SELECT/INSERT directo a la tabla. Eso es lo que permite que:
--   - la escritura (alta de alumno, confirmar asistencia) sea libre, y
--   - la lectura de datos reales siga bloqueada por RLS salvo casos
--     puntuales y acotados (nombre de alumno para el buscador, nombre de
--     club para el <select>, nombre de evento).

-- ============================================================
-- calcular_proxima_sesion: replica getNextSunday() de js/utils.js pero
-- generalizada a cualquier día de la semana, y en timezone fija de
-- Argentina en vez de la hora del navegador del padre.
-- ============================================================
create or replace function calcular_proxima_sesion(
    p_dia_semana int,
    p_hora_limite time default '20:00'
)
returns date
language sql
stable
as $$
    select case
        -- hoy es el día del evento y todavía no pasó la hora límite -> hoy
        when extract(dow from v.ahora)::int = p_dia_semana
             and v.ahora::time < p_hora_limite
            then v.ahora::date
        -- hoy es el día del evento pero ya pasó la hora límite -> en 7 días
        when extract(dow from v.ahora)::int = p_dia_semana
             and v.ahora::time >= p_hora_limite
            then v.ahora::date + 7
        -- cualquier otro día -> la próxima ocurrencia de p_dia_semana
        else
            v.ahora::date + (((p_dia_semana - extract(dow from v.ahora)::int) + 7) % 7)
    end
    from (select now() at time zone 'America/Argentina/Buenos_Aires' as ahora) v;
$$;

-- ============================================================
-- obtener_o_crear_sesion: reemplaza fetchClaseByFecha + createClase +
-- toda la lógica de "próximo domingo" repetida en el frontend.
-- Sirve tanto para el evento recurrente (clase semanal) como para eventos
-- únicos (torneo, copa, etc: usan eventos.fecha_unica).
-- ============================================================
create or replace function obtener_o_crear_sesion(p_evento_slug text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_evento    eventos%rowtype;
    v_fecha     date;
    v_sesion_id bigint;
begin
    select * into v_evento from eventos where slug = p_evento_slug and activo = true;
    if v_evento.id is null then
        raise exception 'Evento % no existe o no está activo', p_evento_slug;
    end if;

    if v_evento.tipo = 'recurrente' then
        v_fecha := calcular_proxima_sesion(v_evento.dia_semana, v_evento.hora_limite_confirmacion);
    else
        v_fecha := coalesce(v_evento.fecha_unica, current_date);
    end if;

    select id into v_sesion_id from sesiones where evento_id = v_evento.id and fecha = v_fecha;

    if v_sesion_id is null then
        insert into sesiones (evento_id, fecha)
        values (v_evento.id, v_fecha)
        on conflict (evento_id, fecha) do update set fecha = excluded.fecha
        returning id into v_sesion_id;
    end if;

    return v_sesion_id;
end;
$$;

revoke all on function obtener_o_crear_sesion(text) from public;
grant execute on function obtener_o_crear_sesion(text) to anon, authenticated;

-- ============================================================
-- rpc_registrar_alumno: reemplaza el POST directo a /alumnos de registro.html
-- ============================================================
create or replace function rpc_registrar_alumno(
    p_dni bigint,
    p_nombre_completo text,
    p_fecha_nacimiento date,
    p_club_id bigint,
    p_equipamiento jsonb,
    p_nombre_adulto text,
    p_telefono_adulto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into alumnos (
        dni, nombre_completo, fecha_nacimiento, club_id,
        equipamiento, nombre_adulto, telefono_adulto
    ) values (
        p_dni, p_nombre_completo, p_fecha_nacimiento, p_club_id,
        coalesce(p_equipamiento, '{}'::jsonb), p_nombre_adulto, p_telefono_adulto
    );
end;
$$;

revoke all on function rpc_registrar_alumno(bigint, text, date, bigint, jsonb, text, text) from public;
grant execute on function rpc_registrar_alumno(bigint, text, date, bigint, jsonb, text, text) to anon;

-- ============================================================
-- rpc_listar_alumnos_publico: para el datalist de asistencia.html/evento.html.
-- Devuelve solo id + nombre, nunca DNI/teléfono/equipación.
-- ============================================================
create or replace function rpc_listar_alumnos_publico()
returns table (id bigint, nombre_completo text)
language sql
security definer
stable
set search_path = public
as $$
    select id, nombre_completo from alumnos order by nombre_completo asc;
$$;

revoke all on function rpc_listar_alumnos_publico() from public;
grant execute on function rpc_listar_alumnos_publico() to anon;

-- ============================================================
-- rpc_listar_clubes: para el <select> de club en registro.html.
-- ============================================================
create or replace function rpc_listar_clubes()
returns table (id bigint, nombre text)
language sql
security definer
stable
set search_path = public
as $$
    select id, nombre from clubes order by nombre asc;
$$;

revoke all on function rpc_listar_clubes() from public;
grant execute on function rpc_listar_clubes() to anon;

-- ============================================================
-- rpc_obtener_evento: reemplaza los ?id=...&nombre=... hardcodeados en las
-- URLs de index.html. evento.html pasa a pedir el slug y traer el nombre
-- real desde la base.
-- ============================================================
create or replace function rpc_obtener_evento(p_slug text)
returns table (slug text, nombre text, tipo text, activo boolean)
language sql
security definer
stable
set search_path = public
as $$
    select slug, nombre, tipo, activo from eventos where slug = p_slug and activo = true;
$$;

revoke all on function rpc_obtener_evento(text) from public;
grant execute on function rpc_obtener_evento(text) to anon;

-- ============================================================
-- rpc_confirmar_asistencia: reemplaza el POST a /asistencia y /evento_asistencia.
-- Solo toca confirmacion_padre/confirmado_at; nunca asistio/pago_tipo, esas
-- las carga el profesor logueado directo contra la tabla (ver 0003_rls.sql).
-- A diferencia de hoy, el padre puede corregir su confirmación (upsert).
-- ============================================================
create or replace function rpc_confirmar_asistencia(
    p_alumno_id bigint,
    p_evento_slug text,
    p_presente boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sesion_id bigint;
begin
    v_sesion_id := obtener_o_crear_sesion(p_evento_slug);

    insert into asistencias (sesion_id, alumno_id, confirmacion_padre, confirmado_at)
    values (v_sesion_id, p_alumno_id, p_presente, now())
    on conflict (sesion_id, alumno_id)
    do update set confirmacion_padre = excluded.confirmacion_padre,
                  confirmado_at = excluded.confirmado_at;
end;
$$;

revoke all on function rpc_confirmar_asistencia(bigint, text, boolean) from public;
grant execute on function rpc_confirmar_asistencia(bigint, text, boolean) to anon;

-- ============================================================
-- jwt_base64url: base64url (RFC 4648 §5) de un bytea, para armar el JWT
-- a mano en login_profesor. encode(..., 'base64') envuelve la salida cada
-- 76 caracteres con saltos de línea (estilo MIME) — hay que sacarlos antes
-- de sacar el padding y cambiar +/ por -_.
-- ============================================================
create or replace function jwt_base64url(data bytea)
returns text
language sql
immutable
as $$
    select replace(replace(rtrim(replace(encode(data, 'base64'), E'\n', ''), '='), '+', '-'), '/', '_');
$$;

revoke all on function jwt_base64url(bytea) from public;

-- ============================================================
-- login_profesor: reemplaza el SELECT directo a /profesores con
-- password en la URL. Valida con bcrypt (pgcrypto) y firma un JWT HS256
-- a mano (ver nota en 0001_schema.sql sobre por qué no se usa pgjwt) con
-- role=authenticated para que las policies de 0003_rls.sql lo acepten.
-- El JWT secret real del proyecto se guarda una sola vez en Supabase Vault
-- (ver supabase/README.md) — Supabase no permite `ALTER DATABASE ... SET`
-- de GUCs custom en proyectos administrados, así que Vault es el
-- mecanismo soportado para este tipo de secreto.
-- ============================================================
create or replace function login_profesor(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
    v_id            uuid;
    v_nombre        text;
    v_secret        text;
    v_header_b64    text;
    v_payload_b64   text;
    v_signing_input text;
    v_signature_b64 text;
begin
    select id, nombre into v_id, v_nombre
    from profesores
    where username = p_username
      and activo = true
      and password_hash = crypt(p_password, password_hash);

    if v_id is null then
        raise exception 'Usuario o contraseña incorrectos' using errcode = '28000';
    end if;

    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'app_jwt_secret';

    if v_secret is null then
        raise exception 'JWT secret no configurado en Vault (app_jwt_secret)';
    end if;

    v_header_b64 := jwt_base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8'));

    v_payload_b64 := jwt_base64url(convert_to(
        json_build_object(
            'role', 'authenticated',
            'sub', v_id::text,
            'nombre', v_nombre,
            'iss', 'escuela-multiclubes',
            'iat', extract(epoch from now())::int,
            'exp', extract(epoch from now())::int + 60 * 60 * 12  -- 12hs
        )::text,
        'utf8'
    ));

    v_signing_input := v_header_b64 || '.' || v_payload_b64;
    v_signature_b64 := jwt_base64url(hmac(v_signing_input, v_secret, 'sha256'));

    return v_signing_input || '.' || v_signature_b64;
end;
$$;

revoke all on function login_profesor(text, text) from public;
grant execute on function login_profesor(text, text) to anon;
