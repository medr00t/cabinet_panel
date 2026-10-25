import { useState } from 'react';
import { DatabaseBackup, FileSpreadsheet, RotateCcw } from 'lucide-react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import { useToast } from '../contexts/ToastContext';
import { useLoader } from '../hooks/useLoader';
import { BackupFile, errorMessage, exportBackup, listBackups, restoreBackup } from '../services/api';

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Doctor only: make a backup now, see the backup files, rebuild a lost database from one of them. */
const BackupDialog = ({ onClose }: { onClose: () => void }) => {
  const toast = useToast();
  const files = useLoader(() => listBackups(), []);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<BackupFile | null>(null);

  const backupNow = async () => {
    setBusy(true);
    try {
      const r = await exportBackup(true);
      toast.success('Sauvegarde terminée', `${r.patients} patients, ${r.treatments} actes → ${r.path}`);
      await files.reload();
    } catch (e) {
      toast.error('Sauvegarde impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title="Sauvegarde Excel" subtitle="Une copie complète des données, lisible dans Excel et restaurable." size="wide" onClose={onClose}
        footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
        <div className="stack">
          <div className="alert" style={{ background: 'var(--brand-50)', borderColor: 'var(--brand-200)', color: 'var(--brand-700)' }}>
            Une sauvegarde est faite automatiquement à chaque connexion du docteur : un fichier par mois, une feuille par jour.
            Chaque fichier contient aussi toutes les données brutes (feuilles grises <b>data_…</b>), ce qui permet de reconstruire la base si elle est perdue.
          </div>
          <div className="row-between">
            <span className="muted" style={{ fontSize: 13 }}>Dossier : <b>{files.data?.dir ?? '…'}</b></span>
            <button className="btn" onClick={backupNow} disabled={busy}><DatabaseBackup /> {busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>
          </div>

          <div className="card">
            {files.error ? <div style={{ padding: 16 }}><div className="alert alert-bad">{files.error}</div></div>
              : !files.data ? <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 80 }} /></div>
                : files.data.files.length === 0 ? <EmptyState icon={<FileSpreadsheet />} title="Aucune sauvegarde" text="Cliquez sur « Sauvegarder maintenant »." />
                  : (
                    <table className="table">
                      <thead><tr><th>Fichier</th><th>Dernière mise à jour</th><th className="r">Taille</th><th /></tr></thead>
                      <tbody>
                        {files.data.files.map((f) => (
                          <tr key={f.name}>
                            <td style={{ fontWeight: 600 }}><FileSpreadsheet size={15} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--ok)' }} />{f.name}</td>
                            <td className="num">{f.modified}</td>
                            <td className="r num">{size(f.size)}</td>
                            <td className="r"><button className="btn btn-secondary btn-sm" onClick={() => setRestoring(f)}><RotateCcw /> Restaurer</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Pour restaurer après une perte : installez le serveur sur le nouveau poste (base vide), connectez-vous en docteur, puis restaurez le fichier le plus récent.
            La restauration refuse de s'exécuter si la base contient déjà des données.
          </div>
        </div>
      </Modal>

      {restoring && (
        <ConfirmDialog danger title="Restaurer cette sauvegarde ?" confirmLabel="Restaurer"
          message={`La base sera reconstruite à partir de « ${restoring.name} ». Cela ne fonctionne que sur une base vide (nouveau serveur ou base perdue) et ne remplace jamais des données existantes.`}
          onClose={() => setRestoring(null)}
          onConfirm={async () => {
            try {
              const r = await restoreBackup(restoring.name);
              toast.success('Base restaurée', `${r.patients} patients, ${r.treatments} actes, ${r.payments} paiements, ${r.appointments} rendez-vous.`);
            } catch (e) {
              toast.error('Restauration impossible', errorMessage(e));
              throw e;
            }
          }} />
      )}
    </>
  );
};

export default BackupDialog;
