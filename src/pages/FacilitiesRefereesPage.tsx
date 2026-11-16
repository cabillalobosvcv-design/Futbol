import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Edit3,
  Flag,
  MapPin,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  createAuditLog,
  deleteEntityDoc,
  deleteRefereeWithPrivateContact,
  getRefereePrivateContact,
  makeId,
  saveEntityDoc,
  saveRefereeWithPrivateContact,
} from '../services/firestoreService';
import { ROLE_PERMISSIONS, type Field, type Referee, type Venue } from '../types/sigd';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function FacilitiesRefereesPage() {
  const { profile, role } = useAuth();
  const { venues, fields, referees, categories, users } = useSigdData();

  const [tab, setTab] = useState<'facilities' | 'referees'>('facilities');
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = ROLE_PERMISSIONS.canManageFacilitiesAndReferees(role);
  const canEditVenue = ROLE_PERMISSIONS.canManageTournaments(role);
  const canDeleteAdminDep = ROLE_PERMISSIONS.canManageTournaments(role);
  const canDeleteVenue = role === 'admin_general';

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
  const [rUserUid, setRUserUid] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rAuthCats, setRAuthCats] = useState<string[]>(['TODAS']);
  const [rSlots, setRSlots] = useState<string[]>(['Sábado 08:00-18:00', 'Domingo 08:00-18:00']);

  // Edit / Delete states — Venues
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [evName, setEvName] = useState('');
  const [evAddress, setEvAddress] = useState('');
  const [evType, setEvType] = useState('Unidad Deportiva');
  const [evActive, setEvActive] = useState(true);
  const [deletingVenue, setDeletingVenue] = useState<Venue | null>(null);

  // Edit / Delete states — Fields
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [efName, setEfName] = useState('');
  const [efSurface, setEfSurface] = useState('');
  const [efCapacity, setEfCapacity] = useState(400);
  const [efOpen, setEfOpen] = useState('08:00');
  const [efClose, setEfClose] = useState('21:00');
  const [efDays, setEfDays] = useState<string[]>([]);
  const [efStatus, setEfStatus] = useState<Field['status']>('disponible');
  const [deletingField, setDeletingField] = useState<Field | null>(null);

  // Edit / Delete states — Referees
  const [editingReferee, setEditingReferee] = useState<Referee | null>(null);
  const [erName, setErName] = useState('');
  const [erUserUid, setErUserUid] = useState('');
  const [erPhone, setErPhone] = useState('');
  const [erEmail, setErEmail] = useState('');
  const [erAuthCats, setErAuthCats] = useState<string[]>(['TODAS']);
  const [erSlots, setErSlots] = useState<string[]>([]);
  const [erStatus, setErStatus] = useState<Referee['status']>('activo');
  const [loadingContact, setLoadingContact] = useState(false);
  const [deletingReferee, setDeletingReferee] = useState<Referee | null>(null);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !vName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
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
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_VENUE',
        entity: 'venues',
        entityId: id,
        summary: `Instalación deportiva registrada: ${vName.trim()} (${vType}).`,
      });
      setVName('');
      setVAddress('');
      setMsg('Instalación deportiva registrada.');
    } catch {
      setErrMsg('No se pudo registrar la instalación. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const openEditVenue = (v: Venue) => {
    setEditingVenue(v);
    setEvName(v.name);
    setEvAddress(v.address);
    setEvType(v.facilityType);
    setEvActive(Boolean(v.active));
  };

  const handleSaveEditVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingVenue || !evName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc(
        'venues',
        editingVenue.id,
        {
          name: evName.trim().slice(0, 120),
          address: (evAddress.trim() || 'Por especificar').slice(0, 220),
          facilityType: evType.slice(0, 60),
          active: evActive,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_VENUE',
        entity: 'venues',
        entityId: editingVenue.id,
        summary: `Instalación actualizada: ${evName.trim()} (${evType}).`,
      });
      setEditingVenue(null);
      setMsg(`Instalación "${evName.trim()}" actualizada.`);
    } catch {
      setErrMsg('No se pudo actualizar la instalación. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteVenue = async () => {
    if (!profile || !deletingVenue || !canDeleteVenue) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteEntityDoc('venues', deletingVenue.id);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'DELETE_VENUE',
        entity: 'venues',
        entityId: deletingVenue.id,
        summary: `Instalación eliminada: ${deletingVenue.name}.`,
      });
      setDeletingVenue(null);
      setMsg(`Instalación "${deletingVenue.name}" eliminada.`);
    } catch {
      setErrMsg('No se pudo eliminar la instalación. Solo Administrador General puede eliminar sedes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    const venueId = fVenueId || venues[0]?.id;
    if (!profile || !fName.trim() || !venueId) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
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
    } catch {
      setErrMsg('No se pudo registrar la cancha. Verifica los datos y permisos.');
    } finally {
      setSaving(false);
    }
  };

  const openEditField = (f: Field) => {
    setEditingField(f);
    setEfName(f.name);
    setEfSurface(f.surfaceType || 'Pasto Sintético');
    setEfCapacity(f.capacity ?? 400);
    setEfOpen(f.openTime || '08:00');
    setEfClose(f.closeTime || '21:00');
    setEfDays([...(f.availableDays || [])]);
    setEfStatus(f.status);
  };

  const toggleEditFieldDay = (day: string) => {
    setEfDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSaveEditField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingField || !efName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc(
        'fields',
        editingField.id,
        {
          venueId: editingField.venueId,
          name: efName.trim().slice(0, 100),
          surfaceType: efSurface.trim().slice(0, 60),
          capacity: Math.max(0, Math.min(200000, Math.round(Number(efCapacity)))),
          availableDays: efDays.slice(0, 7),
          openTime: efOpen,
          closeTime: efClose,
          status: efStatus,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_FIELD',
        entity: 'fields',
        entityId: editingField.id,
        summary: `Cancha actualizada: ${efName.trim()} (${efOpen}-${efClose}, ${efStatus}).`,
      });
      setEditingField(null);
      setMsg(`Cancha "${efName.trim()}" actualizada.`);
    } catch {
      setErrMsg('No se pudo actualizar la cancha. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteField = async () => {
    if (!profile || !deletingField || !canDeleteAdminDep) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteEntityDoc('fields', deletingField.id);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'DELETE_FIELD',
        entity: 'fields',
        entityId: deletingField.id,
        summary: `Cancha eliminada: ${deletingField.name}.`,
      });
      setDeletingField(null);
      setMsg(`Cancha "${deletingField.name}" eliminada.`);
    } catch {
      setErrMsg('No se pudo eliminar la cancha. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReferee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !rName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const id = makeId('ref');
      await saveRefereeWithPrivateContact({
        refereeId: id,
        isNew: true,
        refereeData: {
          ...(rUserUid ? { userUid: rUserUid } : {}),
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
      setRUserUid('');
      setRPhone('');
      setREmail('');
      setMsg('Árbitro registrado (contacto PII aislado en subcolección segura).');
    } catch {
      setErrMsg('No se pudo registrar el árbitro. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const openEditReferee = async (r: Referee) => {
    setEditingReferee(r);
    setErName(r.fullName);
    setErUserUid(r.userUid || '');
    setErAuthCats(r.authorizedCategories?.length ? [...r.authorizedCategories] : ['TODAS']);
    setErSlots([...(r.availabilitySlots || [])]);
    setErStatus(r.status);
    setErPhone('');
    setErEmail('');
    setLoadingContact(true);
    try {
      const priv = await getRefereePrivateContact(r.id);
      setErPhone(priv.phone);
      setErEmail(priv.email);
    } finally {
      setLoadingContact(false);
    }
  };

  const handleSaveEditReferee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingReferee || !erName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveRefereeWithPrivateContact({
        refereeId: editingReferee.id,
        isNew: false,
        refereeData: {
          userUid: erUserUid || '',
          fullName: erName.trim().slice(0, 120),
          authorizedCategories: erAuthCats.slice(0, 30),
          availabilitySlots: erSlots.slice(0, 40),
          status: erStatus,
        },
        phone: erPhone.trim(),
        email: erEmail.trim(),
      });
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_REFEREE',
        entity: 'referees',
        entityId: editingReferee.id,
        summary: `Árbitro actualizado: ${erName.trim()} (${erStatus}).`,
      });
      setEditingReferee(null);
      setMsg(`Árbitro "${erName.trim()}" actualizado correctamente.`);
    } catch {
      setErrMsg('No se pudo actualizar el árbitro. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteReferee = async () => {
    if (!profile || !deletingReferee || !canDeleteAdminDep) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteRefereeWithPrivateContact({
        referee: deletingReferee,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setDeletingReferee(null);
      setMsg(`Árbitro "${deletingReferee.fullName}" eliminado del padrón.`);
    } catch {
      setErrMsg('No se pudo eliminar el árbitro. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setFDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 transition-colors">
        <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
          Instalaciones, Canchas y Cuerpo Arbitral
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Configura sedes, horarios de canchas y disponibilidad de árbitros integrada al generador de roles.
        </p>
      </div>

      {msg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit transition-colors">
        <button
          type="button"
          onClick={() => setTab('facilities')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'facilities'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Instalaciones y Canchas ({fields.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('referees')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'referees'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-electric-500" />
                  <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                    Nueva Instalación / Sede
                  </h2>
                </div>
                <input
                  type="text"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="Nombre del complejo o unidad deportiva"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <input
                  type="text"
                  value={vAddress}
                  onChange={(e) => setVAddress(e.target.value)}
                  placeholder="Dirección completa"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="Unidad Deportiva">Unidad Deportiva</option>
                  <option value="Estadio Municipal">Estadio Municipal</option>
                  <option value="Club Privado">Club Privado</option>
                  <option value="Complejo Universitario">Complejo Universitario</option>
                </select>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 px-4 bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Registrar Instalación
                </button>
              </form>

              <form
                onSubmit={handleCreateField}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                    Registrar Cancha
                  </h2>
                </div>
                <select
                  value={fVenueId || venues[0]?.id || ''}
                  onChange={(e) => setFVenueId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="number"
                    value={fCapacity}
                    onChange={(e) => setFCapacity(Number(e.target.value))}
                    placeholder="Capacidad"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
                <input
                  type="text"
                  value={fSurface}
                  onChange={(e) => setFSurface(e.target.value)}
                  placeholder="Pasto Natural / Sintético"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Hora apertura
                    </span>
                    <input
                      type="time"
                      value={fOpen}
                      onChange={(e) => setFOpen(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Hora cierre
                    </span>
                    <input
                      type="time"
                      value={fClose}
                      onChange={(e) => setFClose(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                    Días disponibles
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          fDays.includes(day)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
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
                <div
                  key={v.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-base text-navy-900 dark:text-white">
                        {v.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {v.facilityType} · {v.address}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {vFields.length} canchas
                      </span>
                      {canEditVenue && (
                        <button
                          type="button"
                          onClick={() => openEditVenue(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          Editar
                        </button>
                      )}
                      {canDeleteVenue && (
                        <button
                          type="button"
                          onClick={() => setDeletingVenue(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {vFields.length === 0 ? (
                      <p className="pt-3 text-xs text-slate-500 dark:text-slate-400">
                        Sin canchas registradas en esta sede.
                      </p>
                    ) : (
                      vFields.map((f) => (
                        <div
                          key={f.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {f.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {f.surfaceType} · Cap: {f.capacity} · Horario {f.openTime}-{f.closeTime}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Días: {f.availableDays.join(', ')}
                            </p>
                          </div>
                          {(canManage || canDeleteAdminDep) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {canManage && (
                                <>
                                  <select
                                    value={f.status}
                                    onChange={(e) =>
                                      saveEntityDoc('fields', f.id, { status: e.target.value }, false)
                                    }
                                    className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="disponible">Disponible</option>
                                    <option value="mantenimiento">Mantenimiento</option>
                                    <option value="inactiva">Inactiva</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => openEditField(f)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    Editar
                                  </button>
                                </>
                              )}
                              {canDeleteAdminDep && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingField(f)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Eliminar
                                </button>
                              )}
                            </div>
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
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <UserCheck className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Registrar Árbitro
                </h2>
              </div>
              <input
                type="text"
                required
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cuenta de usuario vinculada (opcional)
                </label>
                <select
                  value={rUserUid}
                  onChange={(e) => setRUserUid(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Sin vincular cuenta</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.email}) · {u.role}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="tel"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder="Teléfono (PII protegido)"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <input
                type="email"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
                placeholder="Correo electrónico (PII protegido)"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Categorías autorizadas
                </label>
                <select
                  multiple
                  value={rAuthCats}
                  onChange={(e) =>
                    setRAuthCats(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg h-24 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4 h-fit`}>
            {referees.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-slate-900 dark:text-white truncate">
                    {r.fullName}
                  </h3>
                  {canManage ? (
                    <select
                      value={r.status}
                      onChange={(e) =>
                        saveEntityDoc('referees', r.id, { status: e.target.value }, false)
                      }
                      className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  ) : (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      {r.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Disponibilidad: {r.availabilitySlots.join(' · ')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Categorías:{' '}
                  {r.authorizedCategories.includes('TODAS')
                    ? 'Todas'
                    : `${r.authorizedCategories.length} asignadas`}
                </p>
                {(canManage || canDeleteAdminDep) && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openEditReferee(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        Editar
                      </button>
                    )}
                    {canDeleteAdminDep && (
                      <button
                        type="button"
                        onClick={() => setDeletingReferee(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Editar Instalación */}
      {canEditVenue && editingVenue && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditVenue}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Editar Instalación / Sede
              </h3>
              <button
                type="button"
                onClick={() => setEditingVenue(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={evName}
                onChange={(e) => setEvName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Dirección
              </label>
              <input
                type="text"
                maxLength={220}
                value={evAddress}
                onChange={(e) => setEvAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo de instalación
              </label>
              <select
                value={evType}
                onChange={(e) => setEvType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="Unidad Deportiva">Unidad Deportiva</option>
                <option value="Estadio Municipal">Estadio Municipal</option>
                <option value="Club Privado">Club Privado</option>
                <option value="Complejo Universitario">Complejo Universitario</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={evActive}
                onChange={(e) => setEvActive(e.target.checked)}
              />
              Instalación activa
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingVenue(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Instalación */}
      {canDeleteVenue && deletingVenue && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Instalación
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Confirma la baja permanente de esta sede.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingVenue(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">{deletingVenue.name}</p>
              <p className="text-slate-600 dark:text-slate-300">
                Canchas asociadas: {fields.filter((f) => f.venueId === deletingVenue.id).length}.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingVenue(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteVenue}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar sede'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Cancha */}
      {canManage && editingField && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditField}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  Editar Cancha
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sede: {venues.find((v) => v.id === editingField.venueId)?.name || editingField.venueId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de cancha
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={efName}
                  onChange={(e) => setEfName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Capacidad
                </label>
                <input
                  type="number"
                  min={0}
                  max={200000}
                  value={efCapacity}
                  onChange={(e) => setEfCapacity(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Superficie
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={efSurface}
                  onChange={(e) => setEfSurface(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={efStatus}
                  onChange={(e) => setEfStatus(e.target.value as Field['status'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="disponible">Disponible</option>
                  <option value="mantenimiento">Mantenimiento</option>
                  <option value="inactiva">Inactiva</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hora apertura
                </label>
                <input
                  type="time"
                  value={efOpen}
                  onChange={(e) => setEfOpen(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hora cierre
                </label>
                <input
                  type="time"
                  value={efClose}
                  onChange={(e) => setEfClose(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Días disponibles
              </span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleEditFieldDay(day)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      efDays.includes(day)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingField(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Cancha */}
      {canDeleteAdminDep && deletingField && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Cancha
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Esta acción elimina permanentemente la cancha.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingField(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">{deletingField.name}</p>
              <p className="text-slate-600 dark:text-slate-300">
                {venues.find((v) => v.id === deletingField.venueId)?.name || ''} ·{' '}
                {deletingField.openTime}-{deletingField.closeTime}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingField(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteField}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar cancha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Árbitro */}
      {canManage && editingReferee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditReferee}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Editar Árbitro
              </h3>
              <button
                type="button"
                onClick={() => setEditingReferee(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre completo
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={erName}
                onChange={(e) => setErName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={erStatus}
                  onChange={(e) => setErStatus(e.target.value as Referee['status'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cuenta vinculada
                </label>
                <select
                  value={erUserUid}
                  onChange={(e) => setErUserUid(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Sin vincular</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Teléfono (PII)
                </label>
                <input
                  type="tel"
                  maxLength={30}
                  disabled={loadingContact}
                  value={erPhone}
                  onChange={(e) => setErPhone(e.target.value)}
                  placeholder={loadingContact ? 'Cargando...' : 'Teléfono'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo (PII)
                </label>
                <input
                  type="email"
                  maxLength={160}
                  disabled={loadingContact}
                  value={erEmail}
                  onChange={(e) => setErEmail(e.target.value)}
                  placeholder={loadingContact ? 'Cargando...' : 'Correo'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Categorías autorizadas
              </label>
              <select
                multiple
                value={erAuthCats}
                onChange={(e) =>
                  setErAuthCats(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg h-24 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Disponibilidad (separada por coma)
              </label>
              <input
                type="text"
                value={erSlots.join(', ')}
                onChange={(e) =>
                  setErSlots(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingReferee(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || loadingContact}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Árbitro */}
      {canDeleteAdminDep && deletingReferee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Árbitro
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Elimina su perfil operativo y contacto PII protegido.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingReferee(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {deletingReferee.fullName}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Estado actual: {deletingReferee.status}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingReferee(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteReferee}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar árbitro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
