import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  saveOrganizationConfig,
  uploadOrganizationLogo,
} from '../services/firestoreService';
import { ROLE_PERMISSIONS } from '../types/sigd';

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

export function OrganizationConfigPage() {
  const { profile, role } = useAuth();
  const { organizations } = useSigdData();

  const canManageOrg = ROLE_PERMISSIONS.canManageUsers(role);
  const currentOrg = organizations[0];

  const [name, setName] = useState('Liga Deportiva SIGD');
  const [shortName, setShortName] = useState('SIGD');
  const [city, setCity] = useState('Sede Central');
  const [logoUrl, setLogoUrl] = useState('');
  const [active, setActive] = useState(true);
  const [imgError, setImgError] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    setName(currentOrg.name || 'Liga Deportiva SIGD');
    setShortName(currentOrg.shortName || 'SIGD');
    setCity(currentOrg.city || '');
    setLogoUrl(currentOrg.logoUrl || '');
    setActive(currentOrg.active);
    setImgError(false);
  }, [currentOrg]);

  const targetOrgId = currentOrg?.id || 'org_sigd_principal';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !canManageOrg) return;

    setMsg(null);
    setErrMsg(null);

    const isImage =
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif)$/i.test(file.name);
    if (!isImage) {
      setErrMsg('Selecciona un archivo de imagen válido (PNG, JPG, WebP o SVG).');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrMsg('El logotipo no debe superar los 3 MB.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const downloadUrl = await uploadOrganizationLogo(targetOrgId, file);
      setLogoUrl(downloadUrl);
      setImgError(false);

      await saveOrganizationConfig({
        orgId: targetOrgId,
        isNew: !currentOrg,
        name: name.trim() || 'Liga Deportiva SIGD',
        shortName: shortName.trim() || 'SIGD',
        city,
        logoUrl: downloadUrl,
        active,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      setMsg(
        'Logotipo cargado, optimizado y guardado como insignia oficial del Portal Público y reportes PDF.'
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setErrMsg(
        raw || 'No se pudo cargar el logotipo seleccionado. Puedes intentar nuevamente o pegar una URL directa.'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageOrg) return;

    setMsg(null);
    setErrMsg(null);

    const trimmedName = name.trim();
    const trimmedShort = shortName.trim();
    if (trimmedName.length < 2) {
      setErrMsg('El nombre de la organización debe tener al menos 2 caracteres.');
      return;
    }
    if (trimmedShort.length < 2) {
      setErrMsg('Las siglas deben tener al menos 2 caracteres.');
      return;
    }

    setSaving(true);
    try {
      await saveOrganizationConfig({
        orgId: targetOrgId,
        isNew: !currentOrg,
        name: trimmedName,
        shortName: trimmedShort,
        city,
        logoUrl,
        active,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setMsg(
        'Configuración institucional y logotipo oficial guardados correctamente.'
      );
    } catch {
      setErrMsg('No se pudo guardar la configuración de la organización.');
    } finally {
      setSaving(false);
    }
  };

  const previewLogo = logoUrl.trim();

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Configuración de la Organización e Identidad Oficial
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Administra los datos institucionales y el logotipo oficial almacenado en Firebase Storage para el Portal Público y todos los reportes PDF.
          </p>
        </div>
        {!canManageOrg && (
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
            Solo Administrador General puede editar
          </span>
        )}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 transition-colors"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Building2 className="w-4 h-4 text-electric-500" />
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Datos Institucionales y Logotipo Oficial
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre de la Organización
              </label>
              <input
                type="text"
                required
                maxLength={120}
                disabled={!canManageOrg}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Liga Deportiva Metropolitana"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Siglas / Nombre corto
              </label>
              <input
                type="text"
                required
                maxLength={24}
                disabled={!canManageOrg}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Ej. SIGD"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ciudad / Sede
              </label>
              <input
                type="text"
                maxLength={80}
                disabled={!canManageOrg}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ej. Sede Central"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  disabled={!canManageOrg}
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                Organización activa
              </label>
            </div>
          </div>

          {/* Upload to Firebase Storage */}
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-electric-500" />
                  Subir Logotipo a Firebase Storage
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Formatos PNG, JPG, WebP o SVG (máx. 3 MB). Se publicará automáticamente tras subirlo.
                </p>
              </div>
              {canManageOrg && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="org-logo-upload"
                  />
                  <label
                    htmlFor="org-logo-upload"
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 cursor-pointer transition-colors ${
                      uploading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Procesando...' : 'Seleccionar archivo'}
                  </label>
                </div>
              )}
            </div>

            {logoUrl.startsWith('data:image/') && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Logotipo oficial optimizado y guardado
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                O ingresar URL directa del logotipo
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled={!canManageOrg}
                  value={logoUrl.startsWith('data:image/') ? '' : logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    setImgError(false);
                  }}
                  placeholder="https://.../logo.png o URL pública"
                  className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
                />
                {canManageOrg && previewLogo && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl('');
                      setImgError(false);
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Quitar logotipo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {canManageOrg && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Atajos:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl('/src/assets/images/sigd_crest_emblem_1794523620307.jpg');
                      setImgError(false);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Usar emblema base SIGD
                  </button>
                </div>
              )}
            </div>
          </div>

          {canManageOrg && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving || uploading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          )}
        </form>

        {/* Live Previews */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 transition-colors">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <ImageIcon className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                Vista Previa de Identidad Oficial
              </h2>
            </div>

            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="w-20 h-20 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 p-1.5">
                {previewLogo && !imgError ? (
                  <img
                    src={previewLogo}
                    alt={name}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="font-display font-extrabold text-sm text-navy-900 dark:text-blue-300">
                    {shortName || 'SIGD'}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
                  {name || 'Organización'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {shortName || 'SIGD'}{city ? ` · ${city}` : ''}
                </p>
                {imgError && previewLogo && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                    No se pudo cargar la imagen desde esa URL.
                  </p>
                )}
              </div>
            </div>

            {/* Public Portal Header Mini Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Encabezado del Portal Público
              </p>
              <div className="rounded-xl bg-navy-900 text-white p-4 flex items-center gap-3 border border-slate-800">
                {previewLogo && !imgError ? (
                  <div className="w-12 h-12 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={previewLogo}
                      alt={name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center font-display font-bold text-xs shrink-0">
                    {shortName || 'SIGD'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] text-emerald-400 font-medium truncate">
                    {name || 'Portal Oficial'}
                  </p>
                  <p className="font-display font-bold text-sm truncate">
                    Torneos, Calendarios y Estadísticas
                  </p>
                </div>
              </div>
            </div>

            {/* PDF Header Mini Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Encabezado en Reportes y Actas PDF
              </p>
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="bg-[#0A192F] text-white px-3.5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {previewLogo && !imgError ? (
                      <div className="w-9 h-9 rounded bg-white p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={previewLogo}
                          alt={name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded bg-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                        SIGD
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate">Tabla de Posiciones Oficial</p>
                      <p className="text-[10px] text-slate-300 truncate">{name || 'SIGD'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-300 shrink-0">
                    {new Date().toLocaleDateString('es-MX')}
                  </span>
                </div>
                <div className="h-1 bg-electric-500" />
                <div className="bg-white dark:bg-slate-800 px-3.5 py-2 text-[10px] text-slate-400 dark:text-slate-500">
                  Contenido de tabla oficial / acta digital...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
