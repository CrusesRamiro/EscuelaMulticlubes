# Esquema nuevo — Escuela Multiclubes

Esquema de reemplazo para el proyecto Supabase actual. Diseñado para
aplicarse primero en un proyecto de **test** (no en el de producción que
usan hoy profesores y padres). Ningún archivo de este directorio se ejecutó
todavía contra ninguna base — son solo los `.sql` a correr cuando tengamos
las credenciales del proyecto de test.

## Por qué existe esto

El esquema viejo tiene tres problemas de fondo (detalle completo en el plan
de la sesión que lo generó):

1. Asistencia duplicada en 3 tablas distintas (`asistencia`,
   `clase_asistencias`, `evento_asistencia`) para el mismo concepto.
2. Los eventos custom (Torneo, Copa) están hardcodeados en HTML/JS, no
   existen como datos — crear uno nuevo hoy es un deploy, no un INSERT.
3. El login de profesores consulta la tabla `profesores` (con contraseñas en
   texto plano) directo con la anon key — cualquiera con la key, que está
   en el HTML público, puede leerla. La tabla `alumnos` también es legible
   sin login.

## Orden de aplicación

En el SQL editor del proyecto de test (o `supabase db push` si lo tenés
linkeado por CLI):

1. `migrations/0001_schema.sql` — tablas.
2. `migrations/0002_functions.sql` — funciones (`rpc_*`, `login_profesor`,
   `obtener_o_crear_sesion`).
3. **Setear el JWT secret** (ver abajo) — sin esto `login_profesor` no
   funciona.
4. `migrations/0003_rls.sql` — RLS y grants.
5. `migrations/0004_gestion_eventos.sql` — slug automático + alta/baja de
   eventos custom desde el panel de profesor + vencimiento por fecha.
6. (opcional, solo test) `seed.sql` — un club, el evento de clase semanal y
   un profesor de prueba.

## Paso manual: JWT secret

`login_profesor()` firma un JWT (HS256, a mano con `hmac()` de `pgcrypto` —
ver nota en `migrations/0001_schema.sql` sobre por qué no se usa la
extensión `pgjwt`), usando el JWT secret real del
proyecto. Ese valor es sensible y **no va en el repo**. Se guarda una sola
vez por proyecto en **Supabase Vault** (`supabase_vault`, viene habilitado
por default) — los proyectos administrados de Supabase no permiten
`ALTER DATABASE ... SET` de GUCs custom, así que Vault es el mecanismo
soportado para este tipo de secreto. Desde el SQL editor:

```sql
select vault.create_secret('PEGAR-ACA-EL-JWT-SECRET', 'app_jwt_secret');
```

Si en algún momento hay que rotarlo:

```sql
select vault.update_secret(
    (select id from vault.secrets where name = 'app_jwt_secret'),
    'NUEVO-JWT-SECRET'
);
```

El valor está en el dashboard de Supabase: **Project Settings → API →
JWT Settings → JWT Secret** (en proyectos nuevos puede aparecer como
"Legacy JWT Secret" dentro de "JWT Keys").

## Cómo dar de alta un profesor

No hay un endpoint público para esto (a propósito). Se hace a mano en el
SQL editor:

```sql
insert into profesores (username, password_hash, nombre)
values ('nombre_usuario', crypt('la-contraseña', gen_salt('bf')), 'Nombre Apellido');
```

## Mapeo tabla vieja → nueva

| Antes                              | Ahora                                                    |
|-------------------------------------|-----------------------------------------------------------|
| `clubes`                            | `clubes` (sin cambios de fondo)                           |
| `alumnos` (8 columnas boolean sueltas de equipación, `dni`/`telefono_adulto` numéricos) | `alumnos` (`equipamiento jsonb`, `telefono_adulto text`) |
| `profesores` (password en texto plano, legible con la anon key) | `profesores` (`password_hash` bcrypt, RLS sin policies: 0 acceso por REST) |
| *(no existía)*                      | `eventos` — clase semanal y eventos custom como filas, no hardcodeados |
| `clases`                            | `sesiones` (generalizada a cualquier evento, no solo la clase semanal) |
| `asistencia` (confirmación padre, clase semanal) | `asistencias.confirmacion_padre` |
| `clase_asistencias` (asistencia real + pago, clase semanal) | `asistencias.asistio` + `asistencias.pago_tipo` |
| `evento_asistencia` (confirmación padre, eventos custom) | `asistencias.confirmacion_padre` (misma tabla que la clase semanal) |

## Qué llama el frontend (ya implementado, ver `js/utils.js`)

Sin login (`anon`), todo vía `POST /rest/v1/rpc/<función>`:

- `rpc_registrar_alumno` — alta libre de alumno (`registro.html`).
- `rpc_listar_clubes` — `<select>` de club (`registro.html`).
- `rpc_listar_alumnos_publico` — datalist de `asistencia.html`/`evento.html`
  (solo id+nombre, no todo el registro del alumno).
- `rpc_listar_eventos_activos` — eventos custom activos y no vencidos, para
  las nav cards de `index.html`.
- `rpc_obtener_evento` — nombre real de un evento por slug (`evento.html`);
  también devuelve vacío si el evento ya venció.
- `rpc_proxima_fecha_evento` — fecha de la próxima sesión sin crearla (solo
  lectura, para mostrar "Próxima sesión: X").
- `rpc_confirmar_asistencia` — confirmación de un padre, para la clase
  semanal o cualquier evento custom (upsert: puede corregir su respuesta).

Con login (`authenticated`, JWT de `login_profesor`, guardado en
`sessionStorage` y mandado como `Authorization: Bearer <jwt>` en vez de la
anon key sola):

- Login: `POST /rest/v1/rpc/login_profesor` con `{p_username, p_password}`.
- Lectura de `alumnos`, `sesiones`, `asistencias`, `eventos`, `clubes`
  directo por REST — sin el JWT, RLS devuelve 0 filas.
- Marcar `asistio`/`pago_tipo` (`asistencias`) y borrar una clase
  (`sesiones`): `INSERT`/`UPDATE`/`DELETE` directo, con `?on_conflict=` en
  el upsert de `asistencias` porque su UNIQUE no es la primary key.
- **Gestión de eventos custom** (panel de profesor, botón "+ Nuevo
  evento"): `INSERT` directo en `eventos` (`tipo` siempre `'unico'`; el
  `slug` lo genera un trigger a partir del nombre, no hace falta mandarlo)
  y `DELETE` directo por `id` (borra en cascada sus sesiones/asistencias).
  Las policies de `0004_gestion_eventos.sql` acotan ambas operaciones a
  `tipo = 'unico'` — no se puede tocar por acá el evento recurrente
  `clase-semanal` aunque alguien mande el id a mano.
- El panel de profesor lista **todos** los eventos custom (`fetchEventosAdmin`,
  `eventos?select=...` directo), vencidos incluidos, para poder revisarlos
  o borrarlos — `rpc_listar_eventos_activos` (público) en cambio los oculta
  apenas pasa la fecha. Ninguna de las dos cosas borra la fila: el
  vencimiento es solo visual/de listado, borrar sigue siendo una acción
  manual del profesor.

Esta parte (reescribir `js/utils.js` y los 5 HTML) queda para cuando
confirmemos que el esquema funciona en test — es un cambio separado a
propósito para no mezclar "diseño de base" con "reescritura de UI".
