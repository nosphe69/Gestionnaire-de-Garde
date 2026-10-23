import * as React from 'react';
import { useState, useEffect, Component, ReactNode } from 'react';
import { 
  Calendar as CalendarIcon, 
  Activity, 
  LogOut, 
  Plus, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Printer,
  Users,
  UserPlus,
  UserMinus,
  Edit,
  Settings,
  Trash2,
  User as UserIcon,
  BarChart3,
  Database,
  RefreshCw,
  Save,
  Download,
  Mail,
  ExternalLink,
  FolderOpen,
  Edit3,
  StickyNote,
  Tag,
  Check,
  X,
  Upload,
  FileUp,
  Sparkles,
  HardDrive,
  FileSpreadsheet
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isToday,
  parseISO,
  startOfWeek,
  getDay
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from './lib/utils';
import { User, Shift } from './types';

function getFrenchPublicHolidayName(date: Date): string | null {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month === 1 && day === 1) return "Jour de l'An";
  if (month === 5 && day === 1) return "Fête du Travail";
  if (month === 5 && day === 8) return "Victoire 1945";
  if (month === 7 && day === 14) return "Fête Nationale";
  if (month === 8 && day === 15) return "Assomption";
  if (month === 11 && day === 1) return "Toussaint";
  if (month === 11 && day === 11) return "Armistice 1918";
  if (month === 12 && day === 25) return "Noël";

  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  const easterDate = new Date(year, easterMonth - 1, easterDay);
  
  const easterMonday = new Date(easterDate);
  easterMonday.setDate(easterDate.getDate() + 1);
  if (date.getMonth() === easterMonday.getMonth() && date.getDate() === easterMonday.getDate()) {
    return "Lundi de Pâques";
  }

  const ascension = new Date(easterDate);
  ascension.setDate(easterDate.getDate() + 39);
  if (date.getMonth() === ascension.getMonth() && date.getDate() === ascension.getDate()) {
    return "Jeudi de l'Ascension";
  }

  const pentecost = new Date(easterDate);
  pentecost.setDate(easterDate.getDate() + 50);
  if (date.getMonth() === pentecost.getMonth() && date.getDate() === pentecost.getDate()) {
    return "Lundi de Pentecôte";
  }

  return null;
}

function getSpecialShiftInfo(date: Date): { isSpecial: boolean; label: string; reason: string } {
  const isSunday = format(date, 'i') === '7';
  const holidayName = getFrenchPublicHolidayName(date);

  if (isSunday || holidayName) {
    const reason = isSunday && holidayName 
      ? `Dimanche & ${holidayName}` 
      : isSunday 
        ? 'Dimanche' 
        : `Férié (${holidayName})`;
    return {
      isSpecial: true,
      label: 'Garde de Nuit (19h - 07h)',
      reason
    };
  }

  return { isSpecial: false, label: '', reason: '' };
}

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 text-center">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md">
            <AlertCircle className="text-red-500 w-12 h-12 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Oups ! Une erreur est survenue.</h1>
            <p className="text-zinc-400 text-sm mb-6">L'application a rencontré un problème inattendu.</p>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-semibold transition-all"
            >
              Réinitialiser et recharger
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('guard_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse saved user", e);
      return null;
    }
  });

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('guard_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('guard_user');
      }
    } catch (e) {
      console.error("LocalStorage sync error:", e);
    }
  }, [user]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [emergencies, setEmergencies] = useState<string>('');
  const [otherUserShift, setOtherUserShift] = useState<{name: string, code: string} | null>(null);
  const [userShifts, setUserShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [view, setView] = useState<'report' | 'summary' | 'users' | 'profile'>('report');
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [scheduledNotes, setScheduledNotes] = useState<Record<string, string>>({});
  const [scheduledNoteInput, setScheduledNoteInput] = useState<string>('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'nas'>('file');
  const [importing, setImporting] = useState(false);
  const [nasStatus, setNasStatus] = useState<{
    configuredDir: string;
    exists: boolean;
    isDirectory: boolean;
    fileCount: number;
    files: Array<{
      name: string;
      size: number;
      formattedSize: string;
      mtime: string;
      detectedMonth: string | null;
      isExcel?: boolean;
    }>;
  } | null>(null);
  const [selectedNasFile, setSelectedNasFile] = useState<string>('');
  const [customNasDir, setCustomNasDir] = useState<string>('');
  const [savingNasDir, setSavingNasDir] = useState(false);

  const handleImportExcelFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthStr = format(currentMonth, 'yyyy-MM');

    if (!uploadFile) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner un fichier Excel (.xlsx, .xls, .csv).' });
      return;
    }

    try {
      setImporting(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string) || '';
          const res = await fetch('/api/plannings/import-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: base64Data,
              month: monthStr,
              fileName: uploadFile.name
            }),
          });
          const data = await res.json();
          if (data.success) {
            setMessage({ type: 'success', text: data.message || 'Planning importé avec succès !' });
            await fetchScheduledNotes();
            setShowUploadModal(false);
            setUploadFile(null);
          } else {
            setMessage({ type: 'error', text: data.message || "Erreur lors de l'import du fichier Excel." });
          }
        } catch (err) {
          console.error("Import Excel error:", err);
          setMessage({ type: 'error', text: "Échec de l'import du fichier Excel." });
        } finally {
          setImporting(false);
        }
      };
      reader.onerror = () => {
        setMessage({ type: 'error', text: "Erreur lors de la lecture du fichier." });
        setImporting(false);
      };
      reader.readAsDataURL(uploadFile);
    } catch (err) {
      console.error("File reader error:", err);
      setMessage({ type: 'error', text: "Erreur lors de la lecture du fichier." });
      setImporting(false);
    }
  };

  const fetchScheduledNotes = async () => {
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const res = await fetch(`/api/scheduled-duties/${monthStr}`);
      if (!res.ok) throw new Error('Failed to fetch scheduled notes');
      const data = await res.json();
      const map: Record<string, string> = {};
      if (Array.isArray(data)) {
        data.forEach((item: { date: string; note: string }) => {
          map[item.date] = item.note;
        });
      }
      setScheduledNotes(map);
    } catch (err) {
      console.error("fetchScheduledNotes error:", err);
    }
  };

  const handleSaveScheduledNote = async (dateStr: string, noteText: string) => {
    try {
      const res = await fetch('/api/scheduled-duties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, note: noteText }),
      });
      const data = await res.json();
      if (data.success) {
        setScheduledNotes(prev => {
          const next = { ...prev };
          if (noteText.trim()) {
            next[dateStr] = noteText.trim();
          } else {
            delete next[dateStr];
          }
          return next;
        });
        setMessage({ type: 'success', text: 'Intervenant prévu enregistré !' });
        setTimeout(() => setMessage(null), 2500);
      }
    } catch (err) {
      console.error("handleSaveScheduledNote error:", err);
      setMessage({ type: 'error', text: 'Erreur lors de l\'enregistrement' });
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const fetchNasStatus = async () => {
    try {
      const res = await fetch('/api/nas-plannings');
      const data = await res.json();
      setNasStatus(data);
      if (data.configuredDir) {
        setCustomNasDir(data.configuredDir);
      }
      const monthStr = format(currentMonth, 'yyyy-MM');
      if (data.files && Array.isArray(data.files)) {
        const match = data.files.find((f: { detectedMonth: string | null; name: string }) => f.detectedMonth === monthStr);
        if (match) {
          setSelectedNasFile(match.name);
        } else if (data.files.length > 0) {
          setSelectedNasFile(prev => prev || data.files[0].name);
        }
      }
    } catch (err) {
      console.error("fetchNasStatus error:", err);
    }
  };

  const handleSyncFromNas = async (specificFile?: string) => {
    setImporting(true);
    setMessage(null);
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const targetFile = specificFile || selectedNasFile || undefined;
      const res = await fetch('/api/nas-plannings/sync-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthStr,
          filename: targetFile
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setShowUploadModal(false);
        await fetchScheduledNotes();
      } else {
        setMessage({ type: 'error', text: data.message || "Erreur lors de la synchronisation depuis le répertoire." });
      }
    } catch (err) {
      console.error("handleSyncFromNas error:", err);
      setMessage({ type: 'error', text: "Erreur de communication avec le serveur." });
    } finally {
      setImporting(false);
    }
  };

  const handleSaveNasDir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNasDir.trim()) return;
    setSavingNasDir(true);
    try {
      const res = await fetch('/api/nas-plannings/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: customNasDir.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: data.exists 
            ? `Répertoire NAS validé ! ${data.fileCount} fichier(s) détecté(s).` 
            : `Répertoire enregistré. Note : Assurez-vous d'avoir monté ce chemin dans docker-compose.yml.`
        });
        await fetchNasStatus();
      } else {
        setMessage({ type: 'error', text: data.message || "Erreur lors de la validation du chemin." });
      }
    } catch (err) {
      setMessage({ type: 'error', text: "Erreur de communication avec le serveur." });
    } finally {
      setSavingNasDir(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserShifts().catch(err => console.error("Effect fetchUserShifts error:", err));
      fetchScheduledNotes().catch(err => console.error("Effect fetchScheduledNotes error:", err));
      if (view === 'summary' || view === 'report') {
        fetchAllShifts().catch(err => console.error("Effect fetchAllShifts error:", err));
      }
      if (view === 'users' && user.username === 'jrb') {
        fetchUsers().catch(err => console.error("Effect fetchUsers error:", err));
      }
      if (user.username === 'jrb') {
        fetchNasStatus().catch(err => console.error("Effect fetchNasStatus error:", err));
      }
    }
  }, [user, currentMonth, view]);

  const [usersList, setUsersList] = useState<User[]>([]);
  const [additionalEmails, setAdditionalEmails] = useState<{id: number, email: string}[]>([]);
  const [emailSettings, setEmailSettings] = useState({
    host: '',
    port: '587',
    user: '',
    pass: '',
    from: ''
  });
  const [bonusSettings, setBonusSettings] = useState({
    threshold1: 9,
    amount1: 30,
    threshold2: 12,
    amount2: 60,
    enabled2: false
  });

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
    setView('report');
  };

  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        setMessage({ type: 'error', text: "Déconnexion automatique après 5 minutes d'inactivité." });
        setTimeout(() => setMessage(null), 5000);
      }, 5 * 60 * 1000); // 5 minutes
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'click'];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsersList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setUsersList([]);
    }
  };

  const fetchAdditionalEmails = async () => {
    try {
      const res = await fetch('/api/additional-emails');
      if (!res.ok) throw new Error('Failed to fetch emails');
      const data = await res.json();
      setAdditionalEmails(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user && view === 'users' && user.username === 'jrb') {
      fetchAdditionalEmails().catch(err => console.error("Effect fetchAdditionalEmails error:", err));
      fetchEmailSettings().catch(err => console.error("Effect fetchEmailSettings error:", err));
      fetchBonusSettings().catch(err => console.error("Effect fetchBonusSettings error:", err));
    }
  }, [user, view]);

  const fetchBonusSettings = async () => {
    try {
      const res = await fetch('/api/admin/bonus-settings');
      if (!res.ok) throw new Error('Failed to fetch bonus settings');
      const data = await res.json();
      setBonusSettings(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      const res = await fetch('/api/admin/email-settings');
      if (!res.ok) throw new Error('Failed to fetch email settings');
      const data = await res.json();
      setEmailSettings({
        host: data.host || '',
        port: data.port || '587',
        user: data.user || '',
        pass: data.pass || '',
        from: data.from || ''
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEmailSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Paramètres email enregistrés !' });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'enregistrement' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSaveBonusSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bonus-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bonusSettings),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Paramètres des primes enregistrés.' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'enregistrement.' });
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    if (!window.confirm('Voulez-vous créer une sauvegarde de la base de données ?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Sauvegarde effectuée !' });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('ATTENTION : Cette opération va écraser les données actuelles par la dernière sauvegarde. Continuer ?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/restore', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Restauration réussie ! L\'application va redémarrer.' });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la restauration' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleAddAdditionalEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    if (!email) return;

    try {
      const res = await fetch('/api/additional-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Email ajouté !' });
        await fetchAdditionalEmails();
        e.currentTarget.reset();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'ajout' });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDeleteAdditionalEmail = async (id: number) => {
    if (!window.confirm('Supprimer cet email ?')) return;
    try {
      const res = await fetch(`/api/additional-emails/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Email supprimé' });
        await fetchAdditionalEmails();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression' });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSendMonthlyReport = async () => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    if (!window.confirm(`Envoyer manuellement le rapport pour ${format(currentMonth, 'MMMM yyyy', { locale: fr })} ?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/send-monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthStr }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Rapport envoyé avec succès !' });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'envoi' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSendIndividualReport = async (userId: number, userName: string) => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    if (!window.confirm(`Envoyer le rapport de ${format(currentMonth, 'MMMM yyyy', { locale: fr })} à ${userName} ?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/send-individual-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, month: monthStr }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'envoi' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleTestEmail = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors du test' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userData = Object.fromEntries(formData.entries());
    
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Intervenant créé !' });
        await fetchUsers();
        e.currentTarget.reset();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Erreur lors de la création' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la création' });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUser) return;
    const formData = new FormData(e.currentTarget);
    const userData = Object.fromEntries(formData.entries());
    
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Intervenant mis à jour !' });
        await fetchUsers();
        // If current user updated themselves, update their session
        if (user && user.id === editingUser.id) {
          const updatedUser = { ...user, ...userData };
          delete (updatedUser as any).password;
          setUser(updatedUser as User);
        }
        setEditingUser(null);
        e.currentTarget.reset();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Erreur lors de la mise à jour' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (passwordForm.new !== passwordForm.confirm) {
      setMessage({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas' });
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Mot de passe modifié avec succès !' });
        setPasswordForm({ current: '', new: '', confirm: '' });
        setTimeout(() => setView('report'), 2000);
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors du changement de mot de passe' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    
    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Profil mis à jour !' });
        setUser({ ...user, email });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cet intervenant ? Cela supprimera également toutes ses gardes passées et futures.')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Intervenant supprimé.' });
        await fetchUsers();
        await fetchAllShifts();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.message || data.error || 'Erreur lors de la suppression' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression' });
    }
  };

  useEffect(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    setScheduledNoteInput(scheduledNotes[dateKey] || '');

    const shift = allShifts.find(s => isSameDay(parseISO(s.date), selectedDate));
    if (shift) {
      setEmergencies(shift.emergencies.toString());
      if (shift.user_id !== user?.id) {
        setOtherUserShift({ name: shift.user_name, code: shift.user_code });
      } else {
        setOtherUserShift(null);
      }
    } else {
      setEmergencies('');
      setOtherUserShift(null);
    }
  }, [selectedDate, allShifts, user, scheduledNotes]);

  const handleClearMonth = async () => {
    if (!user || user.username !== 'jrb') return;
    if (!window.confirm(`Voulez-vous vraiment effacer TOUTES les gardes de ${format(currentMonth, 'MMMM yyyy', { locale: fr })} ?`)) return;

    setLoading(true);
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const res = await fetch(`/api/shifts/month/${monthStr}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Mois réinitialisé avec succès.' });
        await fetchUserShifts();
        await fetchAllShifts();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Échec de la réinitialisation' });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserShifts = async () => {
    if (!user) return;
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const res = await fetch(`/api/user-shifts/${user.id}/${monthStr}`);
      if (!res.ok) throw new Error('Failed to fetch user shifts');
      const data = await res.json();
      setUserShifts(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllShifts = async () => {
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const res = await fetch(`/api/summary/${monthStr}`);
      if (!res.ok) throw new Error('Failed to fetch summary');
      const data = await res.json();
      setAllShifts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setAllShifts([]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
      } else {
        setError(data.message || 'Échec de la connexion');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || emergencies === '') return;
    
    setLoading(true);
    try {
      const val = parseInt(emergencies);
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          emergencies: val,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: val === 0 ? 'Garde effacée.' : 'Garde enregistrée avec succès !' 
        });
        setEmergencies('');
        await fetchUserShifts();
        await fetchAllShifts();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Échec de l\'enregistrement' });
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Échec de l\'enregistrement' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShift = async () => {
    if (!user || !window.confirm('Voulez-vous vraiment supprimer cette garde ?')) return;
    
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/shifts/${user.id}/${dateStr}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Garde supprimée.' });
        await fetchUserShifts();
        await fetchAllShifts();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Échec de la suppression' });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (!Array.isArray(allShifts)) return;
    const doc = new jsPDF();
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: fr });
    
    doc.setFontSize(20);
    doc.text(`Résumé des Gardes - ${monthName}`, 14, 22);
    
    const tableData = allShifts.map(s => [
      format(parseISO(s.date), 'dd/MM/yyyy'),
      s.user_name || 'N/A',
      s.user_code || 'N/A',
      s.emergencies.toString(),
      s.bonus_amount > 0 ? `${s.bonus_amount} €` : '0 €'
    ]);

    const totalBonus = allShifts.reduce((acc, s) => acc + s.bonus_amount, 0);
    const totalPrizedShifts = allShifts.filter(s => s.bonus_amount > 0).length;
    const avgEmergencies = allShifts.length > 0 
      ? (allShifts.reduce((acc, s) => acc + s.emergencies, 0) / allShifts.length).toFixed(1) 
      : '0';

    // Average by day of week
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dayStats: Record<number, { total: number, count: number }> = {};
    allShifts.forEach(s => {
      const day = getDay(parseISO(s.date));
      if (!dayStats[day]) dayStats[day] = { total: 0, count: 0 };
      dayStats[day].total += s.emergencies;
      dayStats[day].count += 1;
    });

    const avgByDay = dayNames.map((name, i) => {
      const stat = dayStats[i];
      return [name, stat ? (stat.total / stat.count).toFixed(1) : '0'];
    });

    // Group by user for the summary
    const userSummary: Record<string, { name: string, code: string, count: number, prized: number, bonus: number, datesPrized: string[] }> = {};
    allShifts.forEach(s => {
      const key = (s.user_id || s.user_name).toString();
      if (!userSummary[key]) {
        userSummary[key] = { name: s.user_name || 'N/A', code: s.user_code || 'N/A', count: 0, prized: 0, bonus: 0, datesPrized: [] };
      }
      userSummary[key].count += 1;
      if (s.bonus_amount > 0) {
        userSummary[key].prized += 1;
        userSummary[key].datesPrized.push(`${format(parseISO(s.date), 'dd/MM')} (${s.emergencies}u)`);
      }
      userSummary[key].bonus += s.bonus_amount;
    });

    const summaryData = Object.values(userSummary).map(u => [
      u.name,
      u.code,
      u.count.toString(),
      u.datesPrized.length > 0 ? u.datesPrized.join(', ') : '-',
      `${u.bonus} €`
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Personnel', 'Code', 'Urgences', 'Prime']],
      body: tableData,
    });

    doc.addPage();
    doc.setFontSize(18);
    doc.text(`Récapitulatif par Personnel - ${monthName}`, 14, 22);

    autoTable(doc, {
      startY: 30,
      head: [['Personnel', 'Code', 'Nb Gardes', 'Dates Primes (Nb Urg.)', 'Total Primes']],
      body: summaryData,
      foot: [['Total Général', '', allShifts.length.toString(), totalPrizedShifts.toString(), `${totalBonus} €`]],
    });

    doc.addPage();
    doc.setFontSize(18);
    doc.text(`Statistiques et Moyennes - ${monthName}`, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Moyenne générale : ${avgEmergencies} urgences / nuit`, 14, 35);

    autoTable(doc, {
      startY: 45,
      head: [['Jour de la semaine', 'Moyenne Urgences']],
      body: avgByDay,
    });

    doc.save(`resume-gardes-${format(currentMonth, 'yyyy-MM')}.pdf`);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
              <Activity className="text-emerald-500 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Portail Garde</h1>
            <p className="text-zinc-400 text-sm mt-1 text-center">Entrez vos identifiants pour gérer vos gardes</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4 py-1.5 px-3 bg-emerald-500/5 border border-emerald-500/10 rounded-full w-fit mx-auto">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Système de base de données actif</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 ml-1">Nom d'utilisateur</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                placeholder="Nom d'utilisateur"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 ml-1">Mot de passe</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 mt-2"
            >
              {loading ? 'Authentification...' : 'Se connecter'}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-xs">Admin : jrb</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Start of week (Monday)
  const startOfFirstWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
  const emptyDaysCount = (monthStart.getDay() + 6) % 7; // Adjust for Monday start

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-bottom border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 flex items-center justify-center rounded-xl shadow-lg shadow-emerald-500/20">
            <Activity className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-none">Suivi des Gardes</h2>
            <p className="text-xs text-zinc-500 mt-1">Connecté en tant que <span className="text-zinc-300 font-medium">{user.name} ({user.code})</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a 
            href="https://drive.google.com/drive/u/0/folders/1f2ZCrNcfab8RqSgcxHQjpy6TufMfHX7G"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-2 rounded-lg transition-all text-xs font-semibold shadow-sm"
            title="Consulter les plannings PDF sur Google Drive"
          >
            <FolderOpen size={16} />
            <span>Google Drive</span>
            <ExternalLink size={12} className="opacity-70" />
          </a>
          {user.username === 'jrb' && (
            <button 
              onClick={() => {
                setUploadMode('file');
                setShowUploadModal(true);
                fetchNasStatus();
              }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/30 px-3 py-2 rounded-lg transition-all text-xs font-bold shadow-md shadow-emerald-900/30"
              title="Importer le planning Excel (fichier direct ou dossier partagé)"
            >
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Planning Excel</span>
              {nasStatus && nasStatus.fileCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
            </button>
          )}
          {user.username === 'jrb' && (
            <button 
              onClick={() => setView(view === 'users' ? 'report' : 'users')}
              className="hidden md:flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg border border-zinc-800 transition-all text-sm"
            >
              <Users size={18} />
              {view === 'users' ? 'Retour' : 'Gestion Intervenants'}
            </button>
          )}
          <button 
            onClick={() => setView(view === 'report' ? 'summary' : 'report')}
            className="hidden md:flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg border border-zinc-800 transition-all text-sm"
          >
            {view === 'report' ? <FileText size={18} /> : <CalendarIcon size={18} />}
            {view === 'report' ? 'Résumé Mensuel' : 'Saisir une Garde'}
          </button>
          <button 
            onClick={generatePDF}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg transition-all text-sm font-semibold shadow-md shadow-emerald-900/20"
            title="Exporter le PDF du mois"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
          <button 
            onClick={() => setView(view === 'profile' ? 'report' : 'profile')}
            className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors"
            title="Paramètres"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
            title="Déconnexion"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-8 relative">
        <AnimatePresence>
          {message && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={cn(
                "fixed top-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-4 rounded-2xl border shadow-2xl min-w-[300px]",
                message.type === 'success' 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 backdrop-blur-md" 
                  : "bg-red-500/10 border-red-500/20 text-red-400 backdrop-blur-md"
              )}
            >
              {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-bold">{message.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {view === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <UserIcon className="text-emerald-500" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Informations</h3>
                    <p className="text-sm text-zinc-500">Vos coordonnées</p>
                  </div>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Nom complet</label>
                    <input 
                      type="text" 
                      disabled
                      value={user.name}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-500 rounded-xl px-4 py-3 cursor-not-allowed" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Email</label>
                    <input 
                      type="email" 
                      name="email"
                      required 
                      defaultValue={user.email}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                      placeholder="votre@email.com"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {loading ? 'Mise à jour...' : 'Enregistrer les modifications'}
                  </button>
                </form>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center">
                    <Settings className="text-zinc-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Sécurité</h3>
                    <p className="text-sm text-zinc-500">Changer de mot de passe</p>
                  </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Ancien mot de passe</label>
                    <input 
                      type="password" 
                      required 
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Nouveau mot de passe</label>
                    <input 
                      type="password" 
                      required 
                      value={passwordForm.new}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Confirmer</label>
                    <input 
                      type="password" 
                      required 
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {loading ? 'Mise à jour...' : 'Changer le mot de passe'}
                  </button>
                </form>
              </div>

              {/* Message was here, removed to be global */}
            </motion.div>
          ) : view === 'users' && user.username === 'jrb' ? (
            <motion.div 
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-1">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl sticky top-24">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                    {editingUser ? <Edit className="text-emerald-500" size={20} /> : <UserPlus className="text-emerald-500" size={20} />}
                    {editingUser ? 'Modifier l\'intervenant' : 'Nouvel Intervenant'}
                  </h3>
                  <form key={editingUser?.id || 'new'} onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Nom Complet</label>
                      <input name="name" defaultValue={editingUser?.name} required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Identifiant (Login)</label>
                      <input name="username" defaultValue={editingUser?.username} required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">
                        Mot de passe {editingUser && <span className="text-[10px] lowercase italic">(laisser vide pour ne pas changer)</span>}
                      </label>
                      <input name="password" type="password" required={!editingUser} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Email</label>
                      <input name="email" type="email" defaultValue={editingUser?.email} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="exemple@mail.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Code (ex: G001)</label>
                      <input name="code" defaultValue={editingUser?.code} required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>
                    <div className="flex gap-3">
                      <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20">
                        {editingUser ? 'Mettre à jour' : 'Ajouter l\'intervenant'}
                      </button>
                      {editingUser && (
                        <button 
                          type="button" 
                          onClick={() => setEditingUser(null)}
                          className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl transition-all"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Users className="text-emerald-500" size={20} />
                      Liste des Intervenants
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-800/50 text-zinc-500 text-xs uppercase font-bold tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Code</th>
                          <th className="px-6 py-4">Nom</th>
                          <th className="px-6 py-4">Email</th>
                          <th className="px-6 py-4">Login</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {!Array.isArray(usersList) || usersList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 italic">
                              Aucun intervenant enregistré pour le moment.
                            </td>
                          </tr>
                        ) : (
                          usersList.map((u) => (
                            <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-6 py-4 font-mono text-emerald-400">{u.code}</td>
                            <td className="px-6 py-4 font-medium text-white">{u.name}</td>
                            <td className="px-6 py-4 text-zinc-400 text-sm">{u.email || '-'}</td>
                            <td className="px-6 py-4 text-zinc-400">{u.username}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => setEditingUser(u)}
                                  className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
                                  title="Modifier"
                                >
                                  <Edit size={16} />
                                </button>
                                {u.email && (
                                  <button 
                                    onClick={() => { handleSendIndividualReport(u.id, u.name).catch(() => {}); }}
                                    disabled={loading}
                                    className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all disabled:opacity-50"
                                    title="Envoyer le rapport mensuel à cet intervenant"
                                  >
                                    <Mail size={16} />
                                  </button>
                                )}
                                {u.username !== 'jrb' && (
                                  <button 
                                    onClick={() => { handleDeleteUser(u.id).catch(() => {}); }}
                                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                    title="Supprimer"
                                  >
                                    <UserMinus size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Additional Emails Section */}
                <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <FileText className="text-emerald-500" size={20} />
                      Destinataires Supplémentaires
                    </h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { handleTestEmail().catch(() => {}); }}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-all border border-zinc-700 text-sm font-bold disabled:opacity-50"
                        title="Envoyer un email de test à vous-même"
                      >
                        <Settings size={16} />
                        Tester la config
                      </button>
                      <button 
                        onClick={() => { handleSendMonthlyReport().catch(() => {}); }}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-xl transition-all border border-emerald-500/20 text-sm font-bold disabled:opacity-50"
                      >
                        <Printer size={16} />
                        Envoyer le rapport
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <form onSubmit={handleAddAdditionalEmail} className="flex gap-3 mb-6">
                      <input 
                        name="email" 
                        type="email" 
                        required 
                        placeholder="Ajouter un email (ex: direction@clinique.fr)" 
                        className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                      />
                      <button type="submit" className="px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20">
                        Ajouter
                      </button>
                    </form>

                    <div className="space-y-2">
                      {additionalEmails.length === 0 ? (
                        <p className="text-center text-zinc-500 italic py-4">Aucun destinataire supplémentaire.</p>
                      ) : (
                        additionalEmails.map((ae) => (
                          <div key={ae.id} className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/50">
                            <span className="text-zinc-300">{ae.email}</span>
                            <button 
                              onClick={() => { handleDeleteAdditionalEmail(ae.id).catch(() => {}); }}
                              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Bonus Configuration Section */}
                <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Activity className="text-amber-500" size={20} />
                      Paramètres des Primes d'Urgence
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 italic">Configurez les seuils d'urgences et les montants des primes associées.</p>
                  </div>
                  <div className="p-6">
                    <form onSubmit={handleSaveBonusSettings} className="space-y-6">
                      <div className="space-y-4">
                        <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                          <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                            Seuil Principal (Niveau 1)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Seuil d'urgences</label>
                              <input 
                                type="number"
                                value={bonusSettings.threshold1}
                                onChange={(e) => setBonusSettings({...bonusSettings, threshold1: parseInt(e.target.value) || 0})}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Montant Prime (€)</label>
                              <input 
                                type="number"
                                value={bonusSettings.amount1}
                                onChange={(e) => setBonusSettings({...bonusSettings, amount1: parseFloat(e.target.value) || 0})}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                              />
                            </div>
                          </div>
                        </div>

                        <div className={cn(
                          "p-4 rounded-xl border transition-all",
                          bonusSettings.enabled2 ? "bg-blue-500/5 border-blue-500/20" : "bg-zinc-800/20 border-zinc-800 opacity-60"
                        )}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2">
                              Seuil Supplémentaire (Niveau 2)
                            </h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={bonusSettings.enabled2} 
                                onChange={(e) => setBonusSettings({...bonusSettings, enabled2: e.target.checked})}
                                className="sr-only peer" 
                              />
                              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Seuil d'urgences</label>
                              <input 
                                type="number"
                                disabled={!bonusSettings.enabled2}
                                value={bonusSettings.threshold2}
                                onChange={(e) => setBonusSettings({...bonusSettings, threshold2: parseInt(e.target.value) || 0})}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Montant Prime (€)</label>
                              <input 
                                type="number"
                                disabled={!bonusSettings.enabled2}
                                value={bonusSettings.amount2}
                                onChange={(e) => setBonusSettings({...bonusSettings, amount2: parseFloat(e.target.value) || 0})}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50" 
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-3 pt-2">
                        <button 
                          type="submit" 
                          disabled={loading}
                          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                        >
                          Enregistrer les règles
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Email Settings Section */}
                <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Settings className="text-emerald-500" size={20} />
                      Configuration Serveur Email
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 italic">Ces paramètres remplacent les variables d'environnement par défaut.</p>
                  </div>
                  <div className="p-6">
                    <form onSubmit={handleSaveEmailSettings} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Serveur SMTP</label>
                          <input 
                            value={emailSettings.host}
                            onChange={(e) => setEmailSettings({...emailSettings, host: e.target.value})}
                            placeholder="ex: smtp.gmail.com"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Port</label>
                          <input 
                            value={emailSettings.port}
                            onChange={(e) => setEmailSettings({...emailSettings, port: e.target.value})}
                            placeholder="ex: 587"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Utilisateur / Email</label>
                          <input 
                            value={emailSettings.user}
                            onChange={(e) => setEmailSettings({...emailSettings, user: e.target.value})}
                            placeholder="ex: votre-email@gmail.com"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Mot de passe / App Password</label>
                          <input 
                            type="password"
                            value={emailSettings.pass}
                            onChange={(e) => setEmailSettings({...emailSettings, pass: e.target.value})}
                            placeholder="••••••••••••••••"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Expéditeur (Nom ou Email)</label>
                          <input 
                            value={emailSettings.from}
                            onChange={(e) => setEmailSettings({...emailSettings, from: e.target.value})}
                            placeholder="ex: Gestion des Gardes <votre-email@gmail.com>"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                          />
                        </div>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button 
                          type="submit" 
                          disabled={loading}
                          className="px-8 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                        >
                          {loading ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Backup & Restore Section */}
                <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Database className="text-blue-500" size={20} />
                      Sauvegarde & Restauration
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 italic">Conservez une copie de sécurité de vos données en cas de problème.</p>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
                        <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                          <Save size={16} className="text-emerald-500" />
                          Créer une sauvegarde
                        </h4>
                        <p className="text-sm text-zinc-400 mb-4">Enregistre l'état actuel de la base de données (utilisateurs, gardes, paramètres).</p>
                        <button 
                          onClick={() => { handleBackup().catch(() => {}); }}
                          disabled={loading}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Save size={18} />
                          Sauvegarder maintenant
                        </button>
                      </div>
                      
                      <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
                        <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                          <RefreshCw size={16} className="text-blue-500" />
                          Restaurer la sauvegarde
                        </h4>
                        <p className="text-sm text-zinc-400 mb-4">Remplace les données actuelles par la dernière sauvegarde effectuée.</p>
                        <button 
                          onClick={() => { handleRestore().catch(() => {}); }}
                          disabled={loading}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={18} />
                          Restaurer la sauvegarde
                        </button>
                      </div>

                      <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700 md:col-span-2">
                        <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                          <Download size={16} className="text-amber-500" />
                          Télécharger la base de données (.db)
                        </h4>
                        <p className="text-sm text-zinc-400 mb-4">Téléchargez le fichier de base de données sur votre ordinateur pour une sécurité maximale ou pour migrer vers votre propre serveur (NAS Synology, etc.).</p>
                        <a 
                          href="/api/admin/download-db"
                          download="guards.db"
                          className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={18} />
                          Télécharger guards.db
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NAS Plannings Directory Configuration Card */}
                <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <HardDrive className="text-indigo-400" size={20} />
                        Répertoire des Plannings sur NAS Synology
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        Lecture automatique des plannings de garde PDF générés dans le dossier partagé de votre NAS.
                      </p>
                    </div>
                    <div>
                      {nasStatus?.exists ? (
                        <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          Accessible ({nasStatus.fileCount} fichier{nasStatus.fileCount > 1 ? 's' : ''})
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                          <AlertCircle size={14} />
                          Prêt pour le montage Docker
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-6 space-y-5">
                    <form onSubmit={handleSaveNasDir} className="space-y-3">
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Chemin absolu du dossier des plannings
                      </label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={customNasDir}
                          onChange={(e) => setCustomNasDir(e.target.value)}
                          placeholder="/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings"
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        <button 
                          type="submit" 
                          disabled={savingNasDir}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 shadow-lg shadow-indigo-600/20"
                        >
                          {savingNasDir ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                          <span>Tester & Enregistrer</span>
                        </button>
                      </div>
                    </form>

                    <div className="bg-zinc-800/40 p-4 rounded-xl border border-zinc-700/60 text-xs text-zinc-400 space-y-2">
                      <p className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-400" />
                        Fonctionnement sur votre NAS Synology :
                      </p>
                      <p>
                        Lorsque l'application de plannings dépose un nouveau PDF dans ce dossier, le Gestionnaire de Gardes le repère automatiquement selon le mois en cours et en extrait les intervenants grâce à l'IA.
                      </p>
                      <p>
                        Configuration dans votre fichier <code>docker-compose.yml</code> :
                      </p>
                      <pre className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-emerald-300 font-mono text-2xs overflow-x-auto select-all">
volumes:
  - "/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings:/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings:ro"
                      </pre>
                    </div>

                    {nasStatus?.exists && nasStatus.files && nasStatus.files.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Derniers fichiers détectés ({nasStatus.files.length}) :
                        </h4>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {nasStatus.files.slice(0, 10).map((file) => (
                            <div key={file.name} className="flex items-center justify-between p-2.5 bg-zinc-800/50 rounded-lg border border-zinc-700/40 text-xs">
                              <span className="font-mono text-zinc-200 flex items-center gap-2">
                                <FileText size={14} className="text-indigo-400" />
                                {file.name}
                              </span>
                              <span className="text-zinc-400">
                                {file.formattedSize} • {file.detectedMonth ? `Mois : ${file.detectedMonth}` : 'Date non détectée'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === 'report' ? (
            <motion.div 
              key="report"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Calendar Section */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <CalendarIcon className="text-emerald-500" size={20} />
                        Calendrier des Gardes
                      </h3>
                      <a 
                        href="https://drive.google.com/drive/folders/1f2ZCrNcfab8RqSgcxHQjpy6TufMfHX7G"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm"
                        title="Consulter les plannings de garde PDF sur Google Drive"
                      >
                        <FolderOpen size={14} />
                        <span>Plannings PDF</span>
                        <ExternalLink size={11} className="opacity-70" />
                      </a>
                      {user.username === 'jrb' && (
                        <button 
                          onClick={() => {
                            setUploadMode('file');
                            setShowUploadModal(true);
                            fetchNasStatus();
                          }}
                          className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm"
                          title="Importer le planning Excel (Admin)"
                        >
                          <FileSpreadsheet size={14} className="text-emerald-400" />
                          <span>Planning Excel</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <span className="text-sm font-semibold min-w-[120px] text-center uppercase tracking-widest">
                        {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                      </span>
                      <button 
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all"
                      >
                        <ChevronRight size={20} />
                      </button>
                      {user.username === 'jrb' && (
                        <button 
                          onClick={() => { handleClearMonth().catch(() => {}); }}
                          className="ml-2 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all border border-transparent hover:border-red-400/20"
                          title="Effacer tout le mois"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                      <div key={day} className="text-center text-[10px] font-bold text-emerald-500 uppercase mb-2">
                        {day}
                      </div>
                    ))}
                    {Array.from({ length: emptyDaysCount }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {days.map(day => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const dayShift = Array.isArray(allShifts) ? allShifts.find(s => isSameDay(parseISO(s.date), day)) : null;
                      const scheduledPerson = scheduledNotes[dayKey];
                      const isSelected = isSameDay(day, selectedDate);
                      const isTodayDate = isToday(day);

                      const specialInfo = getSpecialShiftInfo(day);
                      let tooltipText = `${format(day, 'EEEE d MMMM yyyy', { locale: fr })}${specialInfo.isSpecial ? ` (${specialInfo.reason} - Garde de nuit 19h-07h)` : ''}`;
                      if (dayShift) {
                        tooltipText += ` : Garde déclarée par ${dayShift.user_name} (${dayShift.emergencies} urgence${dayShift.emergencies > 1 ? 's' : ''})`;
                      } else if (scheduledPerson) {
                        tooltipText += ` : Intervenant prévu au planning : ${scheduledPerson}`;
                      }
                      
                      return (
                        <button
                          key={day.toString()}
                          onClick={() => setSelectedDate(day)}
                          title={tooltipText}
                          className={cn(
                            "aspect-square rounded-xl flex flex-col relative transition-all border p-1.5 group text-left",
                            isSelected 
                              ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40" 
                              : dayShift 
                                ? "bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400"
                                : "bg-zinc-800/20 border-zinc-700/30 hover:bg-zinc-800/80 hover:border-amber-500/50 text-zinc-400",
                            isTodayDate && !isSelected && "ring-1 ring-emerald-500/50"
                          )}
                        >
                          <span className="text-xs font-medium absolute top-1.5 left-1.5">{format(day, 'd')}</span>
                          {dayShift ? (
                            <div className="flex-1 flex flex-col items-center justify-center pt-2">
                              <span className="text-lg font-bold text-yellow-400 drop-shadow-sm leading-none">
                                {dayShift.emergencies}
                              </span>
                              <span className="mt-1 text-[10px] font-bold truncate w-full text-center opacity-90 leading-tight text-white/90">
                                {dayShift.user_name}
                              </span>
                            </div>
                          ) : scheduledPerson ? (
                            <div className="flex-1 flex flex-col items-center justify-center pt-2 px-0.5 text-center w-full">
                              {/* Discreet annotation revealed smoothly on hover */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-amber-300 truncate w-full leading-tight flex items-center justify-center gap-0.5 mt-1 bg-zinc-950/90 py-1 px-1 rounded border border-amber-500/30 shadow-md">
                                <UserIcon size={10} className="shrink-0 text-amber-400" />
                                <span className="truncate">{scheduledPerson}</span>
                              </div>
                            </div>
                          ) : null}
                          {dayShift && dayShift.bonus_amount > 0 && (
                            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                          {!dayShift && scheduledPerson && (
                            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400/70 group-hover:bg-amber-400" title={`Prévu au planning : ${scheduledPerson}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold mb-4">Vos dernières gardes</h3>
                  <div className="space-y-3">
                    {userShifts.length === 0 ? (
                      <p className="text-zinc-500 text-sm italic">Aucune garde enregistrée pour ce mois.</p>
                    ) : (
                      userShifts.slice(-5).reverse().map(shift => (
                        <div key={shift.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              shift.bonus_amount > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-700/50 text-zinc-500"
                            )}>
                              {shift.bonus_amount > 0 ? <CheckCircle2 size={20} /> : <Activity size={20} />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{format(parseISO(shift.date), 'EEEE d MMMM', { locale: fr })}</p>
                              <p className="text-xs text-zinc-500">{shift.emergencies} urgences</p>
                            </div>
                          </div>
                          {shift.bonus_amount > 0 && (
                            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/20">
                              +30 € Prime
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Form Section */}
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl sticky top-24">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Plus className="text-emerald-500" size={20} />
                      Saisir Garde
                    </h3>
                    {(userShifts.find(s => isSameDay(parseISO(s.date), selectedDate)) || (user.username === 'jrb' && otherUserShift)) && (
                      <button 
                        onClick={async () => {
                          try {
                            const shiftToDelete = allShifts.find(s => isSameDay(parseISO(s.date), selectedDate));
                            if (!shiftToDelete) return;
                            
                            if (!window.confirm(`Voulez-vous vraiment supprimer la garde de ${shiftToDelete.user_name} le ${format(selectedDate, 'dd/MM/yyyy')} ?`)) return;
                            
                            setLoading(true);
                            const url = `/api/shifts/${shiftToDelete.user_id}/${shiftToDelete.date}`;
                              
                            const res = await fetch(url, {
                              method: 'DELETE',
                            });
                            const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Garde supprimée.' });
        await fetchUserShifts();
        await fetchAllShifts();
        setTimeout(() => setMessage(null), 3000);
      }
                          } catch (err) {
                            console.error("Delete shift error:", err);
                            setMessage({ type: 'error', text: 'Échec de la suppression' });
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        title="Supprimer la saisie"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                  
                  {(() => {
                    const selSpecial = getSpecialShiftInfo(selectedDate);
                    return (
                      <div className="mb-6 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Date Sélectionnée</p>
                          {selSpecial.isSpecial && (
                            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                              {selSpecial.reason} : Garde de Nuit (19h - 07h)
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-semibold text-white capitalize">{format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                        {selSpecial.isSpecial && (
                          <p className="text-xs text-indigo-300/90 mt-1 font-medium italic">
                            * Les dimanches et jours fériés ({selSpecial.reason}), seule la personne effectuant la garde de nuit (19h00 à 07h00) est comptabilisée.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <form onSubmit={handleSubmitShift} className="space-y-6">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Nombre d'Urgences</label>
                      <input 
                        type="number" 
                        min="0"
                        value={emergencies}
                        onChange={(e) => setEmergencies(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        disabled={!!otherUserShift}
                        className={cn(
                          "w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-xl font-mono",
                          otherUserShift && "opacity-50 cursor-not-allowed"
                        )}
                        placeholder="0"
                        required
                      />
                      {otherUserShift ? (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 px-1 flex items-center gap-2 text-red-400 text-sm italic"
                        >
                          <AlertCircle size={14} />
                          Déjà saisi par : <span className="font-medium">{otherUserShift.name}</span> 
                          <span className="bg-zinc-800 text-red-400 px-2 py-0.5 rounded text-[10px] font-mono font-bold ml-1 border border-zinc-700">
                            {otherUserShift.code}
                          </span>
                        </motion.div>
                      ) : (emergencies && emergencies !== '0') ? (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 px-1 flex items-center gap-2 text-zinc-400 text-sm italic"
                        >
                          <UserIcon size={14} className="text-emerald-500" />
                          Saisie pour : <span className="text-white font-medium">{user.name}</span> 
                          <span className="bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-mono font-bold ml-1 border border-zinc-700">
                            {user.code}
                          </span>
                        </motion.div>
                      ) : emergencies === '0' && (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 px-1 flex items-center gap-2 text-red-400 text-sm italic"
                        >
                          <Trash2 size={14} className="text-red-500" />
                          Action : <span className="font-medium">Effacer la garde</span> 
                        </motion.div>
                      )}
                      <p className="text-[10px] text-zinc-500 mt-2 italic">
                        * Les gardes avec {bonusSettings.threshold1} urgences ou plus donnent droit à une prime de {bonusSettings.amount1} €{bonusSettings.enabled2 ? ` (et ${bonusSettings.amount2} € dès ${bonusSettings.threshold2} urgences)` : ''}.
                      </p>

                      {!otherUserShift && !allShifts.find(s => isSameDay(parseISO(s.date), selectedDate)) && scheduledNotes[format(selectedDate, 'yyyy-MM-dd')] && (
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 text-amber-300 font-medium text-xs">
                            <UserIcon size={14} className="text-amber-400" />
                            <span>Intervenant prévu au planning :</span>
                          </div>
                          <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                            {scheduledNotes[format(selectedDate, 'yyyy-MM-dd')]}
                          </span>
                        </motion.div>
                      )}
                    </div>

                    {message && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "flex items-center gap-2 text-sm p-3 rounded-lg border",
                          message.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}
                      >
                        {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{message.text}</span>
                      </motion.div>
                    )}

                    <button 
                      type="submit" 
                      disabled={loading || !!otherUserShift}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                    >
                      {loading ? 'Traitement...' : (emergencies === '0' ? 'Effacer la garde' : 'Enregistrer')}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Résumé Mensuel</h3>
                    <p className="text-zinc-400">{format(currentMonth, 'MMMM yyyy', { locale: fr })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-zinc-800 rounded-lg p-1 border border-zinc-700">
                      <button 
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 transition-all"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button 
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                        className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 transition-all"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <button 
                      onClick={generatePDF}
                      className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg text-sm"
                    >
                      <Printer size={18} />
                      Exporter PDF
                    </button>
                    {user?.username === 'jrb' && (
                      <button 
                        onClick={() => { handleSendMonthlyReport().catch(() => {}); }}
                        disabled={loading}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 text-sm"
                      >
                        <Mail size={18} />
                        Envoyer par Email
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-zinc-800/50 border border-zinc-700/50 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Total Gardes</p>
                    <p className="text-3xl font-bold text-white">{Array.isArray(allShifts) ? allShifts.length : 0}</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Gardes Primées</p>
                    <p className="text-3xl font-bold text-white">
                      {Array.isArray(allShifts) ? allShifts.filter(s => s.bonus_amount > 0).length : 0}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 p-6 rounded-2xl">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Moyenne Urgences / Nuit</p>
                    <p className="text-3xl font-bold text-emerald-400">
                      {Array.isArray(allShifts) && allShifts.length > 0 
                        ? (allShifts.reduce((acc, s) => acc + s.emergencies, 0) / allShifts.length).toFixed(1) 
                        : '0'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                  <div className="bg-zinc-800/30 border border-zinc-700/30 p-6 rounded-2xl">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <BarChart3 size={16} className="text-emerald-500" />
                      Moyenne par Jour de Semaine
                    </h4>
                    <div className="space-y-4">
                      {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((dayName, idx) => {
                        // getDay returns 0 for Sunday, 1 for Monday...
                        const dayIdx = dayName === 'Dimanche' ? 0 : idx + 1;
                        const dayShifts = Array.isArray(allShifts) ? allShifts.filter(s => getDay(parseISO(s.date)) === dayIdx) : [];
                        const avg = dayShifts.length > 0 
                          ? (dayShifts.reduce((acc, s) => acc + s.emergencies, 0) / dayShifts.length).toFixed(1)
                          : '0';
                        const percentage = Math.min(100, (parseFloat(avg) / 15) * 100); // Scale relative to 15 urgences

                        return (
                          <div key={dayName} className="flex items-center gap-4">
                            <span className="text-xs font-medium text-zinc-500 w-20">{dayName}</span>
                            <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                className="h-full bg-emerald-500/50"
                              />
                            </div>
                            <span className="text-sm font-mono font-bold text-white w-10 text-right">{avg}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-2xl flex flex-col justify-center">
                    <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Primes du Mois</p>
                    <p className="text-5xl font-bold text-emerald-400 mb-4">
                      {Array.isArray(allShifts) ? allShifts.reduce((acc, s) => acc + s.bonus_amount, 0) : 0} €
                    </p>
                    <p className="text-sm text-zinc-500 italic">
                      Basé sur {Array.isArray(allShifts) ? allShifts.filter(s => s.bonus_amount > 0).length : 0} gardes primées selon les critères configurés.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto mb-12">
                  <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Users size={20} className="text-emerald-500" />
                    Récapitulatif par Personnel
                  </h4>
                  <table className="w-full text-left border-collapse bg-zinc-800/30 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Personnel</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Code</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Nb Gardes</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Dates Primes (Nb Urg.)</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Tot. Primes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(allShifts) && Object.values(allShifts.reduce((acc: any, s) => {
                        const key = s.user_id || s.user_name;
                        if (!acc[key]) acc[key] = { name: s.user_name, code: s.user_code, count: 0, prized: 0, bonus: 0, datesPrized: [] };
                        acc[key].count += 1;
                        if (s.bonus_amount > 0) {
                          acc[key].prized += 1;
                          acc[key].datesPrized.push(`${format(parseISO(s.date), 'dd/MM')} (${s.emergencies}u)`);
                        }
                        acc[key].bonus += s.bonus_amount;
                        return acc;
                      }, {})).map((u: any, idx) => (
                        <tr key={idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-4 px-4 text-base font-bold text-white">{u.name}</td>
                          <td className="py-4 px-4 text-sm font-mono text-zinc-400">{u.code}</td>
                          <td className="py-4 px-4 text-sm text-center">{u.count}</td>
                          <td className="py-4 px-4 text-sm text-center font-mono text-xs text-zinc-400">
                            {u.datesPrized.length > 0 ? u.datesPrized.join(', ') : '-'}
                          </td>
                          <td className="py-4 px-4 text-sm text-right font-bold text-emerald-400">{u.bonus} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto">
                  <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <CalendarIcon size={20} className="text-emerald-500" />
                    Détail Journalier
                  </h4>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Date</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Personnel</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Code</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Urgences</th>
                        <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Prime</th>
                        {user.username === 'jrb' && <th className="py-4 px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(allShifts) && allShifts.length === 0 ? (
                        <tr>
                          <td colSpan={user.username === 'jrb' ? 6 : 5} className="py-12 text-center text-zinc-500 italic">Aucune donnée disponible pour cette période.</td>
                        </tr>
                      ) : (
                        Array.isArray(allShifts) && allShifts.map((shift) => (
                          <tr key={shift.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                            <td className="py-4 px-4 text-sm font-medium">{format(parseISO(shift.date), 'dd/MM/yyyy')}</td>
                            <td className="py-4 px-4 text-base font-bold text-white">{shift.user_name}</td>
                            <td className="py-4 px-4 text-sm font-mono text-zinc-400">{shift.user_code}</td>
                            <td className="py-4 px-4 text-sm text-center font-mono">{shift.emergencies}</td>
                            <td className="py-4 px-4 text-sm text-right font-bold">
                              {shift.bonus_amount > 0 ? (
                                <span className="text-emerald-400">{shift.bonus_amount} €</span>
                              ) : (
                                <span className="text-zinc-600">0 €</span>
                              )}
                            </td>
                            {user.username === 'jrb' && (
                              <td className="py-4 px-4 text-right">
                                <button 
                                  onClick={async () => {
                                    try {
                                      if (!window.confirm(`Supprimer la garde de ${shift.user_name} le ${format(parseISO(shift.date), 'dd/MM/yyyy')} ?`)) return;
                                      const res = await fetch(`/api/shifts/${shift.user_id}/${shift.date}`, { method: 'DELETE' });
                                      const data = await res.json();
                                      if (data.success) {
                                        await fetchUserShifts();
                                        await fetchAllShifts();
                                        setMessage({ type: 'success', text: 'Garde supprimée' });
                                        setTimeout(() => setMessage(null), 3000);
                                      }
                                    } catch (err) {
                                      console.error("Admin delete shift error:", err);
                                      setMessage({ type: 'error', text: 'Erreur' });
                                    }
                                  }}
                                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Section Gardes Non Saisies */}
                {(() => {
                  const missingDaysInMonth = days.filter(day => {
                    return !Array.isArray(allShifts) || !allShifts.some(s => isSameDay(parseISO(s.date), day));
                  });

                  return (
                    <div className="mt-8 bg-zinc-800/40 border border-amber-500/25 rounded-2xl p-6 shadow-xl">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                          <h4 className="text-lg font-bold text-amber-300 flex items-center gap-2">
                            <FolderOpen size={20} className="text-amber-400" />
                            Jours de Garde Non Saisis ({missingDaysInMonth.length} jour{missingDaysInMonth.length > 1 ? 's' : ''})
                          </h4>
                          <p className="text-xs text-zinc-400 mt-1">
                            Jours pour lesquels aucune garde n'a été déclarée. Retrouvez le nom de l'intervenant d'astreinte sur les plannings PDF officiels.
                          </p>
                        </div>
                        {user.username === 'jrb' && (
                          <button 
                            onClick={() => {
                              setUploadMode('file');
                              setShowUploadModal(true);
                              fetchNasStatus();
                            }}
                            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-900/30 shrink-0"
                          >
                            <FileSpreadsheet size={16} />
                            <span>Importer Planning Excel</span>
                          </button>
                        )}
                      </div>

                      {missingDaysInMonth.length === 0 ? (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-medium flex items-center gap-2">
                          <CheckCircle2 size={18} />
                          Toutes les gardes de ce mois ont été saisies !
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {missingDaysInMonth.map(mDay => {
                            const mDayKey = format(mDay, 'yyyy-MM-dd');
                            const scheduledPerson = scheduledNotes[mDayKey];
                            const mDaySpecial = getSpecialShiftInfo(mDay);

                            return (
                              <div key={mDay.toString()} className="flex flex-col gap-2 p-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl hover:border-amber-500/40 transition-all">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-bold text-white capitalize">{format(mDay, 'EEEE d MMMM', { locale: fr })}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] font-semibold text-amber-400">Garde non saisie</span>
                                      {mDaySpecial.isSpecial && (
                                        <span className="text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.2 rounded border border-indigo-500/30" title={mDaySpecial.reason}>
                                          Nuit 19h-07h
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      setSelectedDate(mDay);
                                      setView('report');
                                    }}
                                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shrink-0"
                                  >
                                    Saisir
                                  </button>
                                </div>

                                 {scheduledPerson && (
                                   <div className="pt-2 border-t border-zinc-700/40 flex items-center gap-1.5 text-xs text-amber-300 font-semibold truncate">
                                     <UserIcon size={13} className="text-amber-400 shrink-0" />
                                     <span className="truncate">Prévu au planning : <strong className="text-white">{scheduledPerson}</strong></span>
                                   </div>
                                 )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav Toggle */}
      <div className="md:hidden fixed bottom-6 right-6 z-20">
        <button 
          onClick={() => setView(view === 'report' ? 'summary' : 'report')}
          className="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-500 transition-all active:scale-95"
        >
          {view === 'report' ? <FileText size={24} /> : <CalendarIcon size={24} />}
        </button>
      </div>

      {/* Modal Import Planning Excel */}
      <AnimatePresence>
        {showUploadModal && user?.username === 'jrb' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            >
              <button 
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Importer le Planning (Excel)</h3>
                  <p className="text-xs text-zinc-400">Mois de {format(currentMonth, 'MMMM yyyy', { locale: fr })} • Traitement local immédiat</p>
                </div>
              </div>

              {/* Toggle Mode */}
              <div className="flex bg-zinc-800 p-1 rounded-xl mb-5 border border-zinc-700/50">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2",
                    uploadMode === 'file' ? "bg-emerald-600 text-white shadow-md" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <FileUp size={14} />
                  <span>Fichier Excel (.xlsx, .csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('nas')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2",
                    uploadMode === 'nas' ? "bg-emerald-600 text-white shadow-md" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <HardDrive size={14} />
                  <span>Dossier NAS / Partagé</span>
                  {nasStatus && nasStatus.fileCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  )}
                </button>
              </div>

              {uploadMode === 'file' ? (
                <form onSubmit={handleImportExcelFile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Sélectionnez votre tableau Excel de planning
                    </label>
                    <div className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/70 bg-zinc-800/40 rounded-xl p-6 text-center transition-all cursor-pointer relative">
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadFile(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {uploadFile ? (
                        <div className="flex flex-col items-center gap-2 text-emerald-400">
                          <CheckCircle2 size={32} />
                          <p className="font-semibold text-sm text-white">{uploadFile.name}</p>
                          <p className="text-xs text-zinc-400">{(uploadFile.size / 1024).toFixed(1)} KB • Fichier prêt à être importé</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-400">
                          <FileSpreadsheet size={32} className="text-emerald-400" />
                          <p className="font-medium text-sm text-white">Cliquez ou glissez-déposez le fichier Excel ici</p>
                          <p className="text-xs text-zinc-500">Formats acceptés : .xlsx, .xls, .csv</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 size={14} />
                      Format officiel pris en charge :
                    </p>
                    <p className="text-zinc-300">
                      Détection automatique de votre grille mensuelle : jours en colonnes, numéro dans la ligne <strong>DATE</strong> et intervenant d'astreinte dans la ligne <strong>NUIT</strong> (avec repli sur GARDE si besoin).
                    </p>
                    <p className="text-zinc-400 text-[11px] italic">
                      Pour les dimanches et jours fériés, la garde de nuit (19h-07h) est automatiquement privilégiée.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowUploadModal(false);
                        setUploadFile(null);
                      }}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-all"
                    >
                      Annuler
                    </button>
                    <button 
                      type="submit" 
                      disabled={importing || !uploadFile}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                    >
                      {importing ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Import en cours...</span>
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Importer le Planning</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* NAS Directory Status Banner */}
                  <div className="p-3 bg-zinc-800/70 border border-zinc-700/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-400 flex items-center gap-1.5">
                        <HardDrive size={14} className="text-emerald-400" />
                        Répertoire des plannings (NAS / Local)
                      </span>
                      <button 
                        type="button" 
                        onClick={() => fetchNasStatus()} 
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-xs transition-colors"
                        title="Rafraîchir la détection des fichiers"
                      >
                        <RefreshCw size={12} />
                        Actualiser
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs bg-zinc-950/80 px-2 py-1 rounded text-emerald-300 font-mono break-all select-all border border-zinc-800">
                        {nasStatus?.configuredDir || "/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings"}
                      </code>
                      {nasStatus?.exists ? (
                        <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-2xs font-semibold rounded-full shrink-0 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          {nasStatus.fileCount} fichier{nasStatus.fileCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-2xs font-semibold rounded-full shrink-0 flex items-center gap-1">
                          <AlertCircle size={11} />
                          En attente Docker
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Auto-detected file for active month */}
                  {(() => {
                    const monthStr = format(currentMonth, 'yyyy-MM');
                    const matchingFile = nasStatus?.files?.find(f => f.detectedMonth === monthStr && f.isExcel);
                    const excelFiles = nasStatus?.files?.filter(f => f.isExcel) || [];

                    if (matchingFile) {
                      return (
                        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl space-y-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                              <CheckCircle2 size={14} />
                              Planning Excel détecté pour {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                            </div>
                            <p className="font-bold text-white text-base mt-1 flex items-center gap-2">
                              <FileSpreadsheet size={18} className="text-emerald-400" />
                              {matchingFile.name}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">
                              Taille : {matchingFile.formattedSize} • Modifié le : {format(new Date(matchingFile.mtime), 'dd/MM/yyyy à HH:mm')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSyncFromNas(matchingFile.name)}
                            disabled={importing}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                          >
                            {importing ? (
                              <>
                                <RefreshCw size={16} className="animate-spin" />
                                <span>Lecture du fichier {matchingFile.name}...</span>
                              </>
                            ) : (
                              <>
                                <Check size={16} />
                                <span>Importer ce planning du mois</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    }

                    if (nasStatus?.exists && excelFiles.length > 0) {
                      return (
                        <div className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                            <FileSpreadsheet size={15} />
                            Fichiers Excel détectés dans le dossier ({excelFiles.length}) :
                          </div>
                          <div className="space-y-2">
                            <select
                              value={selectedNasFile}
                              onChange={(e) => setSelectedNasFile(e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            >
                              {excelFiles.map(f => (
                                <option key={f.name} value={f.name}>
                                  {f.name} ({f.formattedSize})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleSyncFromNas()}
                              disabled={importing || !selectedNasFile}
                              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                            >
                              {importing ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  <span>Import en cours...</span>
                                </>
                              ) : (
                                <>
                                  <Check size={14} />
                                  <span>Importer {selectedNasFile || 'le fichier sélectionné'}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-3 text-xs text-zinc-300">
                        <div className="flex items-center gap-2 font-bold text-amber-300">
                          <AlertCircle size={16} />
                          Dossier NAS / Partagé
                        </div>
                        <p className="leading-relaxed text-zinc-300">
                          Déposez vos fichiers Excel (.xlsx, .csv) directement dans le dossier partagé :
                        </p>
                        <code className="block bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-emerald-300 font-mono text-xs overflow-x-auto select-all">
                          {customNasDir || "/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings"}
                        </code>
                        <form onSubmit={handleSaveNasDir} className="flex gap-2 pt-1">
                          <input
                            type="text"
                            value={customNasDir}
                            onChange={(e) => setCustomNasDir(e.target.value)}
                            placeholder="/volume1/.../plannings"
                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          />
                          <button
                            type="submit"
                            disabled={savingNasDir}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-all disabled:opacity-50 shrink-0"
                          >
                            {savingNasDir ? 'Test...' : 'Valider'}
                          </button>
                        </form>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowUploadModal(false)}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-all"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
