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
 * Calcula el próximo sábado desde hoy
 * @returns {string} Fecha en formato ISO (YYYY-MM-DD)
 */
function getNextSaturday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const nextSat = new Date(today);
    nextSat.setDate(today.getDate() + daysUntilSaturday);
    return nextSat.toISOString().split('T')[0];
}

/**
 * Calcula el próximo domingo desde hoy
 * @returns {string} Fecha en formato ISO (YYYY-MM-DD)
 */
function getNextSunday() {
    // Usar fecha local sin conversión UTC
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalizar a medianoche

    const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    // Calcular días hasta el próximo domingo
    let daysUntilSunday;
    if (dayOfWeek === 0) {
        // Si hoy es domingo, el próximo es en 7 días
        daysUntilSunday = 7;
    } else {
        // Para cualquier otro día, calcular días restantes hasta domingo
        daysUntilSunday = 7 - dayOfWeek;
    }

    const nextSun = new Date(today);
    nextSun.setDate(today.getDate() + daysUntilSunday);

    // Formatear manualmente para evitar problemas de zona horaria
    const year = nextSun.getFullYear();
    const month = String(nextSun.getMonth() + 1).padStart(2, '0');
    const day = String(nextSun.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha en formato legible en español
 * @param {string} dateString - Fecha en formato ISO (YYYY-MM-DD)
 * @returns {string} Fecha formateada
 */
function formatDate(dateString) {
    // Parsear manualmente para evitar problemas de zona horaria
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    // Crear fecha en zona horaria local (month - 1 porque los meses empiezan en 0)
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
 * @returns {number} Edad en años
 */
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    const age = Math.floor((today - birth) / (1000 * 60 * 60 * 24 * 365.25));
    return age;
}

/**
 * Realiza una petición a Supabase
 * @param {string} endpoint - Endpoint de la API
 * @param {string} method - Método HTTP (GET, POST, etc.)
 * @param {object} body - Cuerpo de la petición (opcional)
 * @returns {Promise} Promesa con la respuesta
 */
async function supabaseRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    };

    if (body && method !== 'GET') {
        options.headers['Prefer'] = 'return=minimal';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);

    if (method === 'GET' || !options.headers['Prefer']) {
        return await response.json();
    }

    return response;
}

/**
 * Obtiene todos los clubes ordenados por nombre
 * @returns {Promise<Array>} Array de clubes
 */
async function fetchClubes() {
    return await supabaseRequest('clubes?select=id,nombre&order=nombre.asc');
}

/**
 * Obtiene todos los alumnos ordenados por nombre con información del club
 * @returns {Promise<Array>} Array de alumnos
 */
async function fetchAlumnos() {
    return await supabaseRequest('alumnos?select=dni,nombre_completo,fecha_nac,club_id,clubes(nombre),casco,patines,guantes,palo,pads,pants,coderas,pechera,nombre_adulto,telefono_adulto&order=nombre_completo.asc');
}

/**
 * Calcula el resumen de equipación de un alumno
 * @param {object} alumno - Objeto alumno con campos de equipación
 * @returns {string} Texto con resumen de equipación (ej: "5/8")
 */
function getEquipmentSummary(alumno) {
    const equipmentFields = ['casco', 'patines', 'guantes', 'palo', 'pads', 'pants', 'coderas', 'pechera'];
    const total = equipmentFields.length;
    const count = equipmentFields.filter(field => alumno[field]).length;
    return `${count}/${total}`;
}

/**
 * Genera tooltip con detalle de equipación
 * @param {object} alumno - Objeto alumno con campos de equipación
 * @returns {string} HTML del tooltip
 */
function getEquipmentDetail(alumno) {
    const equipment = {
        'Casco': alumno.casco,
        'Patines': alumno.patines,
        'Guantes': alumno.guantes,
        'Palo': alumno.palo,
        'Pads': alumno.pads,
        'Pants': alumno.pants,
        'Coderas': alumno.coderas,
        'Pechera': alumno.pechera
    };

    return Object.entries(equipment)
        .map(([name, has]) => `${name}: ${has ? '✓' : '✗'}`)
        .join('\n');
}

/**
 * Obtiene todas las clases ordenadas por fecha descendente
 * @returns {Promise<Array>} Array de clases
 */
async function fetchClases() {
    return await supabaseRequest('clases?select=*&order=fecha.desc');
}

/**
 * Obtiene una clase específica por fecha
 * @param {string} fecha - Fecha en formato ISO
 * @returns {Promise<Object|null>} Clase o null si no existe
 */
async function fetchClaseByFecha(fecha) {
    const clases = await supabaseRequest(`clases?select=*&fecha=eq.${fecha}`);
    return clases.length > 0 ? clases[0] : null;
}

/**
 * Crea una nueva clase
 * @param {string} fecha - Fecha en formato ISO
 * @returns {Promise<Object>} Clase creada
 */
async function createClase(fecha) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/clases`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ fecha })
    });
    const data = await response.json();
    return data[0];
}

/**
 * Obtiene las asistencias de una clase específica
 * @param {number} claseId - ID de la clase
 * @returns {Promise<Array>} Array de asistencias con datos del alumno
 */
async function fetchClaseAsistencias(claseId) {
    return await supabaseRequest(`clase_asistencias?select=*,alumnos(dni,nombre_completo,fecha_nac,clubes(nombre))&clase_id=eq.${claseId}`);
}

/**
 * Crea o actualiza la asistencia de un alumno en una clase
 * @param {number} claseId - ID de la clase
 * @param {number} alumnoDni - DNI del alumno
 * @param {boolean} asistio - Si asistió o no
 * @returns {Promise<Response>} Respuesta de la petición
 */
async function upsertClaseAsistencia(claseId, alumnoDni, asistio) {
    return await fetch(`${SUPABASE_URL}/rest/v1/clase_asistencias`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
            clase_id: claseId,
            alumno_dni: alumnoDni,
            asistio: asistio
        })
    });
}

/**
 * Genera una clase automáticamente desde las confirmaciones de los padres
 * @param {string} fecha - Fecha en formato ISO
 * @returns {Promise<Object>} Clase creada con asistencias
 */
async function generateClaseFromConfirmations(fecha) {
    // Crear la clase
    const clase = await createClase(fecha);

    // Obtener todas las confirmaciones de los padres para esa fecha
    const confirmaciones = await supabaseRequest(`asistencia?select=alumno_dni,presente&fecha=eq.${fecha}`);

    // Obtener todos los alumnos
    const todosAlumnos = await fetchAlumnos();

    // Crear asistencias basadas en las confirmaciones
    const asistenciasPromises = todosAlumnos.map(async (alumno) => {
        const confirmacion = confirmaciones.find(c => c.alumno_dni === alumno.dni);
        let asistio = null; // null = sin confirmar

        if (confirmacion) {
            asistio = confirmacion.presente === 'si';
        }

        // Solo crear registro si hay confirmación (si o no)
        if (asistio !== null) {
            return upsertClaseAsistencia(clase.id, alumno.dni, asistio);
        }
    });

    await Promise.all(asistenciasPromises.filter(p => p !== undefined));

    return clase;
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
