import React, { useState } from 'react';
import { Building2, CheckCircle2, Flag, MapPin, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  createAuditLog,
  makeId,
  saveEntityDoc,
  saveRefereeWithPrivateContact,
} from '../services/firestoreService';
import { ROLE_PERMISSIONS } from '../types/sigd';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function FacilitiesRefereesPage() {
  const { profile, role } = useAuth();
  const { venues, fields, referees, categories } = useSigdData();

  const [tab, setTab] = useState<'facilities' | 'referees'>('facilities');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = ROLE_PERMISSIONS.canManageFacilitiesAndReferees(role);

  // Venue form
  const [vName, setVName] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [vType, setVType] = useState('Unidad Deportiva');

  // Field form
  const [fVenueId, setFVenueId] = useState('');
  const [fName, setFName] = useState('');
  const [fSurface, setFSurface] = useState('Pasto Sintético');
  const [fCapacity, setFCapacity] = useState(400);
  const [fOpen, setFOpen] = useState('08:00');
  const [fClose, setFClose] = useState('21:00');
  const [fDays, setFDays] = useState<string[]>(['Sábado', 'Domingo']);

  // Referee form
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rAuthCats, setRAuthCats] = useState<string[]>(['TODAS']);
  const [rSlots, setRSlots] = useState<string[]>(['Sábado 08:00-18:00', 'Domingo 08:00-18:00']);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !vName.trim()) return;
    setSaving(true);
    try {
      const id = makeId('ven');
      await saveEntityDoc(
        'venues',
        id,
        {
          name: vName.trim(),
          address: vAddress.trim() || 'Por especificar',
          facilityType: vType,
          active: true,
        },
        true
      );
      setVName('');
      setVAddress('');
      setMsg('Instalación deportiva registrada.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    const venueId = fVenueId || venues[0]?.id;
    if (!profile || !fName.trim() || !venueId) return;
    setSaving(true);
    try {
      const id = makeId('fld');
      await saveEntityDoc(
        'fields',
        id,
        {
          venueId,
          name: fName.trim(),
          surfaceType: fSurface,
          capacity: Number(fCapacity),
          availableDays: fDays,
          openTime: fOpen,
          closeTime: fClose,
          slotDurationMinutes: 120,
          status: 'disponible',
        },
        true
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_FIELD',
        entity: 'fields',
        entityId: id,
        summary: `Cancha registrada: ${fName.trim()} (${fOpen}-${fClose})`,
      });
      setFName('');
      setMsg('Cancha registrada con horarios disponibles.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReferee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !rName.trim()) return;
    setSaving(true);
    try {
      const id = makeId('ref');
      await saveRefereeWithPrivateContact({
        refereeId: id,
        isNew: true,
        refereeData: {
          fullName: rName.trim(),
          authorizedCategories: rAuthCats,
          availabilitySlots: rSlots,
          status: 'activo',
        },
        phone: rPhone.trim(),
        email: rEmail.trim(),
      });
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_REFEREE',
        entity: 'referees',
        entityId: id,
        summary: `Árbitro registrado: ${rName.trim()}`,
      });
      setRName('');
      setRPhone('');
      setREmail('');
      setMsg('Árbitro registrado (contacto PII aislado en subcolección segura).');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setFDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-xl font-display font-bold text-navy-900">
          Instalaciones, Canchas y Cuerpo Arbitral
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Configura sedes, horarios de canchas y disponibilidad de árbitros integrada al generador de roles.
        </p>
      </div>

      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('facilities')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'facilities' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Instalaciones y Canchas ({fields.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('referees')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'referees' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flag className="w-4 h-4" />
          Árbitros ({referees.length})
        </button>
      </div>

      {tab === 'facilities' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <div className="lg:col-span-5 space-y-6">
              <form
                onSubmit={handleCreateVenue}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-electric-500" />
                  <h2 className="font-display font-semibold text-base text-slate-900">
                    Nueva Instalación / Sede
                  </h2>
                </div>
                <input
                  type="text"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="Nombre del complejo o unidad deportiva"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  value={vAddress}
                  onChange={(e) => setVAddress(e.target.value)}
                  placeholder="Dirección completa"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  <option value="Unidad Deportiva">Unidad Deportiva</option>
                  <option value="Estadio Municipal">Estadio Municipal</option>
                  <option value="Club Privado">Club Privado</option>
                  <option value="Complejo Universitario">Complejo Universitario</option>
                </select>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 px-4 bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium rounded-lg"
                >
                  Registrar Instalación
                </button>
              </form>

              <form
                onSubmit={handleCreateField}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <h2 className="font-display font-semibold text-base text-slate-900">
                    Registrar Cancha
                  </h2>
                </div>
                <select
                  value={fVenueId || venues[0]?.id || ''}
                  onChange={(e) => setFVenueId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="Cancha 1 Principal"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    value={fCapacity}
                    onChange={(e) => setFCapacity(Number(e.target.value))}
                    placeholder="Capacidad"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <input
                  type="text"
                  value={fSurface}
                  onChange={(e) => setFSurface(e.target.value)}
                  placeholder="Pasto Natural / Sintético"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Hora apertura</span>
                    <input
                      type="time"
                      value={fOpen}
                      onChange={(e) => setFOpen(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Hora cierre</span>
                    <input
                      type="time"
                      value={fClose}
                      onChange={(e) => setFClose(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Días disponibles</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-2 py-1 text-xs rounded-md border ${
                          fDays.includes(day)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving || venues.length === 0}
                  className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Agregar Cancha
                </button>
              </form>
            </div>
          )}

          <div className={`${canManage ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
            {venues.map((v) => {
              const vFields = fields.filter((f) => f.venueId === v.id);
              return (
                <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-bold text-base text-navy-900">{v.name}</h3>
                      <p className="text-xs text-slate-500">
                        {v.facilityType} · {v.address}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-600 tabular-nums">
                      {vFields.length} canchas
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {vFields.length === 0 ? (
                      <p className="pt-3 text-xs text-slate-500">
                        Sin canchas registradas en esta sede.
                      </p>
                    ) : (
                      vFields.map((f) => (
                        <div key={f.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                            <p className="text-xs text-slate-500">
                              {f.surfaceType} · Cap: {f.capacity} · Horario {f.openTime}-{f.closeTime}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Días: {f.availableDays.join(', ')}
                            </p>
                          </div>
                          {canManage && (
                            <select
                              value={f.status}
                              onChange={(e) =>
                                saveEntityDoc('fields', f.id, { status: e.target.value }, false)
                              }
                              className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50"
                            >
                              <option value="disponible">Disponible</option>
                              <option value="mantenimiento">Mantenimiento</option>
                              <option value="inactiva">Inactiva</option>
                            </select>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'referees' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateReferee}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <UserCheck className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Registrar Árbitro
                </h2>
              </div>
              <input
                type="text"
                required
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="tel"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder="Teléfono (PII protegido)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="email"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
                placeholder="Correo electrónico (PII protegido)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Categorías autorizadas
                </label>
                <select
                  multiple
                  value={rAuthCats}
                  onChange={(e) =>
                    setRAuthCats(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg h-24 bg-slate-50"
                >
                  <option value="TODAS">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Disponibilidad (separada por coma)
                </label>
                <input
                  type="text"
                  value={rSlots.join(', ')}
                  onChange={(e) =>
                    setRSlots(
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg"
              >
                Registrar Árbitro
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4`}>
            {referees.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-slate-900">{r.fullName}</h3>
                  {canManage ? (
                    <select
                      value={r.status}
                      onChange={(e) =>
                        saveEntityDoc('referees', r.id, { status: e.target.value }, false)
                      }
                      className="px-2 py-1 text-xs border border-slate-200 rounded bg-slate-50"
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  ) : (
                    <span className="text-xs text-emerald-700 font-medium">{r.status}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Disponibilidad: {r.availabilitySlots.join(' · ')}
                </p>
                <p className="text-xs text-slate-500">
                  Categorías:{' '}
                  {r.authorizedCategories.includes('TODAS')
                    ? 'Todas'
                    : `${r.authorizedCategories.length} asignadas`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
