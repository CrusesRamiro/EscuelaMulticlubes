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
5. (opcional, solo test) `seed.sql` — un club, el evento de clase semanal y
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

## Qué llama el frontend a partir de acá (próximo paso, no incluido todavía)

Sin login (`anon`), todo vía `POST /rest/v1/rpc/<función>`:

- `rpc_registrar_alumno` — reemplaza el `POST /alumnos` de `registro.html`.
- `rpc_listar_clubes` — reemplaza el `GET /clubes` del `<select>` de
  `registro.html`.
- `rpc_listar_alumnos_publico` — reemplaza el `GET /alumnos` que arma el
  datalist en `asistencia.html`/`evento.html` (ahora devuelve solo
  id+nombre, no todo el registro del alumno).
- `rpc_obtener_evento` — para que `evento.html` muestre el nombre real del
  evento en vez del que viene hardcodeado en el query string.
- `rpc_confirmar_asistencia` — reemplaza el `POST /asistencia` y
  `POST /evento_asistencia`.

Con login (`authenticated`, JWT de `login_profesor`):

- Login: `POST /rest/v1/rpc/login_profesor` con `{username, password}` →
  devuelve el JWT. Guardarlo (ej. `sessionStorage`) y mandarlo como
  `Authorization: Bearer <jwt>` en el resto de los requests de
  `profesores.html` (en vez de la anon key sola).
- Todo lo que hoy lee `profesores.html` (`alumnos`, `sesiones`,
  `asistencias`, `eventos`) pasa a requerir ese header — sin él, RLS
  devuelve 0 filas.
- Marcar `asistio`/`pago_tipo` y borrar una clase: `INSERT`/`UPDATE`/
  `DELETE` directo contra `asistencias`/`sesiones` (permitido por las
  policies de `authenticated` en `0003_rls.sql`), igual que hoy.

Esta parte (reescribir `js/utils.js` y los 5 HTML) queda para cuando
confirmemos que el esquema funciona en test — es un cambio separado a
propósito para no mezclar "diseño de base" con "reescritura de UI".
