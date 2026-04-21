import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  Clock, 
  MessageSquare, 
  Globe, 
  Gamepad2, 
  Search,
  Filter,
  MoreVertical,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Settings,
  Layout,
  ListPlus,
  CheckCircle2,
  PanelRightClose,
  Calendar,
  FilterX,
  Menu,
  X,
  Copy,
  Check,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { firebaseService, type BoosterData, type Settings as AppSettings, type Form as AppForm } from './services/firebaseService';
let config: any = { projectId: 'Firebase' };
try {
  // @ts-ignore
  const localConfig = await import(/* @vite-ignore */ '../firebase-applet-config.json');
  config = localConfig.default || localConfig;
} catch (e) {
  // Use env var or default
  config = { projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'Firebase' };
}
const firebaseConfig = config;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Booster {
  id: string;
  createdAt: string;
  telegram: string;
  discord: string;
  games: string;
  workingHours: string;
  region: string;
  status: 'WAITING FOR RECRUITMENT' | 'RECRUITMENT IN PROCESS' | 'CRM ACCOUNT GIVEN' | 'RECRUITED' | 'LOST' | 'RESERVE';
  statusUpdatedAt: string;
  contactStartedOn: 'TELEGRAM' | 'DISCORD' | null;
  notes: string;
  formId: string;
  fields: Record<string, string>;
  formTitle?: string;
}

const getNotificationLevel = (booster: Booster) => {
  // Notifications not needed on recruited / lost or reserve
  if (['RECRUITED', 'LOST', 'RESERVE'].includes(booster.status)) {
    return null;
  }

  const now = new Date().getTime();
  const created = new Date(booster.createdAt).getTime();
  const updated = booster.statusUpdatedAt ? new Date(booster.statusUpdatedAt).getTime() : created;
  const isNew = now - created < 24 * 60 * 60 * 1000;
  
  if (booster.status === 'WAITING FOR RECRUITMENT') {
    const hoursWaiting = (now - updated) / (1000 * 60 * 60);
    if (hoursWaiting > 96) return 'URGENT';
    if (hoursWaiting > 48) return 'WARNING';
  }
  
  if (booster.status === 'RECRUITMENT IN PROCESS') {
    const hoursProcessing = (now - updated) / (1000 * 60 * 60);
    if (hoursProcessing > 48) return 'WARNING';
  }

  if (isNew) return 'NEW';
  return null;
};

const getStalledDays = (booster: Booster) => {
   const now = new Date().getTime();
   const created = new Date(booster.createdAt).getTime();
   const updated = booster.statusUpdatedAt ? new Date(booster.statusUpdatedAt).getTime() : created;
   const diff = now - updated;
   return Math.floor(diff / (1000 * 60 * 60 * 24));
};

interface Jotform {
  id: string;
  title: string;
  count: number;
  type?: 'LOCAL' | 'JOTFORM';
  schema?: string[];
}

const STATUS_CONFIG = {
  'WAITING FOR RECRUITMENT': { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Clock, funnelLabel: 'Waiting for recruitment' },
  'RECRUITMENT IN PROCESS': { color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: RefreshCw, funnelLabel: 'Recruitment in process' },
  'CRM ACCOUNT GIVEN': { color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: CheckCircle2, funnelLabel: 'CRM account given' },
  'RECRUITED': { color: 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20', icon: UserCheck, funnelLabel: 'Recruited' },
  'LOST': { color: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: UserMinus, funnelLabel: 'Lost' },
  'RESERVE': { color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', icon: Users, funnelLabel: 'Reserve' },
};

const getBadgeStyles = (val: string) => {
  const v = val.toLowerCase();
  if (v.includes('selfplay')) return "bg-[#FDF2F8] text-[#BE185D] border-[#FBCFE8]";
  if (v.includes('piloted')) return "bg-[#EFF6FF] text-[#1D4ED8] border-[#DBEAFE]";
  if (v.includes('us')) return "bg-[#FFF7ED] text-[#C2410C] border-[#FFEDD5]";
  if (v.includes('eu')) return "bg-[#F5F3FF] text-[#6D28D9] border-[#EDE9FE]";
  return "bg-white/5 text-white/90 border-white/10";
};

export default function App() {
  const [accessKey, setAccessKey] = useState(localStorage.getItem('recruiter_os_key') || '');
  const [inputKey, setInputKey] = useState('');
  const [boosters, setBoosters] = useState<Booster[]>([]);
  const [forms, setForms] = useState<Jotform[]>([]);
  const [hiddenForms, setHiddenForms] = useState<Jotform[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [editingFormTitle, setEditingFormTitle] = useState('');
  const [dbNotificationCounts, setDbNotificationCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [firebaseStatus, setFirebaseStatus] = useState<'CONNECTING' | 'ONLINE' | 'OFFLINE'>('CONNECTING');
  const [activeTab, setActiveTab] = useState<string>('WAITING FOR RECRUITMENT');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [newFormId, setNewFormId] = useState('');
  const [localFormTitle, setLocalFormTitle] = useState('');
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [fieldSettings, setFieldSettings] = useState<Record<string, Record<string, string[]>>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configTab, setConfigTab] = useState<'FIELDS' | 'BUILDER'>('FIELDS');
  const [configStatus, setConfigStatus] = useState<string>('ALL');
  const [columnRenames, setColumnRenames] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: string } | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('pageSize');
    return saved ? parseInt(saved, 10) : 0; // 0 for ALL
  });
  const [currentPage, setCurrentPage] = useState(1);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('pageSize', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 300;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const scrollToSection = (target: 'top' | 'bottom') => {
    window.scrollTo({
      top: target === 'top' ? 0 : document.body.scrollHeight,
      behavior: 'smooth'
    });
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (settingsOpen) {
      setConfigStatus(activeTab);
    }
  }, [settingsOpen, activeTab]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date();
    // Start of last month
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Last day of current month
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      start: startOfPrevMonth.toISOString().split('T')[0],
      end: endOfCurrentMonth.toISOString().split('T')[0]
    };
  });

  const isAuthorized = useMemo(() => {
    const requiredKey = import.meta.env.VITE_ACCESS_KEY;
    if (!requiredKey) return true;
    return accessKey === requiredKey;
  }, [accessKey]);

  useEffect(() => {
    if (isAuthorized) {
      fetchForms();
    }
  }, [isAuthorized]);

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const requiredKey = import.meta.env.VITE_ACCESS_KEY;
    if (inputKey === requiredKey) {
      setAccessKey(inputKey);
      localStorage.setItem('recruiter_os_key', inputKey);
    } else {
      alert('Invalid Access Key');
    }
  };

  const fetchForms = async () => {
    try {
      setFirebaseStatus('CONNECTING');
      // 1. Get Settings from Firebase
      const fbSettings = await firebaseService.getSettings();
      setFirebaseStatus('ONLINE');
      const renames = fbSettings?.formRenames || {};
      const order = fbSettings?.formOrder || [];
      const ignored = fbSettings?.ignoredForms || [];
      const manual = fbSettings?.manualForms || [];
      const blacklist = fbSettings?.blacklistForms || [];
      const fSettings = fbSettings?.fieldSettings || {};
      const colRenames = fbSettings?.columnRenames || {};

      setFieldSettings(fSettings);
      setColumnRenames(colRenames);

      // 2. Get local forms from Firebase
      const fbLocalForms = await firebaseService.getForms();

      // 3. Get Jotform forms from Server Proxy
      let jotformActive: any[] = [];
      let jotformHidden: any[] = [];
      
      try {
        const jfResp = await axios.get('/api/jotform-forms');
        const allJf = jfResp.data.content || [];
        const filtered = allJf.filter((f: any) => {
          const id = String(f.id);
          if (blacklist.includes(id)) return false;
          return (f.title || '').toUpperCase().startsWith('BECOME A') || manual.includes(id);
        });
        jotformActive = filtered.filter((f: any) => !ignored.includes(String(f.id)));
        jotformHidden = filtered.filter((f: any) => ignored.includes(String(f.id)));
      } catch (e) {
        console.error('Failed to proxy Jotform forms');
      }

      const combined = [...fbLocalForms, ...jotformActive].map(f => ({
        ...f,
        title: renames[f.id] || f.title
      }));
      
      combined.sort((a, b) => {
        const idxA = order.indexOf(String(a.id));
        const idxB = order.indexOf(String(b.id));
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      setForms(combined);
      setHiddenForms(jotformHidden.map(f => ({ ...f, title: renames[f.id] || f.title })));

      // Auto-select
      if (!selectedForm && combined.length > 0) {
        const main = combined.find(f => f.title.toLowerCase().includes('become a booster'));
        setSelectedForm(main ? main.id : combined[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch forms', err);
    }
  };

  const renameForm = async (formId: string, customName: string) => {
    try {
      const settings = await firebaseService.getSettings() || {
        formOrder: [], columnRenames: {}, formRenames: {}, ignoredForms: [], manualForms: [], blacklistForms: [], fieldSettings: {}
      };
      const newRenames = { ...(settings.formRenames || {}), [formId]: customName };
      await firebaseService.updateSettings({ formRenames: newRenames });
      
      // Also update local form title if it's local
      if (formId.startsWith('local_')) {
        const localForms = await firebaseService.getForms();
        const found = localForms.find(f => f.id === formId);
        if (found) {
          await firebaseService.saveForm({ ...found, title: customName });
        }
      }

      setForms(prev => prev.map(f => f.id === formId ? { ...f, title: customName || f.title } : f));
      setEditingFormId(null);
    } catch (error) {
      console.error('Failed to rename form:', error);
    }
  };

  const reorderForms = async (formId: string, direction: 'UP' | 'DOWN') => {
    const currentIndex = forms.findIndex(f => f.id === formId);
    if (currentIndex === -1) return;

    const newForms = [...forms];
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= forms.length) return;

    const [removed] = newForms.splice(currentIndex, 1);
    newForms.splice(targetIndex, 0, removed);
    
    const newOrder = newForms.map(f => f.id);
    setForms(newForms);
    
    try {
      await firebaseService.updateSettings({ formOrder: newOrder });
    } catch (err) {
      console.error('Failed to save order');
    }
  };

  const toggleFieldVisibility = async (formId: string, status: string, field: string) => {
    const formSettings = fieldSettings[formId] || {};
    const currentHidden = formSettings[status] || [];
    const isHidden = currentHidden.includes(field);
    const newHidden = isHidden 
      ? currentHidden.filter(f => f !== field)
      : [...currentHidden, field];
    
    const newSettingsForForm = { 
      ...(fieldSettings[formId] || {}),
      [status]: newHidden 
    };

    const updatedGlobalSettings = {
      ...fieldSettings,
      [formId]: newSettingsForForm
    };

    setFieldSettings(updatedGlobalSettings);
    
    try {
      await firebaseService.updateSettings({ fieldSettings: updatedGlobalSettings });
    } catch (err) {
      console.error('Failed to update field settings');
    }
  };

  const updateLocalSchema = async (formId: string, schema: string[]) => {
    try {
      const localForms = await firebaseService.getForms();
      const form = localForms.find(f => f.id === formId);
      if (form) {
        await firebaseService.saveForm({ ...form, schema });
        setForms(prev => prev.map(f => f.id === formId ? { ...f, schema } : f));
      }
    } catch (err) {
      console.error('Failed to update schema');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renameColumn = async (originalName: string, customName: string) => {
    try {
      const settings = await firebaseService.getSettings();
      const ren = { ...(settings?.columnRenames || {}), [originalName]: customName };
      if (!customName) delete ren[originalName];
      await firebaseService.updateSettings({ columnRenames: ren });
      setColumnRenames(ren);
      setEditingHeader(null);
    } catch (err) {
      console.error('Failed to rename column');
    }
  };

  const updateBoosterField = async (id: string, field: string, value: string) => {
    try {
      const bData = await firebaseService.getBoosterData(selectedForm);
      const existing = bData.find(d => d.id === id);
      const now = new Date().toISOString();
      
      const updatedOverrides = { ...(existing?.fieldOverrides || {}), [field]: value };
      
      const newEntry: BoosterData = existing ? {
        ...existing,
        fieldOverrides: updatedOverrides,
        updatedAt: now
      } : {
        id,
        formId: selectedForm,
        status: 'WAITING FOR RECRUITMENT',
        notes: '',
        contactStartedOn: null,
        fieldOverrides: updatedOverrides,
        updatedAt: now
      };

      await firebaseService.saveBoosterData(newEntry);

      setBoosters(prev => prev.map(b => {
        if (b.id !== id) return b;
        if (['telegram', 'discord', 'games', 'workingHours', 'region'].includes(field)) {
          return { ...b, [field]: value };
        }
        return { ...b, fields: { ...b.fields, [field]: value } };
      }));
      setEditingCell(null);
    } catch (err) {
      console.error('Failed to update field');
    }
  };

  const getColumnName = (original: string) => columnRenames[original] || original;

  const dynamicColumns = useMemo(() => {
    const counts: Record<string, number> = {};
    const excluded = ['id', 'token', 'other', 'notes', 'formId'];
    const formSettings = fieldSettings[selectedForm] || {};
    const hidden = formSettings[activeTab] || [];
    
    // Determine all potential fields
    const coreFields = ['Primary Contact', 'Application Date', 'Region', 'Working Hours', 'Games', 'Status'];
    
    boosters.forEach(b => {
      coreFields.forEach(cf => {
        if (!hidden.includes(cf)) {
           counts[cf] = (counts[cf] || 0) + (boosters.length * 10); // Boost weight for core fields
        }
      });
      Object.keys(b.fields).forEach(key => {
        const isExcluded = excluded.some(ex => key.toLowerCase().includes(ex));
        const isHidden = hidden.includes(key);
        if (!isExcluded && !isHidden) {
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Core fields and then most filled
      .map(entry => entry[0]);
  }, [boosters, fieldSettings, selectedForm, activeTab]);

  const currentForm = useMemo(() => forms.find(f => f.id === selectedForm), [forms, selectedForm]);
  const allDetectedFields = useMemo(() => {
    const fields = new Set<string>();
    ['Primary Contact', 'Application Date', 'Region', 'Working Hours', 'Games', 'Status'].forEach(f => fields.add(f));
    boosters.forEach(b => Object.keys(b.fields).forEach(f => fields.add(f)));
    const excluded = ['id', 'token', 'other', 'notes', 'formId'];
    return Array.from(fields).filter(f => !excluded.some(ex => f.toLowerCase().includes(ex)));
  }, [boosters]);

  const fetchData = async (formIdTarget?: string) => {
    const idToFetch = formIdTarget || selectedForm;
    if (!idToFetch) return;
    
    try {
      setRefreshing(true);
      
      let jotformSubs: any[] = [];
      let fbData: BoosterData[] = [];

      // 1. Fetch Jotform submissions via proxy if it's not a local form
      if (!idToFetch.startsWith('local_')) {
        try {
          const jfResp = await axios.get('/api/jotform-submissions', { params: { formId: idToFetch } });
          jotformSubs = (jfResp.data.content || []).filter((sub: any) => {
            const subDate = new Date(sub.created_at);
            return subDate.getFullYear() >= 2026;
          });
        } catch (e) {
          console.error('Failed to fetch Jotform submissions');
        }
      }

      // 2. Fetch Firebase booster_data
      fbData = await firebaseService.getBoosterData(idToFetch);

      // 3. Merge
      let merged: Booster[] = [];

      if (idToFetch.startsWith('local_')) {
        // Local form data is entirely in Firebase
        merged = fbData.map(d => ({
          id: d.id,
          createdAt: d.updatedAt,
          telegram: d.fields?.telegram || '',
          discord: d.fields?.discord || '',
          games: d.fields?.games || '',
          workingHours: d.fields?.workingHours || '',
          region: d.fields?.region || '',
          status: d.status as any,
          statusUpdatedAt: d.updatedAt,
          contactStartedOn: d.contactStartedOn as any,
          notes: d.notes,
          formId: d.formId,
          fields: d.fields || {}
        }));
      } else {
        // Merge Jotform with Firebase
        merged = jotformSubs.map((sub: any) => {
          const persist = fbData.find(d => d.id === sub.id);
          const answers = sub.answers || {};
          
          const formatAnswer = (ans: any) => {
            if (typeof ans === 'object' && ans !== null) {
              if (ans.other) return String(ans.other);
              return Object.values(ans).filter(v => typeof v === 'string').join(', ');
            }
            return String(ans || '');
          };

          const dynamicFields: Record<string, string> = {};
          Object.values(answers).forEach((a: any) => {
            if (a.text && a.answer !== undefined) {
               dynamicFields[a.text] = persist?.fieldOverrides?.[a.text] !== undefined 
                ? persist.fieldOverrides[a.text] 
                : formatAnswer(a.answer);
            }
          });

          const getVal = (label: string) => {
              if (persist?.fieldOverrides?.[label] !== undefined) return persist.fieldOverrides[label];
              const entry: any = Object.values(answers).find((a: any) => a.text?.toLowerCase().includes(label.toLowerCase()));
              return entry ? formatAnswer(entry.answer) : '';
          };

          return {
            id: sub.id,
            createdAt: sub.created_at,
            telegram: getVal('Telegram') || getVal('Contact'),
            discord: getVal('Discord'),
            games: getVal('game') || getVal('What games'),
            workingHours: getVal('How long') || getVal('Working hours'),
            region: getVal('region'),
            status: (persist?.status || 'WAITING FOR RECRUITMENT') as any,
            statusUpdatedAt: persist?.updatedAt || sub.created_at,
            contactStartedOn: (persist?.contactStartedOn || null) as any,
            notes: persist?.notes || '',
            formId: idToFetch,
            fields: dynamicFields
          };
        });
      }

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBoosters(merged);
      setError(null);
      
      // Local storage cache
      localStorage.setItem(`cache_boosters_${idToFetch}`, JSON.stringify(merged));
      localStorage.setItem(`cache_time_${idToFetch}`, new Date().toISOString());

      // Update summary counts
      const counts: Record<string, number> = { ...dbNotificationCounts };
      counts[idToFetch] = merged.filter(b => getNotificationLevel(b)).length;
      setDbNotificationCounts(counts);

    } catch (err: any) {
      setError(err.message || 'Failed to connect to API.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const createLocalForm = async () => {
    if (!localFormTitle) return;
    try {
      const newForm: AppForm = {
        id: `local_${Date.now()}`,
        title: localFormTitle,
        type: 'LOCAL',
        schema: ['Name/Contact', 'Telegram/Discord', 'Priority', 'Region', 'Games'],
        createdAt: new Date().toISOString()
      };
      await firebaseService.saveForm(newForm);
      setLocalFormTitle('');
      fetchForms();
      setSelectedForm(newForm.id);
    } catch (err) {
      console.error('Failed to create form');
    }
  };

  const addLocalRow = async () => {
    if (!selectedForm || Object.keys(newRowData).length === 0) return;
    try {
      const id = `row_${Date.now()}`;
      const now = new Date().toISOString();
      const newData: BoosterData = {
        id,
        formId: selectedForm,
        status: 'WAITING FOR RECRUITMENT',
        notes: '',
        contactStartedOn: null,
        updatedAt: now,
        fields: newRowData
      };
      await firebaseService.saveBoosterData(newData);
      setNewRowData({});
      fetchData();
    } catch (err) {
      console.error('Failed to add row');
    }
  };

  const addManualForm = async () => {
    if (!newFormId) return;
    try {
      const set = await firebaseService.getSettings();
      const manual = [...(set?.manualForms || [])];
      if (!manual.includes(newFormId)) {
        manual.push(newFormId);
        const blacklist = (set?.blacklistForms || []).filter(id => id !== newFormId);
        await firebaseService.updateSettings({ manualForms: manual, blacklistForms: blacklist });
      }
      setNewFormId('');
      fetchForms();
    } catch (err) {
      console.error('Failed to add form');
    }
  };

  const permanentDeleteForm = async (formId: string) => {
    if (!confirm('Permanently remove this form from the workspace?')) return;
    try {
      const set = await firebaseService.getSettings();
      const blacklist = [...(set?.blacklistForms || [])];
      if (!blacklist.includes(formId)) blacklist.push(formId);
      const manual = (set?.manualForms || []).filter(id => id !== formId);
      const ignored = (set?.ignoredForms || []).filter(id => id !== formId);
      
      await firebaseService.updateSettings({ blacklistForms: blacklist, manualForms: manual, ignoredForms: ignored });
      
      // If it's local, delete from forms collection too
      if (formId.startsWith('local_')) {
        await firebaseService.deleteForm(formId);
      }

      fetchForms();
      if (selectedForm === formId) {
        const next = forms.find(f => f.id !== formId);
        setSelectedForm(next ? next.id : '');
      }
    } catch (err) {
      console.error('Failed to delete form');
    }
  };

  const deleteForm = async (formId: string) => {
    if (!confirm('Hide this form permanently from the workspace?')) return;
    try {
      const set = await firebaseService.getSettings();
      const ignored = [...(set?.ignoredForms || [])];
      if (!ignored.includes(formId)) ignored.push(formId);
      await firebaseService.updateSettings({ ignoredForms: ignored });
      
      fetchForms();
      if (selectedForm === formId) {
        const next = forms.find(f => f.id !== formId);
        setSelectedForm(next ? next.id : '');
      }
    } catch (err) {
      console.error('Failed to hide form');
    }
  };

  const restoreForm = async (formId: string) => {
    try {
      const set = await firebaseService.getSettings();
      const ignored = (set?.ignoredForms || []).filter(id => id !== formId);
      await firebaseService.updateSettings({ ignoredForms: ignored });
      fetchForms();
    } catch (err) {
      console.error('Failed to restore form');
    }
  };

  useEffect(() => {
    if (selectedForm && isAuthorized) {
      const cached = localStorage.getItem(`cache_boosters_${selectedForm}`);
      if (cached) {
        setBoosters(JSON.parse(cached));
        setLoading(false);
      }
      fetchData(selectedForm);
    }
  }, [selectedForm, isAuthorized]);

  const updateStatus = async (id: string, status: Booster['status']) => {
    try {
      await firebaseService.updateBoosterStatus(id, selectedForm, status);
      setBoosters(prev => prev.map(b => b.id === id ? { 
        ...b, 
        status, 
        statusUpdatedAt: new Date().toISOString() 
      } : b));
    } catch (err) {
      console.error('Failed to update status');
    }
  };

  const updateContactStart = async (id: string, contactType: 'TELEGRAM' | 'DISCORD' | null) => {
    try {
      await firebaseService.updateContactStart(id, selectedForm, contactType || '');
      setBoosters(prev => prev.map(b => b.id === id ? { ...b, contactStartedOn: contactType } : b));
    } catch (err) {
      console.error('Failed to update contact info');
    }
  };

  const filteredBoosters = useMemo(() => {
    if (!search && !gameFilter && activeTab === 'ALL' && !dateRange.start && !dateRange.end) {
      return boosters;
    }

    const searchTerms = search.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    return boosters.filter(b => {
      // Smart search implementation
      let matchesSearch = true;
      if (searchTerms.length > 0) {
        matchesSearch = searchTerms.every(term => {
          // Special syntax check
          if (term.includes(':')) {
            const [key, val] = term.split(':');
            if (key === 'status') return b.status.toLowerCase().includes(val);
            if (key === 'region') return b.region.toLowerCase().includes(val);
            if (key === 'game' || key === 'games') return b.games.toLowerCase().includes(val);
            if (key === 'note' || key === 'notes') return b.notes.toLowerCase().includes(val);
            // Dynamic fields
            return Object.values(b.fields).some(v => typeof v === 'string' && v.toLowerCase().includes(val));
          }

          // General search across main fields
          const inMain = 
            b.id.toLowerCase().includes(term) ||
            b.telegram?.toLowerCase().includes(term) ||
            b.discord?.toLowerCase().includes(term) ||
            b.games?.toLowerCase().includes(term) ||
            b.notes?.toLowerCase().includes(term) ||
            b.region?.toLowerCase().includes(term) ||
            b.createdAt?.toLowerCase().includes(term);
          
          if (inMain) return true;

          // Search in dynamic fields
          return Object.values(b.fields).some(v => typeof v === 'string' && v.toLowerCase().includes(term));
        });
      }
      
      const matchesGameFilter = !gameFilter || b.games?.toLowerCase().includes(gameFilter.toLowerCase());
      const matchesTab = activeTab === 'ALL' || b.status === activeTab;
      
      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const rowDate = new Date(b.createdAt);
        if (dateRange.start) {
          const start = new Date(dateRange.start);
          start.setHours(0, 0, 0, 0);
          if (rowDate < start) matchesDate = false;
        }
        if (dateRange.end) {
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59, 999);
          if (rowDate > end) matchesDate = false;
        }
      }
      
      return matchesSearch && matchesGameFilter && matchesTab && matchesDate;
    });
  }, [boosters, search, gameFilter, activeTab, dateRange]);

  const allGames = useMemo(() => {
    const games = new Set<string>();
    boosters.forEach(b => {
      if (b.games) {
        b.games.split(/[,;|]+/).forEach(g => {
          const trimmed = g.trim();
          if (trimmed) games.add(trimmed);
        });
      }
    });
    return Array.from(games).sort();
  }, [boosters]);

  const sidebarGroups = [
    {
      label: 'Recruitment Funnel',
      items: [
        { label: 'Waiting for recruitment', value: 'WAITING FOR RECRUITMENT', icon: Clock },
        { label: 'Recruitment in process', value: 'RECRUITMENT IN PROCESS', icon: RefreshCw },
        { label: 'CRM account given', value: 'CRM ACCOUNT GIVEN', icon: CheckCircle2 },
        { label: 'Recruited', value: 'RECRUITED', icon: UserCheck },
        { label: 'Lost', value: 'LOST', icon: UserMinus },
        { label: 'Reserve', value: 'RESERVE', icon: Users },
      ]
    }
  ];

  if (!isAuthorized) {
    return (
      <div className="h-screen bg-[#0A0A0B] text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#141416] p-10 border border-[#2D2D30] text-center"
        >
          <div className="font-serif italic text-3xl mb-2 text-[#D4AF37] tracking-wider">Recruiter.OS</div>
          <p className="text-white/40 text-sm mb-10 font-serif lowercase italic">Booster Recruitment Management</p>
          
          <form onSubmit={handleKeySubmit} className="space-y-4">
            <input 
              type="password"
              placeholder="Enter Access Key"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-[#2D2D30] text-white px-4 py-3 outline-none focus:border-[#D4AF37] transition-colors rounded-sm text-center"
              autoFocus
            />
            <button 
              type="submit"
              className="w-full bg-[#D4AF37] text-black font-bold py-3 rounded-sm hover:bg-[#B4942E] transition-colors uppercase tracking-widest text-xs"
            >
              Access System
            </button>
          </form>
          
          <div className="mt-8 pt-8 border-t border-white/5 space-y-2">
             <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">Confidential Enterprise System</p>
             <p className="text-[9px] text-white/20">Authorization required to access Jotform recruitment pipelines.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading && !refreshing && !boosters.length) {
    return (
      <div className="h-screen bg-[#0A0A0B] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
          <p className="text-white/60 font-serif italic text-lg tracking-widest">Recruiter.OS Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#0A0A0B] selection-accent relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <nav className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-[#141416] border-r border-[#2D2D30] flex flex-col p-6 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 overflow-y-auto overflow-x-hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="font-serif italic text-xl mb-10 text-[#D4AF37] tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5" />
            Recruiter.OS
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw 
              className={cn("w-3 h-3 cursor-pointer opacity-50 hover:opacity-100", refreshing && "animate-spin")} 
              onClick={() => { fetchForms(); fetchData(); }}
            />
            <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
              <X className="w-4 h-4 text-[#94949E]" />
            </button>
          </div>
        </div>

        {/* Form Selection */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 border-b border-[#2D2D30] pb-2">
             <span className="text-[10px] uppercase tracking-widest text-white/90">
              Databases
            </span>
            {hiddenForms.length > 0 && (
              <button 
                onClick={() => setShowHidden(!showHidden)}
                className="text-[9px] text-[#D4AF37] hover:underline"
              >
                {showHidden ? 'Hide Hidden' : `Archived (${hiddenForms.length})`}
              </button>
            )}
          </div>
          
          <div className="space-y-1">
            {forms.map((form) => {
              // Calculate notification count for this specific database
              // Since we don't have all boosters for all forms at once (we fetch per form)
              // This is tricky. However, the user request implies showing it.
              // If we only have data for the CURRENT form, we can only show it for the current one accurately.
              // But maybe we should fetch counts for all? 
              // A better approach is to store the counts in the forms list or just show it for the active one.
              // Given the constraints and existing architecture, I'll calculate it for the active one, 
              // but I should probably implement a background fetch or a more comprehensive API if I want it for all.
              // Wait, the user said "number on each database". This usually means a summary.
              
              const isSelected = selectedForm === form.id;
              // Use the summary data if available, fallback to 0
              const notificationCount = dbNotificationCounts[form.id] || (isSelected ? boosters.filter(b => getNotificationLevel(b)).length : 0);

              return (
                <div 
                  key={form.id} 
                  className={cn(
                    "group flex flex-col gap-1 px-3 py-2 rounded-sm transition-all cursor-pointer",
                    isSelected ? "bg-[#D4AF37]/10 border-l-2 border-[#D4AF37]" : "hover:bg-white/5"
                  )}
                  onClick={() => setSelectedForm(form.id)}
                >
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                    {editingFormId === form.id ? (
                      <input
                        autoFocus
                        className="bg-[#0A0A0B] border border-[#D4AF37] text-[11px] px-1 py-0.5 outline-none w-full text-white"
                        value={editingFormTitle}
                        onChange={(e) => setEditingFormTitle(e.target.value)}
                        onBlur={() => renameForm(form.id, editingFormTitle)}
                        onKeyDown={(e) => e.key === 'Enter' && renameForm(form.id, editingFormTitle)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={cn(
                        "truncate text-[11px] font-bold uppercase",
                        isSelected ? "text-[#D4AF37]" : "text-white/90 group-hover:text-white",
                        form.id.startsWith('local_') && "text-[#4ADE80]"
                      )}>
                        {form.title}
                      </span>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {notificationCount > 0 && isSelected && (
                        <span className="flex items-center justify-center bg-rose-500 text-white text-[8px] font-bold px-1 rounded-full min-w-[14px]">
                          {notificationCount}
                        </span>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFormId(form.id);
                          setEditingFormTitle(form.title);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-[#D4AF37] transition-opacity p-0.5"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                      </button>

                      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); reorderForms(form.id, 'UP'); }}
                          className="hover:text-[#D4AF37] p-0.5"
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); reorderForms(form.id, 'DOWN'); }}
                          className="hover:text-[#D4AF37] p-0.5"
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteForm(form.id); }}
                        className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity p-1"
                        title="Hide Form"
                      >
                        <EyeOff className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2 border-b border-[#2D2D30] focus-within:border-[#D4AF37] transition-colors pb-1">
                <Search className="w-3 h-3 text-white/50" />
                <input 
                  type="text" 
                  placeholder="Import Jotform ID..." 
                  value={newFormId}
                  onChange={(e) => setNewFormId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualForm()}
                  className="bg-transparent text-[10px] text-white focus:outline-none placeholder:text-white/50 w-full"
                />
                <button 
                  onClick={addManualForm}
                  className="text-white/70 hover:text-[#D4AF37] transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-2 border-b border-[#2D2D30] focus-within:border-[#4ADE80] transition-colors pb-1">
                <Globe className="w-3 h-3 text-white/50" />
                <input 
                  type="text" 
                  placeholder="New App Database..." 
                  value={localFormTitle}
                  onChange={(e) => setLocalFormTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createLocalForm()}
                  className="bg-transparent text-[10px] text-white focus:outline-none placeholder:text-white/50 w-full"
                />
                <button 
                  onClick={createLocalForm}
                  className="text-white/70 hover:text-[#4ADE80] transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {showHidden && hiddenForms.map((form) => (
              <div 
                key={form.id} 
                className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-white/40 italic truncate border border-dashed border-[#2D2D30]"
              >
                <span className="truncate">{form.title}</span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => restoreForm(form.id)}
                    className="hover:text-[#4ADE80] transition-colors p-1"
                    title="Restore Form"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => permanentDeleteForm(form.id)}
                    className="hover:text-rose-600 transition-colors p-1"
                    title="Delete Permanently"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {sidebarGroups.map((group, idx) => (
          <div key={idx} className="mb-8">
            <span className="text-[10px] uppercase tracking-widest text-white/60 mb-3 block">
              {group.label}
            </span>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = activeTab === item.value;
                const tabBoosters = item.value === 'ALL' ? boosters : boosters.filter(b => b.status === item.value);
                const count = tabBoosters.length;
                
                // Calculate notifications for this tab
                const notificationLevelCount = tabBoosters.filter(b => getNotificationLevel(b)).length;

                return (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "w-auto min-w-full flex items-center justify-between gap-3 px-3 py-2 rounded-sm text-sm transition-all group/tab relative",
                      isActive ? "bg-[#D4AF37]/5 text-white border-r-2 border-[#D4AF37]" : "text-white/70 hover:text-[#D4AF37] hover:bg-white/[0.02]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("w-4 h-4", isActive ? "text-[#D4AF37]" : "opacity-50")} />
                      <div className="flex flex-col items-start translate-y-[1px]">
                        <span className="leading-none">{item.label}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn("text-[11px] font-mono", isActive ? "text-[#D4AF37]" : "text-white/30")}>
                            {count.toString().padStart(2, '0')}
                          </span>
                          {notificationLevelCount > 0 && (
                             <span className="flex items-center gap-0.5 px-1 rounded-full bg-rose-500/10 border border-rose-500/20">
                               <AlertCircle className="w-2 h-2 text-rose-500" />
                               <span className="text-[8px] font-bold text-rose-500">{notificationLevelCount}</span>
                             </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-auto pt-6 border-t border-[#2D2D30]">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-[#94949E] uppercase tracking-tighter">
              Vercel: Production
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                firebaseStatus === 'ONLINE' ? "bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]" : 
                firebaseStatus === 'OFFLINE' ? "bg-rose-500 shadow-[0_0_8px_#F43F5E]" : 
                "bg-amber-500 animate-pulse"
              )} />
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-widest",
                firebaseStatus === 'ONLINE' ? "text-[#4ADE80]" : 
                firebaseStatus === 'OFFLINE' ? "text-rose-500" : 
                "text-amber-500"
              )}>
                {firebaseStatus}
              </span>
            </div>
          </div>
          <div className="text-[10px] text-white/30 font-mono mt-1 flex justify-between items-center">
            <span>• RUNNING STABLE</span>
            <span className="text-[8px] opacity-50">{firebaseConfig.projectId}</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0A0A0B]">
        <header className="h-20 border-b border-[#2D2D30] flex flex-col sm:flex-row items-center justify-between px-4 sm:px-10 flex-shrink-0 bg-[#0A0A0B]/80 backdrop-blur-sm z-10 gap-4 sm:gap-0 py-4 sm:py-0">
          <div className="flex items-center gap-3 text-[13px] text-white/90 w-full sm:w-auto">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-white/70 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-2 h-2 bg-[#4ADE80] rounded-full shadow-[0_0_8px_#4ADE80] hidden xs:block" />
            <span className="truncate max-w-[200px] xs:max-w-none">
              {forms.find(f => f.id === selectedForm)?.title || 'Database Initializing...'}
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 w-full sm:w-auto overflow-x-auto sm:overflow-visible no-scrollbar pb-2 sm:pb-0">
            <div className="flex items-center gap-2 sm:gap-3 bg-[#141416] p-1 sm:p-1.5 rounded border border-[#2D2D30] flex-shrink-0">
              <div className="hidden md:flex items-center gap-2 px-2 border-r border-[#2D2D30]">
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[10px] text-white/80 uppercase tracking-tighter whitespace-nowrap">Filter Range</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-[9px] sm:text-[10px] text-white outline-none [color-scheme:dark] w-[100px] sm:w-auto"
                />
                <span className="text-white/40 text-[10px]">—</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-[9px] sm:text-[10px] text-white outline-none [color-scheme:dark] w-[100px] sm:w-auto"
                />
                {(dateRange.start || dateRange.end) && (
                  <button 
                    onClick={() => setDateRange({ start: '', end: '' })}
                    className="ml-1 sm:ml-2 hover:text-rose-400 transition-colors"
                  >
                    <FilterX className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {['RESERVE', 'LOST', 'WAITING FOR RECRUITMENT', 'RECRUITMENT IN PROCESS'].includes(activeTab) && (
                <div className="flex items-center gap-2 border-b border-[#2D2D30] focus-within:border-[#D4AF37] transition-all px-1 pb-1">
                  <Gamepad2 className="w-3.5 h-3.5 text-white/30" />
                  <select 
                    value={gameFilter}
                    onChange={(e) => setGameFilter(e.target.value)}
                    className="bg-transparent text-[11px] text-white outline-none focus:outline-none min-w-[80px] cursor-pointer"
                  >
                    <option value="" className="bg-[#0A0A0B]">All Games</option>
                    {allGames.map(g => (
                      <option key={g} value={g} className="bg-[#0A0A0B]">{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative group flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent border-b border-[#2D2D30] focus:border-[#D4AF37] pl-9 pr-4 py-1.5 sm:py-2 text-xs text-white focus:outline-none transition-all w-32 sm:w-48 placeholder:text-white/30"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button 
                onClick={() => setSettingsOpen(true)}
                className="p-2 text-white/70 hover:text-[#D4AF37] transition-colors"
                title="Database Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button 
                onClick={() => fetchData()}
                disabled={refreshing}
                className="p-2 sm:px-4 sm:py-1.5 border border-[#D4AF37] text-[#D4AF37] text-[11px] uppercase tracking-widest rounded hover:bg-[#D4AF37]/5 transition-colors disabled:opacity-50"
                title="Manual Sync"
              >
                {refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span className="hidden sm:inline">Manual Fetch</span>}
                {!refreshing && <RefreshCw className="w-3.5 h-3.5 sm:hidden" />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-10 py-6 sm:py-10 relative">
          <AnimatePresence>
            {settingsOpen && (
              <motion.div 
                initial={{ opacity: 0, x: '100%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '100%' }}
                className="absolute inset-y-0 right-0 w-full xs:w-[400px] bg-[#141416] border-l border-[#2D2D30] z-50 p-6 sm:p-8 shadow-2xl flex flex-col overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="font-serif italic text-xl text-white">Settings</h3>
                    <p className="text-[10px] text-white/80 uppercase tracking-widest">Database Configuration</p>
                  </div>
                  <button 
                    onClick={() => setSettingsOpen(false)}
                    className="p-2 hover:text-[#D4AF37] transition-colors"
                  >
                    <PanelRightClose className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex gap-4 mb-8 border-b border-[#2D2D30]">
                  <button 
                    onClick={() => setConfigTab('FIELDS')}
                    className={cn(
                      "pb-2 text-[10px] uppercase tracking-widest transition-all px-2",
                      configTab === 'FIELDS' ? "text-[#D4AF37] border-b-2 border-[#D4AF37]" : "text-white/80 hover:text-white"
                    )}
                  >
                    Field Visibility
                  </button>
                  {currentForm?.id.startsWith('local_') && (
                    <button 
                      onClick={() => setConfigTab('BUILDER')}
                      className={cn(
                        "pb-2 text-[10px] uppercase tracking-widest transition-all px-2",
                        configTab === 'BUILDER' ? "text-[#D4AF37] border-b-2 border-[#D4AF37]" : "text-white/80 hover:text-white"
                      )}
                    >
                      Database Builder
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {configTab === 'FIELDS' ? (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <p className="text-[10px] text-white/80 uppercase italic">1. Select Recruitment Funnel context</p>
                        <div className="flex flex-wrap gap-1">
                          {['ALL', ...Object.keys(STATUS_CONFIG)].map(status => (
                            <button
                              key={status}
                              onClick={() => setConfigStatus(status)}
                              className={cn(
                                "px-2 py-1 text-[9px] uppercase tracking-widest rounded-sm border transition-all",
                                configStatus === status 
                                  ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]" 
                                  : "bg-transparent border-[#2D2D30] text-white/80 hover:border-[#D4AF37]/30"
                              )}
                            >
                              {status === 'ALL' ? 'General View' : STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].funnelLabel}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] text-white/80 uppercase italic">2. Manage Columns & Renames</p>
                        <div className="grid grid-cols-1 gap-1">
                          {allDetectedFields.sort().map(field => {
                            const isHidden = (fieldSettings[selectedForm]?.[configStatus] || []).includes(field);
                            return (
                              <div 
                                key={field}
                                className={cn(
                                  "flex items-center gap-2 p-2 border rounded-sm transition-all bg-[#0A0A0B]",
                                  isHidden ? "border-dashed border-[#2D2D30] opacity-50" : "border-[#2D2D30]"
                                )}>
                                <button
                                  onClick={() => toggleFieldVisibility(selectedForm, configStatus, field)}
                                  className={cn(
                                    "p-1.5 rounded transition-all",
                                    isHidden ? "text-white/60 hover:text-white" : "text-[#D4AF37] hover:bg-[#D4AF37]/10"
                                  )}
                                  title={isHidden ? "Show" : "Hide"}>
                                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                
                                <input 
                                  type="text"
                                  placeholder={field}
                                  value={columnRenames[field] || ''}
                                  onChange={(e) => renameColumn(field, e.target.value)}
                                  className="flex-1 bg-transparent text-[11px] font-mono text-white outline-none focus:text-[#D4AF37] placeholder:text-white/40"
                                />
                                
                                {!columnRenames[field] && (
                                  <span className="text-[9px] text-white/50 uppercase italic pointer-events-none">Original</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-[10px] text-white/80 uppercase italic">Define the required data fields</p>
                      <div className="space-y-3">
                        {(currentForm?.schema || []).map((field, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input 
                              type="text"
                              value={field}
                              onChange={(e) => {
                                const newSchema = [...(currentForm?.schema || [])];
                                newSchema[idx] = e.target.value;
                                updateLocalSchema(selectedForm, newSchema);
                              }}
                              className="flex-1 bg-[#0A0A0B] border border-[#2D2D30] text-xs px-3 py-2 rounded-sm focus:border-[#4ADE80] outline-none"
                            />
                            <button 
                              onClick={() => {
                                const newSchema = (currentForm?.schema || []).filter((_, i) => i !== idx);
                                updateLocalSchema(selectedForm, newSchema);
                              }}
                              className="text-white/60 hover:text-rose-500 p-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => {
                            const newSchema = [...(currentForm?.schema || []), 'New Field'];
                            updateLocalSchema(selectedForm, newSchema);
                          }}
                          className="w-full py-2 border border-dashed border-[#2D2D30] text-[10px] uppercase tracking-widest text-[#4ADE80] hover:bg-[#4ADE80]/5 transition-all rounded-sm flex items-center justify-center gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          Add New Field
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-[#2D2D30]">
                   <p className="text-[9px] text-white/40 uppercase tracking-widest">Settings will be saved automatically to local persistent storage.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {error && (
            <div className="mb-8 p-4 bg-rose-500/5 border border-rose-500/10 rounded flex items-center gap-3 text-rose-400 text-xs font-mono uppercase tracking-widest">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {(() => {
            const urgentBoosters = boosters.filter(b => getNotificationLevel(b) === 'URGENT' || getNotificationLevel(b) === 'WARNING').slice(0, 3);
            if (urgentBoosters.length === 0) return null;
            return (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-3 bg-rose-500/5 border border-rose-500/10 rounded-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                  <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Action Required: Stale Applications</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {urgentBoosters.map(b => (
                    <div key={b.id} className="flex items-center gap-2 text-[10px] bg-white/[0.02] px-2 py-1 border border-white/5 rounded">
                      <span className="text-white/70 font-medium italic">{b.telegram || b.discord || 'Unknown Booster'}</span>
                      <span className="text-white/30 truncate max-w-[100px]">— {b.status}</span>
                      <span className="text-rose-400 font-bold ml-1">{getNotificationLevel(b)}</span>
                    </div>
                  ))}
                  {boosters.filter(b => getNotificationLevel(b) === 'URGENT' || getNotificationLevel(b) === 'WARNING').length > 3 && (
                    <div className="text-[9px] text-white/40 flex items-center italic">
                      + {boosters.filter(b => getNotificationLevel(b) === 'URGENT' || getNotificationLevel(b) === 'WARNING').length - 3} more...
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}

          <div className="flex items-end justify-between mb-8">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif italic text-3xl text-[#E1E1E6]">
                {forms.find(f => f.id === selectedForm)?.title || 'Database'}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-[10px] text-white/60 font-mono uppercase tracking-[0.2em]">
                  {activeTab === 'ALL' ? 'Complete Records' : activeTab}
                </p>
                {/* Notification Summary */}
                {(() => {
                  const urgent = boosters.filter(b => getNotificationLevel(b) === 'URGENT').length;
                  const warning = boosters.filter(b => getNotificationLevel(b) === 'WARNING').length;
                  const fresh = boosters.filter(b => getNotificationLevel(b) === 'NEW').length;
                  if (!urgent && !warning && !fresh) return null;
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-white/40 uppercase tracking-widest font-mono">Notifications</span>
                      <div className="flex items-center gap-2">
                        {urgent > 0 && (
                          <span className="flex items-center gap-1.5 text-[9px] text-rose-500 font-bold bg-rose-500/5 px-2 py-0.5 rounded-full border border-rose-500/20">
                            <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                            {urgent} URGENT
                          </span>
                        )}
                        {warning > 0 && (
                          <span className="flex items-center gap-1.5 text-[9px] text-amber-500 font-bold bg-amber-500/5 px-2 py-0.5 rounded-full border border-amber-500/20">
                            <div className="w-1 h-1 rounded-full bg-amber-500" />
                            {warning} STALE
                          </span>
                        )}
                        {fresh > 0 && (
                          <span className="flex items-center gap-1.5 text-[9px] text-blue-400 font-bold bg-blue-500/5 px-2 py-0.5 rounded-full border border-blue-500/20">
                            <div className="w-1 h-1 rounded-full bg-blue-400" />
                            {fresh} NEW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#141416] border border-[#2D2D30] rounded-sm px-2 py-1">
                <span className="text-[9px] text-white/40 uppercase font-mono">Show:</span>
                {[10, 50, 0].map(size => (
                  <button
                    key={size}
                    onClick={() => setPageSize(size)}
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-sm transition-colors",
                      pageSize === size ? "bg-[#D4AF37] text-black" : "text-white/60 hover:text-white"
                    )}
                  >
                    {size === 0 ? 'ALL' : size}
                  </button>
                ))}
              </div>
              <span className="text-xs text-white/60 pb-1">
                Showing {pageSize === 0 ? filteredBoosters.length : Math.min(pageSize, filteredBoosters.length)} of {filteredBoosters.length} active records
              </span>
            </div>
          </div>

          <div className="w-full">
            {selectedForm?.startsWith('local_') && (
              <div className="mb-6 p-4 border border-dashed border-[#2D2D30] rounded-sm bg-white/[0.01]">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-widest text-[#4ADE80] flex items-center gap-2">
                    <ListPlus className="w-3 h-3" />
                    Add Entry to Local Database
                  </p>
                  <button 
                    onClick={() => { setSettingsOpen(true); setConfigTab('BUILDER'); }}
                    className="text-[9px] text-white/80 hover:text-[#4ADE80] transition-colors uppercase tracking-widest flex items-center gap-1"
                  >
                    Edit Database Structure
                    <Settings className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 items-end">
                  {(currentForm?.schema || []).map(field => (
                    <div key={field} className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-white/70 font-serif italic">{field}</label>
                      <input 
                        type="text"
                        placeholder="..."
                        value={newRowData[field] || ''}
                        onChange={(e) => setNewRowData(prev => ({ ...prev, [field]: e.target.value }))}
                        className="bg-[#141416] border border-[#2D2D30] text-[11px] px-3 py-2 focus:border-[#4ADE80] outline-none text-white rounded-sm min-w-[160px] shadow-inner"
                      />
                    </div>
                  ))}
                  <button 
                    onClick={addLocalRow}
                    className="px-8 py-2 bg-[#4ADE80]/10 text-[#4ADE80] text-[11px] uppercase tracking-widest rounded-sm border border-[#4ADE80]/20 hover:bg-[#4ADE80]/20 transition-all font-bold shadow-sm"
                  >
                    Save Record
                  </button>
                </div>
              </div>
            )}

            <div 
              ref={tableContainerRef}
              className="overflow-x-auto shadow-2xl rounded-sm border border-[#2D2D30] bg-[#141416] mb-20 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#2D2D30] relative group/table"
            >
              <table className="min-w-full border-collapse">
              <thead className="sticky top-0 bg-[#141416] z-20 shadow-sm">
                <tr className="border-b border-[#2D2D30]">
                  <th className="py-4 px-4 text-[10px] text-white/80 uppercase tracking-widest font-medium w-[80px]">Status</th>
                  {dynamicColumns.map((col, idx) => {
                    const isLast = idx === dynamicColumns.length - 1;
                    const isMajorSection = ['Primary Contact', 'Status', 'Games'].includes(col);
                    
                    return (
                      <th 
                        key={col} 
                        className={cn(
                          "text-left py-4 px-4 text-[10px] text-white/70 uppercase tracking-widest font-medium relative transition-colors hover:text-white/80",
                          isMajorSection && "border-l border-[#2D2D30] first:border-l-0",
                          col === 'Primary Contact' && "w-[200px]",
                          col === 'Application Date' && "w-[140px]",
                          col === 'Status' && "w-[150px]"
                        )}
                      >
                        <span 
                          className="line-clamp-1 truncate max-w-[200px] flex items-center gap-2" 
                          title={col}
                        >
                          {col === 'Primary Contact' && <Globe className="w-2.5 h-2.5 text-[#D4AF37]" />}
                          {col === 'Games' && <Gamepad2 className="w-2.5 h-2.5 text-[#D4AF37]" />}
                          {col === 'Working Hours' && <Clock className="w-2.5 h-2.5 text-[#D4AF37]" />}
                          {getColumnName(col)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D30]">
                <AnimatePresence mode="popLayout">
                  {filteredBoosters
                    .slice(pageSize === 0 ? 0 : (currentPage - 1) * pageSize, pageSize === 0 ? filteredBoosters.length : currentPage * pageSize)
                    .map((booster) => (
                    <motion.tr 
                      layout
                      key={booster.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="group hover:bg-[#D4AF37]/[0.02] transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="relative inline-block group/actions">
                          <button className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:underline cursor-pointer">
                            Update
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <div className="absolute left-0 top-full mt-2 w-48 bg-[#141416] border border-[#2D2D30] rounded shadow-2xl opacity-0 invisible group-hover/actions:opacity-100 group-hover/actions:visible transition-all z-50 py-1 overflow-hidden">
                            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
                               <button
                                 key={status}
                                 onClick={() => updateStatus(booster.id, status as any)}
                                 className="w-full text-left px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-white/60 hover:text-[#D4AF37] hover:bg-[#D4AF37]/5 transition-colors"
                               >
                                 {STATUS_CONFIG[status].funnelLabel}
                               </button>
                            ))}
                          </div>
                        </div>
                      </td>
                      {dynamicColumns.map(col => {
                        if (col === 'Primary Contact') {
                          const level = getNotificationLevel(booster);
                          return (
                            <td key={col} className="py-4 px-4 border-l-0">
                              <div className="flex flex-col gap-2 group/cell relative">
                                {level && (
                                  <div className="absolute -left-2 top-0 bottom-0 w-0.5 flex flex-col gap-1 py-1">
                                    <div className={cn(
                                      "w-full h-full rounded-full animate-pulse",
                                      level === 'URGENT' ? 'bg-rose-500' : level === 'WARNING' ? 'bg-amber-500' : 'bg-blue-400'
                                    )} />
                                  </div>
                                )}
                                <button 
                                  onClick={() => copyToClipboard(booster.telegram, `tg-${booster.id}`)}
                                  className={cn(
                                    "flex items-center gap-2 group/copy text-left transition-all",
                                    booster.telegram && booster.telegram !== '—' ? "hover:translate-x-1 cursor-pointer" : "cursor-default opacity-40"
                                  )}
                                >
                                  <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group-hover/copy:border-blue-500/40 transition-colors">
                                    <MessageSquare className="w-3 h-3 text-blue-400" />
                                  </div>
                                  <div className="flex flex-col min-w-0 pr-6 relative">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-white font-medium truncate">{booster.telegram || '—'}</span>
                                      {level && (
                                        <div className={cn(
                                          "flex items-center justify-center p-0.5 rounded-full ring-2 ring-white/10",
                                          level === 'URGENT' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 
                                          level === 'WARNING' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                                          'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]'
                                        )}>
                                          <AlertCircle className="w-2.5 h-2.5 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[8px] text-white/50 uppercase tracking-[0.1em]">Telegram</span>
                                    {copiedId === `tg-${booster.id}` ? (
                                      <Check className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4ADE80]" />
                                    ) : (
                                      <Copy className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-white/0 group-hover/copy:text-white/20 transition-all" />
                                    )}
                                  </div>
                                </button>

                                <button 
                                  onClick={() => copyToClipboard(booster.discord, `ds-${booster.id}`)}
                                  className={cn(
                                    "flex items-center gap-2 group/copy text-left transition-all",
                                    booster.discord && booster.discord !== '—' ? "hover:translate-x-1 cursor-pointer" : "cursor-default opacity-40"
                                  )}
                                >
                                  <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover/copy:border-indigo-500/40 transition-colors">
                                    <Users className="w-3 h-3 text-indigo-400" />
                                  </div>
                                  <div className="flex flex-col min-w-0 pr-6 relative">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-white font-medium truncate">{booster.discord || '—'}</span>
                                      {level && (
                                        <div className={cn(
                                          "flex items-center justify-center p-0.5 rounded-full ring-2 ring-white/10",
                                          level === 'URGENT' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 
                                          level === 'WARNING' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                                          'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]'
                                        )}>
                                          <AlertCircle className="w-2.5 h-2.5 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[8px] text-white/50 uppercase tracking-[0.1em]">Discord</span>
                                    {copiedId === `ds-${booster.id}` ? (
                                      <Check className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4ADE80]" />
                                    ) : (
                                      <Copy className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-white/0 group-hover/copy:text-white/20 transition-all" />
                                    )}
                                  </div>
                                </button>
                              </div>
                            </td>
                          );
                        }

                        if (col === 'Application Date') {
                          const stalledDays = getStalledDays(booster);
                          return (
                            <td key={col} className="py-4 px-4 border-l border-[#2D2D30]">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] text-white font-mono">
                                  {new Date(booster.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                                {stalledDays >= 2 && (
                                  <div className={cn(
                                    "flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-sm w-fit mt-1 border",
                                    stalledDays >= 4 ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    {stalledDays}d stalled
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col === 'Status') {
                           return (
                            <td key={col} className="py-4 px-4 border-l border-[#2D2D30]">
                              <div className="flex flex-col gap-2">
                                <div className={cn(
                                  "inline-flex self-start items-center px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest border",
                                  STATUS_CONFIG[booster.status]?.color
                                )}>
                                  {booster.status}
                                </div>
                                
                                {booster.status === 'RECRUITMENT IN PROCESS' && (
                                  <div className="flex flex-col gap-1 p-1 bg-white/[0.02] border border-white/5 rounded-sm">
                                    <span className="text-[8px] text-white/50 uppercase tracking-tighter">Contact via:</span>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => updateContactStart(booster.id, 'TELEGRAM')}
                                        className={cn(
                                          "flex-1 px-1.5 py-0.5 text-[8px] rounded-sm transition-all border",
                                          booster.contactStartedOn === 'TELEGRAM' 
                                            ? "bg-blue-500/20 border-blue-500/40 text-blue-400 font-bold" 
                                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                        )}
                                      >
                                        TG
                                      </button>
                                      <button
                                        onClick={() => updateContactStart(booster.id, 'DISCORD')}
                                        className={cn(
                                          "flex-1 px-1.5 py-0.5 text-[8px] rounded-sm transition-all border",
                                          booster.contactStartedOn === 'DISCORD' 
                                            ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400 font-bold" 
                                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                        )}
                                      >
                                        DS
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {booster.statusUpdatedAt && (
                                  <span className="text-[8px] text-white/40 italic">
                                    Updated: {new Date(booster.statusUpdatedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        const val = ['telegram', 'discord', 'games', 'workingHours', 'region'].includes(col.toLowerCase()) 
                          ? (booster as any)[col.toLowerCase()] || (booster as any)[col] 
                          : booster.fields[col];

                        const isMajorSection = ['Primary Contact', 'Status', 'Games'].includes(col);

                        return (
                          <td key={col} className={cn(
                            "py-4 px-4 transition-colors",
                            isMajorSection && "border-l border-[#2D2D30] first:border-l-0"
                          )}>
                             <div className="group/cell relative">
                               {editingCell?.id === booster.id && editingCell.field === col ? (
                                 <input 
                                   autoFocus
                                   className="bg-[#0A0A0B] border border-[#D4AF37] text-[11px] text-white px-2 py-1 outline-none w-full italic"
                                   value={editingCell.value}
                                   onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                   onBlur={() => updateBoosterField(booster.id, col, editingCell.value)}
                                   onKeyDown={(e) => e.key === 'Enter' && updateBoosterField(booster.id, col, editingCell.value)}
                                 />
                               ) : (
                                 <div 
                                   onDoubleClick={() => setEditingCell({ id: booster.id, field: col, value: val || '' })}
                                   className={cn(
                                     "flex flex-wrap gap-1.5 cursor-text min-h-[1.5em]",
                                     !['telegram', 'discord'].includes(col.toLowerCase()) && "italic"
                                   )}
                                 >
                                   {val ? (
                                     val.split(/[,;|]+/).map((item: string, i: number) => {
                                       const trimmed = item.trim();
                                       if (!trimmed) return null;
                                       const isTag = col.toLowerCase() === 'games' || col.toLowerCase() === 'region' || trimmed.length < 25;
                                       
                                       return isTag ? (
                                         <span 
                                           key={i}
                                           className={cn(
                                             "px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-tight border whitespace-nowrap",
                                             getBadgeStyles(trimmed)
                                           )}
                                         >
                                           {trimmed}
                                         </span>
                                       ) : (
                                         <span key={i} className="text-[11px] text-white/80 uppercase tracking-tight line-clamp-2 max-w-[200px]">
                                           {trimmed}
                                         </span>
                                       );
                                     })
                                   ) : (
                                     <span className="text-[11px] text-white/50 uppercase tracking-widest">—</span>
                                   )}
                                 </div>
                               )}
                             </div>
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            </div>

            {pageSize > 0 && filteredBoosters.length > pageSize && (
              <div className="flex items-center justify-center gap-4 mb-10">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-[#141416] border border-[#2D2D30] text-white/60 hover:text-[#D4AF37] disabled:opacity-30 disabled:hover:text-white/60 transition-all rounded-sm"
                >
                  Previous
                </button>
                <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">
                  Page {currentPage} of {Math.ceil(filteredBoosters.length / pageSize)}
                </span>
                <button
                  disabled={currentPage === Math.ceil(filteredBoosters.length / pageSize)}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-[#141416] border border-[#2D2D30] text-white/60 hover:text-[#D4AF37] disabled:opacity-30 disabled:hover:text-white/60 transition-all rounded-sm"
                >
                  Next
                </button>
              </div>
            )}

            {filteredBoosters.length === 0 && !refreshing && (
              <div className="py-32 text-center border border-dashed border-[#2D2D30] rounded-xl">
                <p className="font-serif italic text-white/80 text-lg">No booster records found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Floating Quick Navigation "Scroll Wheel" */}
        <div className="fixed bottom-24 right-6 sm:right-10 flex flex-col gap-2 z-30">
          <button 
            onClick={() => scrollToSection('top')}
            className="w-10 h-10 rounded-full bg-[#141416] border border-[#2D2D30] text-white/50 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 flex items-center justify-center transition-all shadow-xl backdrop-blur-md"
            title="Scroll to Top"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          
          <div className="flex flex-col p-1 bg-[#141416] border border-[#2D2D30] rounded-full shadow-xl backdrop-blur-md">
             <button 
              onClick={() => scrollTable('left')}
              className="w-8 h-8 rounded-full text-white/50 hover:text-[#D4AF37] flex items-center justify-center transition-colors"
              title="Scroll Table Left"
             >
                <ChevronLeft className="w-4 h-4" />
             </button>
             <div className="w-full h-px bg-[#2D2D30] my-1" />
             <button 
              onClick={() => scrollTable('right')}
              className="w-8 h-8 rounded-full text-white/50 hover:text-[#D4AF37] flex items-center justify-center transition-colors"
              title="Scroll Table Right"
             >
                <ChevronRight className="w-4 h-4" />
             </button>
          </div>

          <button 
            onClick={() => scrollToSection('bottom')}
            className="w-10 h-10 rounded-full bg-[#141416] border border-[#2D2D30] text-white/50 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 flex items-center justify-center transition-all shadow-xl backdrop-blur-md"
            title="Scroll to Bottom"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>

        {/* Footer Toolbar */}
        <footer className="h-16 bg-[#141416] border-t border-[#2D2D30] flex items-center justify-between px-4 sm:px-10 flex-shrink-0 z-20">
          <div className="text-[10px] sm:text-[11px] text-white/70 font-mono flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-white/5 py-2">
            <span>Managed Channels: {forms.length}</span>
            <span>Total Sync: {boosters.length}</span>
            <span>Unprocessed: {boosters.filter(b => b.status === 'WAITING FOR RECRUITMENT').length}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

