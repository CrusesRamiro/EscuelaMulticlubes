import React, { useState, useEffect } from 'react';
import { Users, ClipboardCheck, AlertCircle, CheckCircle } from 'lucide-react';

// SUPABASE CONFIG
const SUPABASE_URL = 'https://hyaylmjonddryasmqnru.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Q9zhlCA4uoWhi2o50vOXUA_gkjm-JI1';

const HockeyAttendanceApp = () => {
  const [activeTab, setActiveTab] = useState('register');
  const [alumnos, setAlumnos] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  // Registration form state
  const [formData, setFormData] = useState({
    dni: '',
    nombre_completo: '',
    fecha_nac: '',
    equipacion: false,
    club: '',
    nombre_adulto: '',
    telefono_adulto: ''
  });

  // Attendance state
  const [selectedAlumno, setSelectedAlumno] = useState('');
  const [nextSessionDate, setNextSessionDate] = useState('');

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAlumnos();
      setNextSessionDate(getNextSaturday());
    }
  }, [activeTab]);

  const getNextSaturday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const nextSat = new Date(today);
    nextSat.setDate(today.getDate() + daysUntilSaturday);
    return nextSat.toISOString().split('T')[0];
  };

  const fetchAlumnos = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/alumnos?select=dni,nombre_completo`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      const data = await response.json();
      setAlumnos(data);
    } catch (error) {
      showMessage('error', 'Error cargando alumnos');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/alumnos`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ...formData,
          dni: parseInt(formData.dni),
          telefono_adulto: parseInt(formData.telefono_adulto)
        })
      });

      if (response.ok) {
        showMessage('success', '¡Alumno registrado exitosamente!');
        setFormData({
          dni: '',
          nombre_completo: '',
          fecha_nac: '',
          equipacion: false,
          club: '',
          nombre_adulto: '',
          telefono_adulto: ''
        });
      } else {
        showMessage('error', 'Error al registrar. Verifica los datos.');
      }
    } catch (error) {
      showMessage('error', 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendance = async (presente) => {
    if (!selectedAlumno) {
      showMessage('error', 'Selecciona un alumno');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/asistencia`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          alumno_dni: parseInt(selectedAlumno),
          fecha: nextSessionDate,
          presente: presente
        })
      });

      if (response.ok) {
        showMessage('success', `Asistencia registrada: ${presente === 'si' ? 'Asistirá' : 'No asistirá'}`);
        setSelectedAlumno('');
      } else {
        showMessage('error', 'Error al registrar asistencia');
      }
    } catch (error) {
      showMessage('error', 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-indigo-900 text-center">🏒 Club de Hockey</h1>
          <p className="text-gray-600 text-center mt-2">Sistema de Registro y Asistencia</p>
        </div>

        {/* Message Alert */}
        {message.text && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-4 px-6 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'register'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users size={20} />
              Registrar Alumno
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex-1 py-4 px-6 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'attendance'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ClipboardCheck size={20} />
              Marcar Asistencia
            </button>
          </div>

          {/* Register Tab */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">DNI del Alumno</label>
                <input
                  type="number"
                  name="dni"
                  value={formData.dni}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  name="nombre_completo"
                  value={formData.nombre_completo}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
                <input
                  type="date"
                  name="fecha_nac"
                  value={formData.fecha_nac}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                <input
                  type="text"
                  name="club"
                  value={formData.club}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="equipacion"
                  checked={formData.equipacion}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label className="text-sm font-medium text-gray-700">Tiene equipación</label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Datos del Adulto Responsable</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      name="nombre_adulto"
                      value={formData.nombre_adulto}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input
                      type="number"
                      name="telefono_adulto"
                      value={formData.telefono_adulto}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Registrando...' : 'Registrar Alumno'}
              </button>
            </form>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="p-6 space-y-6">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <p className="text-sm text-indigo-900 font-medium">
                  Próxima sesión: <span className="font-bold">{new Date(nextSessionDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecciona al alumno</label>
                <select
                  value={selectedAlumno}
                  onChange={(e) => setSelectedAlumno(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                >
                  <option value="">-- Selecciona un alumno --</option>
                  {alumnos.map((alumno) => (
                    <option key={alumno.dni} value={alumno.dni}>
                      {alumno.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleAttendance('si')}
                  disabled={loading || !selectedAlumno}
                  className="bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CheckCircle size={24} />
                  Sí Asiste
                </button>
                <button
                  onClick={() => handleAttendance('no')}
                  disabled={loading || !selectedAlumno}
                  className="bg-red-600 text-white py-4 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <AlertCircle size={24} />
                  No Asiste
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-600">
          <p>Configura tu Supabase URL y API Key en el código</p>
        </div>
      </div>
    </div>
  );
};

export default HockeyAttendanceApp;