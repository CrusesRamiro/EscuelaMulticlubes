// Funciones compartidas

/**
 * Muestra un mensaje temporal en la página
 * @param {string} elementId - ID del elemento donde mostrar el mensaje
 * @param {string} type - Tipo de mensaje ('success' o 'error')
 * @param {string} text - Texto del mensaje
 */
function showMessage(elementId, type, text) {
    const messageEl = document.getElementById(elementId);
    messageEl.className = `alert alert-${type}`;
    messageEl.innerHTML = `
        ${type === 'success' ?
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
        }
        <span>${text}</span>
    `;
    messageEl.style.display = 'flex';

    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 4000);
}

/**
 * Formatea una fecha (YYYY-MM-DD) en formato legible en español
 * @param {string} dateString - Fecha en formato ISO (YYYY-MM-DD)
 * @returns {string} Fecha formateada
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    // Parsear manualmente para evitar problemas de zona horaria
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Calcula la edad a partir de una fecha de nacimiento
 * @param {string} birthDate - Fecha de nacimiento en formato ISO
 * @returns {number|null} Edad en años
 */
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    return Math.floor((today - birth) / (1000 * 60 * 60 * 24 * 365.25));
}

/**
 * Valida un formulario antes de enviarlo
 * @param {HTMLFormElement} form - Formulario a validar
 * @returns {boolean} true si es válido, false si no
 */
function validateForm(form) {
    const inputs = form.querySelectorAll('input[required], select[required]');
    for (let input of inputs) {
        if (!input.value) {
            showMessage('message', 'error', 'Por favor completa todos los campos requeridos');
            input.focus();
            return false;
        }
    }
    return true;
}

// ============================================================
// Sesión de profesor (JWT devuelto por login_profesor)
// ============================================================

const PROFESOR_TOKEN_KEY = 'profesorJwt';
const PROFESOR_NOMBRE_KEY = 'profesorNombre';

function getProfesorToken() {
    return sessionStorage.getItem(PROFESOR_TOKEN_KEY);
}

function getProfesorNombre() {
    return sessionStorage.getItem(PROFESOR_NOMBRE_KEY) || '';
}

function isProfesorLoggedIn() {
    return !!getProfesorToken();
}

function clearProfesorSession() {
    sessionStorage.removeItem(PROFESOR_TOKEN_KEY);
    sessionStorage.removeItem(PROFESOR_NOMBRE_KEY);
}

/**
 * Decodifica el payload de un JWT (sin validar la firma; solo para leer
 * el nombre a mostrar, la validación real la hace Postgres en cada request).
 */
function decodeJwtPayload(token) {
    try {
        const payload = token.split('.')[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch {
        return {};
    }
}

/**
 * Login de profesor: llama a login_profesor() y guarda el JWT devuelto
 * para el resto de la sesión del navegador (se pierde al cerrar la pestaña).
 */
async function loginProfesor(username, password) {
    const token = await callRpc('login_profesor', { p_username: username, p_password: password });
    sessionStorage.setItem(PROFESOR_TOKEN_KEY, token);
    sessionStorage.setItem(PROFESOR_NOMBRE_KEY, decodeJwtPayload(token).nombre || username);
    return token;
}

function logoutProfesor() {
    clearProfesorSession();
}

// ============================================================
// Cliente REST a Supabase (PostgREST)
// ============================================================

function authHeaders() {
    const token = getProfesorToken() || SUPABASE_ANON_KEY;
    return {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Llama a una función Postgres expuesta como RPC (rpc_*, login_profesor,
 * obtener_o_crear_sesion). Usa el JWT de profesor si hay uno guardado, si
 * no la anon key — varias funciones (rpc_registrar_alumno,
 * rpc_confirmar_asistencia, etc) están pensadas para llamarse sin login.
 * @throws {Error} con el mensaje que devuelve Postgres si la llamada falla
 */
async function callRpc(fnName, params = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Error llamando a ${fnName}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

/**
 * Lee una tabla directo por REST. Requiere estar logueado como profesor:
 * las policies de RLS bloquean la lectura sin el JWT (ver
 * supabase/migrations/0003_rls.sql), así que sin login esto devuelve
 * 401/403 con cero filas.
 */
async function selectTable(query) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: authHeaders()
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Error leyendo datos');
    }
    return await response.json();
}

/**
 * Inserta o actualiza (upsert) directo contra una tabla, resolviendo
 * conflictos por `onConflict` (columnas de una UNIQUE constraint — si no
 * coincide con la primary key, PostgREST necesita que se lo indiquemos
 * explícito con ?on_conflict=, si no intenta un INSERT plano y el upsert
 * falla con 409 duplicate key). Solo funciona logueado como profesor.
 */
async function upsertTable(table, body, onConflict) {
    const query = onConflict ? `${table}?on_conflict=${onConflict}` : table;
    return await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(body)
    });
}

async function deleteFromTable(query) {
    return await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
}

// ============================================================
// Equipación (alumnos.equipamiento es jsonb: {"casco": true, ...})
// ============================================================

const EQUIPAMIENTO_ITEMS = [
    { key: 'casco', label: 'Casco' },
    { key: 'patines', label: 'Patines' },
    { key: 'guantes', label: 'Guantes' },
    { key: 'palo', label: 'Palo' },
    { key: 'pads', label: 'Pads' },
    { key: 'pants', label: 'Pants' },
    { key: 'coderas', label: 'Coderas' },
    { key: 'pechera', label: 'Pechera' }
];

/**
 * @param {object} equipamiento - alumno.equipamiento (jsonb)
 * @returns {string} resumen ej. "5/8"
 */
function getEquipmentSummary(equipamiento) {
    const total = EQUIPAMIENTO_ITEMS.length;
    const count = EQUIPAMIENTO_ITEMS.filter(item => equipamiento && equipamiento[item.key]).length;
    return `${count}/${total}`;
}

/**
 * @param {object} equipamiento - alumno.equipamiento (jsonb)
 * @returns {string} texto para el tooltip
 */
function getEquipmentDetail(equipamiento) {
    return EQUIPAMIENTO_ITEMS
        .map(item => `${item.label}: ${equipamiento && equipamiento[item.key] ? '✓' : '✗'}`)
        .join('\n');
}

// ============================================================
// Alumnos y clubes
// ============================================================

/** Lectura pública (sin login): solo id + nombre. Para el buscador. */
async function fetchAlumnosPublico() {
    return await callRpc('rpc_listar_alumnos_publico');
}

/** Lectura pública (sin login): solo id + nombre. Para el <select> de club. */
async function fetchClubesPublico() {
    return await callRpc('rpc_listar_clubes');
}

/** Alta libre de alumno, sin login. */
async function registrarAlumno(data) {
    return await callRpc('rpc_registrar_alumno', data);
}

/** Lectura completa de alumnos (DNI, teléfono, equipación). Requiere login. */
async function fetchAlumnosCompleto() {
    return await selectTable(
        'alumnos?select=id,dni,nombre_completo,fecha_nacimiento,club_id,clubes(nombre),equipamiento,nombre_adulto,telefono_adulto&order=nombre_completo.asc'
    );
}

// ============================================================
// Eventos (recurrente = clase semanal, único = torneo/copa/etc)
// ============================================================

/** Eventos custom activos y no vencidos (tipo 'unico'), para las nav cards de index.html. */
async function fetchEventosActivos() {
    return await callRpc('rpc_listar_eventos_activos');
}

/**
 * Todos los eventos custom (tipo 'unico'), incluidos los vencidos — para
 * el panel de profesor: un evento vencido deja de mostrarse en index.html
 * pero el profesor lo sigue viendo (y puede borrarlo) hasta que decida
 * hacerlo. Requiere login.
 */
async function fetchEventosAdmin() {
    return await selectTable(
        'eventos?select=id,slug,nombre,fecha_unica&tipo=eq.unico&order=fecha_unica.desc.nullslast,created_at.desc'
    );
}

/** Crea un evento custom (tipo 'unico'). El slug lo genera la base a partir del nombre. Requiere login. */
async function crearEventoCustom(nombre, fechaUnica) {
    return await fetch(`${SUPABASE_URL}/rest/v1/eventos`, {
        method: 'POST',
        headers: { ...authHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({ nombre, fecha_unica: fechaUnica || null, tipo: 'unico' })
    });
}

/** Borra un evento custom (y en cascada sus sesiones/asistencias). Requiere login. */
async function eliminarEvento(eventoId) {
    return await deleteFromTable(`eventos?id=eq.${eventoId}`);
}

/** Datos públicos de un evento por slug (nombre real, en vez de hardcodearlo en la URL). */
async function fetchEvento(slug) {
    const eventos = await callRpc('rpc_obtener_evento', { p_slug: slug });
    return eventos && eventos.length > 0 ? eventos[0] : null;
}

/** Próxima fecha de un evento, sin crear la sesión (solo lectura). */
async function fetchProximaFecha(slug) {
    return await callRpc('rpc_proxima_fecha_evento', { p_evento_slug: slug });
}

/** Confirmación libre de un padre (sin login) para un evento (recurrente o único). */
async function confirmarAsistencia(alumnoId, eventoSlug, presente) {
    return await callRpc('rpc_confirmar_asistencia', {
        p_alumno_id: alumnoId,
        p_evento_slug: eventoSlug,
        p_presente: presente
    });
}

/**
 * Obtiene (o crea si nadie confirmó todavía) la sesión vigente de un
 * evento. La usa el panel de profesor para poder cargar pago/asistencia
 * aunque ningún padre haya confirmado nada.
 * @returns {Promise<{id: number, fecha: string}>}
 */
async function obtenerOCrearSesion(eventoSlug) {
    const rows = await callRpc('obtener_o_crear_sesion', { p_evento_slug: eventoSlug });
    return rows && rows.length > 0 ? rows[0] : null;
}

/** Busca una sesión ya creada de un evento para una fecha puntual (no la crea). Requiere login. */
async function fetchSesionPorFecha(eventoSlug, fecha) {
    const rows = await selectTable(
        `sesiones?select=id,fecha,eventos!inner(slug)&eventos.slug=eq.${encodeURIComponent(eventoSlug)}&fecha=eq.${fecha}`
    );
    return rows && rows.length > 0 ? rows[0] : null;
}

/** Sesiones pasadas de la clase semanal, con sus asistencias embebidas (para el historial). Requiere login. */
async function fetchHistorialClaseSemanal() {
    const hoy = new Date().toISOString().split('T')[0];
    return await selectTable(
        `sesiones?select=id,fecha,eventos!inner(slug),asistencias(asistio,pago_tipo)&eventos.slug=eq.clase-semanal&fecha=lt.${hoy}&order=fecha.desc`
    );
}

/** Asistencias (confirmación + asistio + pago) de una sesión puntual, con el nombre del alumno. Requiere login. */
async function fetchAsistenciasPorSesion(sesionId) {
    return await selectTable(
        `asistencias?select=*,alumnos(id,nombre_completo,fecha_nacimiento,clubes(nombre))&sesion_id=eq.${sesionId}`
    );
}

/** Confirmaciones de un evento único (torneo, copa, etc), con datos del alumno. Requiere login. */
async function fetchConfirmacionesEvento(eventoSlug) {
    return await selectTable(
        `asistencias?select=confirmacion_padre,alumnos(nombre_completo,fecha_nacimiento,clubes(nombre)),sesiones!inner(eventos!inner(slug))&sesiones.eventos.slug=eq.${encodeURIComponent(eventoSlug)}`
    );
}

/**
 * El profesor carga/edita asistio y/o pago_tipo de un alumno en una
 * sesión. Upsert: si no existía la fila (nadie había confirmado), la crea
 * sin tocar confirmacion_padre (queda null = nadie confirmó).
 */
async function guardarAsistenciaProfesor(sesionId, alumnoId, { asistio, pagoTipo } = {}) {
    const body = { sesion_id: sesionId, alumno_id: alumnoId, registrado_at: new Date().toISOString() };
    if (asistio !== undefined) body.asistio = asistio;
    if (pagoTipo !== undefined) body.pago_tipo = pagoTipo;
    return await upsertTable('asistencias', body, 'sesion_id,alumno_id');
}

/** Borra una sesión (y en cascada sus asistencias). Requiere login. */
async function eliminarSesion(sesionId) {
    return await deleteFromTable(`sesiones?id=eq.${sesionId}`);
}
