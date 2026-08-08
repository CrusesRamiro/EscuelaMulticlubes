-- Row Level Security. Regla general del proyecto:
--   - anon (padres, sin login) NUNCA puede leer ni escribir una tabla
--     directo por REST. Solo puede llamar a las funciones rpc_*/login_profesor
--     de 0002_functions.sql (que son SECURITY DEFINER, del dueño de las
--     tablas, y por lo tanto no están sujetas a estas policies).
--   - authenticated (profesor con el JWT que devuelve login_profesor) puede
--     leer todo, y puede escribir asistio/pago_tipo/eliminar clase, que es
--     lo único que hace hoy profesores.html directo contra las tablas.
--
-- Las policies usan la cláusula `TO authenticated` (rol real de Postgres
-- que asigna PostgREST a partir del claim "role" del JWT) en vez del
-- helper `auth.role() = 'authenticated'`. Supabase marcó ese helper como
-- deprecado: además de eso, falla silenciosamente si el proyecto tiene
-- anonymous sign-ins habilitado, porque esos usuarios anónimos también
-- llevan el rol Postgres "authenticated". `TO authenticated` no tiene ese
-- problema porque valida el rol real de la conexión, no un claim del JWT.
-- No agregamos un predicado de "dueño" (auth.uid() = ...) en el USING
-- porque en esta app todos los profesores logueados deben ver los mismos
-- datos (no hay aislamiento por profesor) — no es el caso de BOLA/IDOR que
-- ese patrón previene.
--
-- IMPORTANTE: esto asume que estas migraciones se corren como el rol dueño
-- de las tablas (normalmente 'postgres' via SQL editor / CLI), igual que
-- las funciones SECURITY DEFINER de 0002 — así el dueño (y por lo tanto las
-- funciones) queda exento de RLS por default sin necesitar
-- FORCE ROW LEVEL SECURITY ni BYPASSRLS explícito.

-- Nos aseguramos de partir de cero: ni anon ni authenticated tienen nada
-- salvo lo que otorgamos explícitamente más abajo.
revoke all on all tables in schema public from anon, authenticated;

-- ============================================================
-- clubes
-- ============================================================
alter table clubes enable row level security;

grant select on clubes to authenticated;

create policy clubes_select_authenticated on clubes
    for select
    to authenticated
    using (true);

-- ============================================================
-- alumnos
-- ============================================================
alter table alumnos enable row level security;

grant select on alumnos to authenticated;

create policy alumnos_select_authenticated on alumnos
    for select
    to authenticated
    using (true);

-- Sin policy de insert/update/delete: la única escritura es
-- rpc_registrar_alumno (SECURITY DEFINER), ni anon ni authenticated
-- pueden escribir la tabla directo.

-- ============================================================
-- profesores: cero acceso por REST, para nadie, nunca.
-- Solo la tocan login_profesor() (lectura) y un INSERT manual desde el
-- SQL editor para dar de alta profesores (ver supabase/README.md).
-- ============================================================
alter table profesores enable row level security;
-- Sin ninguna policy: RLS habilitado + 0 policies = 0 filas visibles
-- para cualquier rol que no sea el dueño de la tabla.

-- ============================================================
-- eventos
-- ============================================================
alter table eventos enable row level security;

grant select on eventos to authenticated;

create policy eventos_select_authenticated on eventos
    for select
    to authenticated
    using (true);

-- ============================================================
-- sesiones
-- ============================================================
alter table sesiones enable row level security;

grant select, delete on sesiones to authenticated;

create policy sesiones_select_authenticated on sesiones
    for select
    to authenticated
    using (true);

-- El profesor puede borrar una clase desde el historial (btnDeleteClase en
-- profesores.html). Crear sesiones sigue siendo solo vía
-- obtener_o_crear_sesion().
create policy sesiones_delete_authenticated on sesiones
    for delete
    to authenticated
    using (true);

-- ============================================================
-- asistencias
-- ============================================================
alter table asistencias enable row level security;

grant select, insert, update, delete on asistencias to authenticated;

create policy asistencias_select_authenticated on asistencias
    for select
    to authenticated
    using (true);

-- El profesor logueado carga asistio/pago_tipo directo contra la tabla
-- (equivalente al upsertClaseAsistencia/togglePago de hoy).
create policy asistencias_insert_authenticated on asistencias
    for insert
    to authenticated
    with check (true);

create policy asistencias_update_authenticated on asistencias
    for update
    to authenticated
    using (true)
    with check (true);

-- Necesaria para que el ON DELETE CASCADE al borrar una sesión no falle
-- por RLS.
create policy asistencias_delete_authenticated on asistencias
    for delete
    to authenticated
    using (true);
