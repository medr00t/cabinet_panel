import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImagePlus, Trash2, UploadCloud, X, ZoomIn, ZoomOut } from 'lucide-react';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import { useToast } from '../contexts/ToastContext';
import { PatientFileRow, errorMessage, patientFileUrl, removePatientFile, uploadPatientFile } from '../services/api';
import { fmtDate, today } from '../utils/format';

const isImage = (f: PatientFileRow) => f.mime.startsWith('image/');
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Full-screen viewer: zoom with the buttons, the wheel or + / −, move with ← →, Esc closes. */
const Viewer = ({ files, start, onClose }: { files: PatientFileRow[]; start: number; onClose: () => void }) => {
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(1);
  const file = files[index];
  const go = useCallback((d: number) => { setIndex((i) => (i + d + files.length) % files.length); setZoom(1); }, [files.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z + 0.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z - 0.25));
      else if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);
  if (!file) return null;
  const url = patientFileUrl(file.id);
  return (
    <div className="rx-viewer" role="dialog" aria-modal="true" aria-label="Visionneuse">
      <div className="rx-bar">
        <div className="rx-title"><b>{file.title || file.originalName}</b><span>{file.takenOn ? fmtDate(file.takenOn) : ''} · {index + 1}/{files.length}</span></div>
        <div className="rx-tools">
          {isImage(file) && <>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label="Réduire"><ZoomOut size={18} /></button>
            <button type="button" className="lvl" onClick={() => setZoom(1)}>{Math.round(zoom * 100)} %</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(6, z + 0.25))} aria-label="Agrandir"><ZoomIn size={18} /></button>
          </>}
          <a className="rx-link" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Nouvel onglet</a>
          <button type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>
      </div>
      <div className="rx-stage" onWheel={(e) => { if (isImage(file)) setZoom((z) => Math.min(6, Math.max(0.25, z - Math.sign(e.deltaY) * 0.15))); }}>
        {isImage(file)
          ? <img src={url} alt={file.title || file.originalName} style={{ transform: `scale(${zoom})` }} draggable={false} />
          : <iframe src={url} title={file.originalName} className="rx-pdf" />}
      </div>
      {files.length > 1 && <>
        <button type="button" className="rx-nav left" onClick={() => go(-1)} aria-label="Précédent"><ChevronLeft size={28} /></button>
        <button type="button" className="rx-nav right" onClick={() => go(1)} aria-label="Suivant"><ChevronRight size={28} /></button>
      </>}
    </div>
  );
};

/** Radiology images (and PDFs) attached to the patient's dossier. */
const Radiology = ({ patientId, files, canRemove, onChanged }: { patientId: number; files: PatientFileRow[]; canRemove: boolean; onChanged: () => Promise<void> | void }) => {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [takenOn, setTakenOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<PatientFileRow | null>(null);

  const upload = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (picked.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const f of picked) {
      try { await uploadPatientFile(patientId, f, title, takenOn); ok += 1; }
      catch (e) { toast.error(`« ${f.name} » n'a pas été ajouté`, errorMessage(e)); }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (ok > 0) { toast.success(ok > 1 ? `${ok} fichiers ajoutés` : 'Fichier ajouté', 'Il est dans le dossier du patient.'); setTitle(''); await onChanged(); }
  };

  return (
    <section className="card">
      <div className="card-head"><h2>Radiologie et images</h2></div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="rx-form">
          <div className="field"><label htmlFor="rx-title">Titre (facultatif)</label>
            <input id="rx-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Panoramique, rétro-alvéolaire 36…" /></div>
          <div className="field"><label htmlFor="rx-date">Date de l'examen</label>
            <input id="rx-date" className="input" type="date" value={takenOn} max={today()} onChange={(e) => setTakenOn(e.target.value)} /></div>
        </div>
        <div className={`rx-drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
          <UploadCloud size={26} />
          <div>Glissez les images ici, ou</div>
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}><ImagePlus /> {busy ? 'Envoi…' : 'Choisir des images'}</button>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
          <small className="muted">JPG, PNG, WEBP, GIF, BMP ou PDF · 30 Mo au plus par fichier</small>
        </div>

        {files.length === 0 ? <EmptyState icon={<FileText />} title="Aucune image" text="Les radiographies et documents ajoutés apparaissent ici, dans le dossier du patient." />
          : (
            <div className="rx-grid">
              {files.map((f, i) => (
                <div key={f.id} className="rx-tile">
                  <button type="button" className="rx-thumb" onClick={() => setViewing(i)} aria-label={`Ouvrir ${f.title || f.originalName}`}>
                    {isImage(f) ? <img src={patientFileUrl(f.id)} alt="" loading="lazy" /> : <span className="rx-pdf-ico"><FileText size={34} />PDF</span>}
                  </button>
                  <div className="rx-meta">
                    <b title={f.originalName}>{f.title || f.originalName}</b>
                    <span>{f.takenOn ? fmtDate(f.takenOn) : fmtDate(f.createdAt.slice(0, 10))} · {size(f.sizeBytes)}</span>
                  </div>
                  {canRemove && <button type="button" className="rx-del" onClick={() => setRemoving(f)} aria-label="Retirer du dossier" title="Retirer du dossier"><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          )}
      </div>
      {viewing !== null && <Viewer files={files} start={viewing} onClose={() => setViewing(null)} />}
      {removing && (
        <ConfirmDialog danger title="Retirer ce fichier du dossier ?" confirmLabel="Retirer"
          message={`« ${removing.title || removing.originalName} » n'apparaîtra plus dans le dossier. Il n'est pas effacé du serveur.`}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try { await removePatientFile(removing.id); toast.success('Fichier retiré du dossier'); await onChanged(); }
            catch (e) { toast.error('Impossible de retirer le fichier', errorMessage(e)); throw e; }
          }} />
      )}
    </section>
  );
};

export default Radiology;
