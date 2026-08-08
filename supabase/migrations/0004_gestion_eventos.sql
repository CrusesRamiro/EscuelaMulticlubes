-- Gestión de eventos custom desde el panel de profesor: crear (con slug
-- autogenerado) y borrar (cascade a sesiones/asistencias), y ocultar de
-- las vistas públicas los eventos únicos cuya fecha ya pasó — sin borrar
-- la fila, eso queda como acción manual del profesor.

create extension if not exists unaccent;

-- ============================================================
-- slugify: nombre de evento -> slug URL-safe ("Torneo Ñandú 2026" ->
-- "torneo-nandu-2026").
-- ============================================================
create or replace function slugify(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
    select trim(both '-' from regexp_replace(lower(unaccent(p_text)), '[^a-z0-9]+', '-', 'g'));
$$;

-- ============================================================
-- Autogenera eventos.slug a partir de eventos.nombre si no vino seteado,
-- con sufijo numérico si hay colisión. Así el panel de profesor solo
-- necesita mandar nombre + fecha para crear un evento.
-- ============================================================
create or replace function eventos_generar_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_base text;
    v_slug text;
    v_n    int := 1;
begin
    if new.slug is not null and new.slug <> '' then
        return new;
    end if;

    v_base := slugify(new.nombre);
    v_slug := v_base;

    while exists (select 1 from eventos where slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
    end loop;

    new.slug := v_slug;
    return new;
end;
$$;

drop trigger if exists trg_eventos_generar_slug on eventos;
create trigger trg_eventos_generar_slug
    before insert on eventos
    for each row
    execute function eventos_generar_slug();

-- ============================================================
-- RLS: el profesor logueado puede crear y borrar eventos custom.
-- Acotado a tipo='unico' para que nadie pueda borrar por error el evento
-- recurrente "clase-semanal" (que se sigue manejando a mano en el SQL
-- editor, es la definición de fondo del calendario, no un evento suelto).
-- Borrar un evento borra en cascada sus sesiones y asistencias (ya
-- permitido por las policies de sesiones/asistencias de 0003_rls.sql).
-- ============================================================
grant insert, delete on eventos to authenticated;

create policy eventos_insert_authenticated on eventos
    for insert
    to authenticated
    with check (tipo = 'unico');

create policy eventos_delete_authenticated on eventos
    for delete
    to authenticated
    using (tipo = 'unico');

-- ============================================================
-- Ocultar (no borrar) de las vistas públicas los eventos únicos cuya
-- fecha ya pasó.
-- ============================================================
create or replace function rpc_listar_eventos_activos()
returns table (slug text, nombre text)
language sql
security definer
stable
set search_path = public
as $$
    select slug, nombre
    from eventos
    where tipo = 'unico'
      and activo = true
      and (fecha_unica is null or fecha_unica >= current_date)
    order by created_at asc;
$$;

create or replace function rpc_obtener_evento(p_slug text)
returns table (slug text, nombre text, tipo text, activo boolean)
language sql
security definer
stable
set search_path = public
as $$
    select slug, nombre, tipo, activo
    from eventos
    where slug = p_slug
      and activo = true
      and (tipo <> 'unico' or fecha_unica is null or fecha_unica >= current_date);
$$;
