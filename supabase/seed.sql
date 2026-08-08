-- Datos mínimos para poder probar el esquema en el proyecto de TEST.
-- Pensado para pegar a mano en el SQL editor de Supabase, no para
-- correr en producción ni para dejar contraseñas reales en git.
-- Reemplazá 'CAMBIAR_ESTA_PASSWORD' antes de correrlo.

insert into clubes (nombre) values
    ('Club de prueba 1'),
    ('Club de prueba 2')
on conflict (nombre) do nothing;

-- La clase semanal (domingos, corte a las 20:00) como un evento más.
insert into eventos (slug, nombre, tipo, dia_semana, hora_limite_confirmacion)
values ('clase-semanal', 'Clase Semanal', 'recurrente', 0, '20:00')
on conflict (slug) do nothing;

-- Ejemplo de evento único (equivalente a "Torneo de Menores Mayo" hoy
-- hardcodeado en index.html). Poné la fecha real cuando la tengan.
insert into eventos (slug, nombre, tipo, fecha_unica)
values ('torneo-menores-mayo', 'Torneo de Menores Mayo', 'unico', null)
on conflict (slug) do nothing;

-- Profesor de prueba. username: 'profe1', password: 'CAMBIAR_ESTA_PASSWORD'.
insert into profesores (username, password_hash, nombre)
values (
    'profe1',
    crypt('CAMBIAR_ESTA_PASSWORD', gen_salt('bf')),
    'Profesor de Prueba'
)
on conflict (username) do nothing;
