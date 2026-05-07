import React, { useEffect, useState } from 'react';
import { db, auth, loginWithGoogle, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, increment, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Calendar, Clock, Ticket, Users, FileText, CheckCircle, Plus, LogOut, Mountain, X, RefreshCw, Info, Ban, AlertCircle, Copy, Mail, Sun, Moon, Globe, Maximize, Minimize, BarChart3, Download, PieChart as PieChartIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { translations } from './translations';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isBypass, setIsBypass] = useState(false);
  
  // Data states
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [infoEmailFilter, setInfoEmailFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    // Obtener YYYY-MM-DD en hora local
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(dateFilter);
  const [reportEndDate, setReportEndDate] = useState(dateFilter);
  const [reportFilterType, setReportFilterType] = useState<'visit' | 'creation'>('visit');
  const [filterByVisitDate, setFilterByVisitDate] = useState(true);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('crm-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  const [lang, setLang] = useState<'es' | 'en'>(() => {
    const saved = localStorage.getItem('crm-lang');
    return (saved as 'es' | 'en') || 'es';
  });

  const t = (path: string) => {
    const keys = path.split('.');
    let result: any = translations[lang];
    for (const key of keys) {
      if (result && result[key]) {
        result = result[key];
      } else {
        return path;
      }
    }
    return result;
  };

  const toggleLang = () => {
    const newLang = lang === 'es' ? 'en' : 'es';
    setLang(newLang);
    localStorage.setItem('crm-lang', newLang);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  useEffect(() => {
    if (isReportsOpen) {
      setReportStartDate(dateFilter);
      setReportEndDate(dateFilter);
    }
  }, [isReportsOpen, dateFilter]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('crm-theme', newTheme);
  };
  
  // Login form states
  const [emailInput, setEmailInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');

  // Tooltip helper component
  const Tooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-block ml-1">
      <Info className="w-3 h-3 text-[#C4A484]/50 hover:text-[#C4A484] cursor-help" />
      <div className={`absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-3 border text-[10px] leading-relaxed rounded shadow-2xl z-50 pointer-events-none transition-colors ${
        theme === 'dark' ? 'bg-[#1A1A1A] border-[#C4A484]/30 text-[#E5E2D9]' : 'bg-white border-gray-200 text-gray-700'
      }`}>
        {text}
        <div className={`absolute top-full right-1 border-8 border-transparent transition-colors ${
          theme === 'dark' ? 'border-t-[#1A1A1A]' : 'border-t-white'
        }`}></div>
      </div>
    </div>
  );

  // Abandoned Cart Helper
  const handleAbandonedCartMail = (r: any) => {
    const subject = encodeURIComponent(`Finaliza tu reserva - Cuevas de la Peña de Arias Montano`);
    const body = encodeURIComponent(
      `Hola ${r.customerName},\n\n` +
      `Hemos visto que tienes una reserva pendiente para visitar las Cuevas de la Peña de Arias Montano el día ${r.date} a las ${r.time}.\n\n` +
      `Detalles de la reserva seleccionada:\n` +
      `- Localizador: #${r.localizador}\n` +
      `- Entradas: ${r.totalTickets} (Adultos: ${r.tickets?.adult || 0}, Reducidas: ${r.tickets?.reduced || 0}, Niños gratis: ${r.tickets?.childFree || 0})\n\n` +
      `Si has tenido algún problema con el pago o quieres que te ayudemos a finalizarla, no dudes en responder a este correo.\n\n` +
      `¡Esperamos verte pronto por Alájar!\n\n` +
      `Saludos,\n` +
      `Equipo de Gestión - Cuevas de la Peña`
    );
    window.open(`mailto:${r.customerEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  // Status Badge Helper
  const StatusBadge = ({ r }: { r: any }) => {
    const [timeLeft, setTimeLeft] = useState<string | null>(null);
    const [isUrgent, setIsUrgent] = useState(false);

    useEffect(() => {
      if (r.status !== 'pending' || !r.createdAt) {
        setTimeLeft(null);
        return;
      }

      const interval = setInterval(() => {
        const created = new Date(r.createdAt).getTime();
        const now = new Date().getTime();
        const limit = created + (60 * 60 * 1000);
        const diff = limit - now;

        if (diff <= 0) {
          setTimeLeft("00:00");
          clearInterval(interval);
          return;
        }

        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        
        if (mins < 5) setIsUrgent(true);
        setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }, 1000);

      return () => clearInterval(interval);
    }, [r.status, r.createdAt]);

    return (
      <div className="flex flex-col gap-1 items-start">
        <div className="flex items-center gap-1">
          <span className={`px-2 py-1 text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
            r.status === 'confirmed' 
              ? theme === 'dark' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
            : r.status === 'paid'
              ? theme === 'dark' 
                ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                : 'bg-cyan-50 text-cyan-700 border border-cyan-200 shadow-sm'
              : r.status === 'pending'
                ? theme === 'dark' 
                  ? 'bg-amber-900/40 text-amber-300 shadow-[0_0_8px_rgba(217,119,6,0.3)]' 
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                : theme === 'dark' ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'
          }`}>
            {r.status === 'paid' ? '💰 Pagado' : 
             r.status === 'confirmed' ? '✅ Confirmado' : 
             r.status === 'pending' ? '⏳ Pendiente' : 
             r.status === 'cancelled' ? '🚫 Anulada' : '❌ Fallido'}
          </span>
          {r.status === 'pending' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleAbandonedCartMail(r);
              }}
              className={`p-1 rounded-full transition-all border ${
                theme === 'dark' 
                  ? 'bg-[#1A1A1A] border-[#C4A484]/40 text-[#C4A484] hover:bg-[#C4A484]/20' 
                  : 'bg-white border-amber-200 text-amber-600 hover:bg-amber-50'
              }`}
              title="Enviar Recordatorio (Carrito Abandonado)"
            >
              <Mail className="w-3 h-3" />
            </button>
          )}
        </div>
        {timeLeft && (
          <div className={`text-[9px] font-mono font-bold tracking-widest flex items-center gap-1 px-1 ${
            isUrgent ? 'text-red-500 animate-pulse' : 'text-amber-500/70'
          }`}>
            <Clock className="w-2.5 h-2.5" />
            EXPIRA EN {timeLeft}
          </div>
        )}
      </div>
    );
  };

  // Action Buttons Helper
  const ActionButtons = ({ r }: { r: any }) => (
    <div className="flex items-center gap-2">
      {(r.status === 'pending' || r.status === 'paid') && (
        <button 
          onClick={() => setConfirmModal({ show: true, resId: r.id })}
          className={`p-1 transition-colors ${r.status === 'paid' ? 'text-cyan-400 hover:text-cyan-200' : 'text-emerald-600 hover:text-emerald-400'}`}
          title="Confirmar Manualmente"
        >
          <CheckCircle className="w-5 h-5 lg:w-4 lg:h-4" />
        </button>
      )}
      {(r.status === 'confirmed' || r.status === 'paid' || r.status === 'pending') && (
        <button 
          onClick={() => setCancelModal({ show: true, resId: r.id })}
          className="p-1 hover:text-red-400 text-red-600/50 transition-colors"
          title="Anular Reserva"
        >
          <Ban className="w-5 h-5 lg:w-4 lg:h-4" />
        </button>
      )}
    </div>
  );


  const [cancelModal, setCancelModal] = useState<{show: boolean, resId: string | null}>({ show: false, resId: null });
  const [confirmModal, setConfirmModal] = useState<{show: boolean, resId: string | null}>({ show: false, resId: null });

  // Filtered and Sorted Reservations
  const filteredReservations = allReservations
    .filter(r => {
      // 1. Búsqueda por texto (Nombre, Email, Localizador)
      const matchesSearch = 
        !searchTerm ||
        r.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerPostalCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.localizador?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Filtro por Estado (Ocultamos canceladas por defecto si el filtro es 'all'?) 
      // No, mostramos todo lo que coincida con el estado.
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      
      // 3. Filtro por Email Informativo
      const matchesInfoEmail = infoEmailFilter === 'all' || 
                               (infoEmailFilter === 'sent' ? r.infoEmailSent === true : !r.infoEmailSent);
      
      // 4. Filtro por Fecha de Visita (DÍA ON/OFF)
      const matchesVisitDate = !filterByVisitDate || r.date === dateFilter;
      
      return matchesSearch && matchesStatus && matchesInfoEmail && matchesVisitDate;
    })
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

  const displayedReservations = itemsPerPage === 'all' 
    ? filteredReservations 
    : filteredReservations.slice(0, itemsPerPage);

  // Capacidades actuales basadas EN LA FECHA DE BÚSQUEDA (dateFilter)
  const slots = ['11:00', '12:30', '16:00'];
  const capacities = slots.reduce((acc, slot) => {
    const slotRes = allReservations.filter(r => 
      r.date === dateFilter && r.time === slot && (r.status === 'confirmed' || r.status === 'paid')
    );
    const booked = slotRes.reduce((sum, r) => {
      // Robustez: si totalTickets no existe, sumamos el desglose
      let tickets = Number(r.totalTickets);
      if (isNaN(tickets) || tickets === 0) {
        tickets = Number(r.tickets?.adult || 0) + Number(r.tickets?.reduced || 0) + Number(r.tickets?.childFree || 0);
      }
      return sum + tickets;
    }, 0);
    acc[slot] = { booked, remaining: Math.max(0, 30 - booked) };
    return acc;
  }, {} as Record<string, { booked: number, remaining: number }>);

  const handleConfirmReservation = async (resId: string) => {
    try {
      await updateDoc(doc(db, 'reservations', resId), { 
        status: 'confirmed', 
        confirmedManually: true,
        confirmedAt: new Date().toISOString()
      });
      setConfirmModal({ show: false, resId: null });
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  };

  const handleCancelReservation = async (resId: string) => {
    try {
      const resData = allReservations.find(r => r.id === resId);
      if (!resData) return;

      // 1. Restituir aforo en la colección 'slots'
      const slotId = `${resData.date}_${resData.time}`;
      const slotRef = doc(db, 'slots', slotId);
      
      // Asegurarnos de tener el número de tickets (sumar manualmente si no existe el campo totalTickets)
      let ticketsToRelease = Number(resData.totalTickets || 0);
      if (!ticketsToRelease && resData.tickets) {
        ticketsToRelease = Number(resData.tickets.adult || 0) + Number(resData.tickets.reduced || 0) + Number(resData.tickets.childFree || 0);
      }
      
      try {
        await setDoc(slotRef, { 
          bookedCount: increment(-ticketsToRelease),
          date: resData.date,
          time: resData.time
        }, { merge: true });
      } catch (slotErr) {
        console.error("Error actualizando slot aggregate:", slotErr);
      }

      // 2. Marcar la reserva como cancelada
      await updateDoc(doc(db, 'reservations', resId), { 
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      setCancelModal({ show: false, resId: null });
      alert("Reserva anulada con éxito. El aforo ha sido liberado.");
    } catch (e) {
      console.error("Error al anular:", e);
      alert("Error al anular: " + (e as Error).message);
    }
  };

  // AUTO-CLEANUP DE CARRITOS ABANDONADOS (> 60 MIN)
  const cleanupExpiredPending = async (reservations: any[]) => {
    const now = new Date();
    const expired = reservations.filter(r => {
      if (r.status !== 'pending' || !r.createdAt) return false;
      const created = new Date(r.createdAt);
      const diffMs = now.getTime() - created.getTime();
      return diffMs > 60 * 60 * 1000; // 60 minutos
    });

    if (expired.length === 0) return;

    console.log(`🧹 Iniciando limpieza de ${expired.length} carritos abandonados...`);

    for (const res of expired) {
      try {
        // 1. Liberar aforo
        const slotId = `${res.date}_${res.time}`;
        const slotRef = doc(db, 'slots', slotId);
        
        let ticketsToRelease = Number(res.totalTickets || 0);
        if (!ticketsToRelease && res.tickets) {
          ticketsToRelease = Number(res.tickets.adult || 0) + Number(res.tickets.reduced || 0) + Number(res.tickets.childFree || 0);
        }

        if (ticketsToRelease > 0) {
          await setDoc(slotRef, { 
            bookedCount: increment(-ticketsToRelease)
          }, { merge: true });
        }

        // 2. Anular
        await updateDoc(doc(db, 'reservations', res.id), {
          status: 'cancelled',
          autoCancelled: true,
          cancelledAt: now.toISOString(),
          updatedAt: now.toISOString(),
          notes: 'Anulada automáticamente por exceder 60 min en espera.'
        });
      } catch (err) {
        console.error(`Error en auto-cleanup de ${res.id}:`, err);
      }
    }
  };
  // Modal states
  const [isManualSaleOpen, setIsManualSaleOpen] = useState(false);
  const [manualSaleForm, setManualSaleForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '11:00',
    customerName: '',
    customerEmail: '',
    customerPostalCode: '',
    customerCity: '',
    tickets: { adult: 0, reduced: 0, childFree: 0 }
  });

  // Fetch city for manual sale
  useEffect(() => {
    if (manualSaleForm.customerPostalCode.length === 5) {
      fetch(`https://api.zippopotam.us/es/${manualSaleForm.customerPostalCode}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.places && data.places.length > 0) {
            const place = data.places[0];
            setManualSaleForm(prev => ({...prev, customerCity: `${place['place name']} (${place['state']})`}));
          }
        })
        .catch(() => {});
    } else if (manualSaleForm.customerPostalCode.length < 5) {
      setManualSaleForm(prev => ({...prev, customerCity: ''}));
    }
  }, [manualSaleForm.customerPostalCode]);

  // Modal states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant' | 'system', content: string, hasReport?: boolean, reportData?: any[]}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // Auto-init health check when chat opened
  useEffect(() => {
    if (isChatOpen && chatMessages.length === 0) {
      handleChatSystemCheck().then(message => {
        setChatMessages([{ role: 'assistant', content: message }]);
      });
    }
  }, [isChatOpen]);

  const handleChatSystemCheck = async () => {
    // Simulate check
    setIsChatLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let systemsOk = true;
    let errorComponent = "";
    
    // Logic health check - example
    if (allReservations.some(r => r.status === 'pending' && !r.createdAt)) {
      systemsOk = false;
      errorComponent = "lógica de reservas pendientes";
    }

    setIsChatLoading(false);
    if (systemsOk) {
      return "Todos los sistemas operativos.";
    } else {
      return `Fallo detectado en ${errorComponent}. Contacta con los desarrolladores.`;
    }
  };
    
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    // Búsqueda interna en el CRM local sin llamar a una API externa
    let assistantMsg = "No he podido encontrar información específica sobre tu consulta. Intenta preguntar por las ventas de una fecha (ej: 'ventas del 2026-05-09').";
    let isDataQuery = false;
    let filtered: any[] = [];

    try {
      const queryLower = userMsg.toLowerCase();
      
      if (queryLower.includes('reservas')) {
        isDataQuery = true;
        assistantMsg = `Actualmente hay ${allReservations.length} reservas registradas en el sistema.`;
      } else if (queryLower.includes('entradas') || queryLower.includes('ventas')) {
        // Intentar extraer una fecha (formato YYYY-MM-DD)
        const dateMatch = queryLower.match(/\d{4}-\d{2}-\d{2}/);
        
        // Manejo especial para "9 de mayo" como caso de prueba
        let targetDate = dateMatch ? dateMatch[0] : "";
        if (!targetDate && queryLower.includes('9 de mayo')) {
            targetDate = '2026-05-09';
        }

        if (targetDate) {
            filtered = allReservations.filter(r => r.date === targetDate && (r.status === 'confirmed' || r.status === 'paid'));
            const total = filtered.reduce((sum, r) => sum + (Number(r.totalTickets) || 0), 0);
            isDataQuery = true;
            assistantMsg = `Para el día ${targetDate}, tienes un total de ${total} entradas vendidas repartidas en ${filtered.length} reservas confirmadas.`;
        } else {
             assistantMsg = "Por favor, indica una fecha en formato YYYY-MM-DD para consultar las entradas vendidas.";
        }
      }
      
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: assistantMsg,
        hasReport: isDataQuery,
        reportData: isDataQuery ? filtered : undefined
      }]);
      
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Error procesando consulta local: " + (e as Error).message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = manualSaleForm.tickets.adult + manualSaleForm.tickets.reduced + manualSaleForm.tickets.childFree;
    if (total <= 0) return alert("Selecciona al menos una entrada");
    
    setIsRefreshing(true);
    const orderId = `MAN-${Date.now().toString().slice(-6)}`;
    
    try {
      // Registrar reserva
      await setDoc(doc(db, 'reservations', orderId), {
        localizador: orderId,
        date: manualSaleForm.date,
        time: manualSaleForm.time,
        customerName: manualSaleForm.customerName,
        customerEmail: manualSaleForm.customerEmail || 'mostrador@cuevasdealajar.com',
        customerPostalCode: manualSaleForm.customerPostalCode || '',
        customerCity: manualSaleForm.customerCity || '',
        tickets: manualSaleForm.tickets,
        totalPrice: (manualSaleForm.tickets.adult * 10) + (manualSaleForm.tickets.reduced * 8),
        totalTickets: total,
        status: 'confirmed',
        origin: 'offline',
        source: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Actualizar slot
      const slotId = `${manualSaleForm.date}_${manualSaleForm.time}`;
      const slotRef = doc(db, 'slots', slotId);
      const slotSnap = await getDoc(slotRef);
      if (slotSnap.exists()) {
        await updateDoc(slotRef, { bookedCount: increment(total) });
      } else {
        await setDoc(slotRef, { date: manualSaleForm.date, time: manualSaleForm.time, bookedCount: total });
      }

      setIsManualSaleOpen(false);
      // Reset form
      setManualSaleForm({
        date: new Date().toISOString().split('T')[0],
        time: '11:00',
        customerName: '',
        customerEmail: '',
        customerPostalCode: '',
        customerCity: '',
        tickets: { adult: 0, reduced: 0, childFree: 0 }
      });
      fetchData();
      alert("Venta manual completada con éxito.");
    } catch (error) {
      console.error(error);
      alert("Error en venta manual");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Verify admin
        try {
          const authorizedEmails = [
            'holasolonet@gmail.com', 
            'caballerovazquezrafael@gmail.com', 
            'taquilla@cuevas.com', 
            'taquilla@cuevasdealajar.com',
            'admin@cuevasdealajar.com',
            'cuevasdealajar@gmail.com'
          ];
          const isAuthorizedEmail = u.email && authorizedEmails.some(e => e.toLowerCase() === u.email?.toLowerCase());
          
          if (isAuthorizedEmail) {
            setIsAdmin(true);
            fetchData();
          } else {
            const adminDoc = await getDoc(doc(db, 'admins', u.uid));
            setIsAdmin(adminDoc.exists());
            if (adminDoc.exists()) {
              fetchData();
            }
          }
        } catch (e) {
          console.error(e);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      // Obtenemos todas las reservas para tener la lista completa
      const q = query(collection(db, 'reservations'));
      const snap = await getDocs(q);
      const res = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllReservations(res);
      
      // Lanzar limpieza de expirados
      cleanupExpiredPending(res);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;

    const startListening = () => {
      const q = query(collection(db, 'reservations'));
      unsub = onSnapshot(q, (snap) => {
        const res = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllReservations(res);
      }, (err) => {
        console.error("Error en tiempo real:", err);
      });
    };

    if (isBypass || isAdmin) {
      startListening();
    }

    return () => {
      if (unsub) unsub();
    };
  }, [isAdmin, isBypass]);

  // Reservas filtradas por el día seleccionado (solo para el dashboard de aforo)
  const dayReservations = allReservations.filter(r => 
    r.date === dateFilter && r.status !== 'cancelled' && r.status !== 'failed'
  );


  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Bypass for user who doesn't want to use Google or Firebase Auth Email provider
    if (emailInput === 'admin' && passwordInput === 'Alajar2024!') {
      setIsBypass(true);
      return;
    }

    try {
      await loginWithEmail(emailInput, passwordInput);
    } catch(err: any) {
      alert("Error iniciando sesión. Comprueba que la contraseña es correcta y que has habilitado el proveedor de 'Correo y Contraseña' en Firebase Authentication.");
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return alert("No hay datos para exportar");
    
    // Headers
    const headers = [
      'Localizador', 'Fecha Visita', 'Hora', 'Cliente', 'Email', 'C.P.', 'Ciudad/Provincia',
      'Estado', 'Origen', 'Adultos', 'Reducidas', 'Niños Grat.', 
      'Total Entradas', 'Precio Total', 'Fecha Compra'
    ];
    
    const rows = data.map(r => [
      r.localizador || '',
      r.date || '',
      r.time || '',
      r.customerName || '',
      r.customerEmail || '',
      r.customerPostalCode || '',
      r.customerCity || '',
      r.status || '',
      r.origin || 'online',
      r.tickets?.adult || 0,
      r.tickets?.reduced || 0,
      r.tickets?.childFree || 0,
      r.totalTickets || 0,
      r.totalPrice || 0,
      r.createdAt ? new Date(r.createdAt).toLocaleString() : ''
    ]);
    
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadPDF = (data: any[], filename: string) => {
    if (data.length === 0) return alert("No hay datos para exportar");
    
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Add title
    doc.setFontSize(18);
    doc.text('Informe de Reservas - Monumento Natural Cuevas de Alájar', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Rango: ${reportStartDate} hasta ${reportEndDate} (Filtrado por ${reportFilterType === 'visit' ? 'Día de Visita' : 'Día de Compra'})`, 14, 30);
    
    const headers = [
      'Loc.', 'Visita', 'Hora', 'Cliente', 'Email', 'C.P.', 'Ciudad/Prov.',
      'Estado', 'Adulto', 'Red.', 'Gratis', 
      'Total', 'Precio', 'F. Compra'
    ];
    
    const rows = data.map(r => [
      r.localizador || '',
      r.date || '',
      r.time || '',
      r.customerName || '',
      r.customerEmail || '',
      r.customerPostalCode || '',
      r.customerCity || '',
      r.status || '',
      r.tickets?.adult || 0,
      r.tickets?.reduced || 0,
      r.tickets?.childFree || 0,
      r.totalTickets || 0,
      `${r.totalPrice || 0}€`,
      r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''
    ]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [196, 164, 132] }, // #C4A484
      margin: { top: 40 }
    });

    doc.save(filename);
  };

  const getStats = () => {
    // Filter allReservations based on report date range and type
    const reportData = allReservations.filter(r => {
      let rDate = '';
      if (reportFilterType === 'visit') {
        rDate = r.date || '';
      } else {
        // Extraction from createdAt (timestamp)
        if (r.createdAt) {
          try {
            rDate = new Date(r.createdAt).toISOString().split('T')[0];
          } catch (e) {
            rDate = '';
          }
        }
      }
      
      if (!rDate) return false;
      return rDate >= reportStartDate && rDate <= reportEndDate;
    });

    const stats = {
      status: [
        { name: 'Confirmadas', value: reportData.filter(r => r.status === 'confirmed').length, color: '#10b981' },
        { name: 'Pagadas', value: reportData.filter(r => r.status === 'paid').length, color: '#06b6d4' },
        { name: 'Pendientes', value: reportData.filter(r => r.status === 'pending').length, color: '#f59e0b' },
        { name: 'Canceladas', value: reportData.filter(r => r.status === 'cancelled').length, color: '#ef4444' },
        { name: 'Error', value: reportData.filter(r => r.status === 'failed').length, color: '#6b7280' },
      ],
      tickets: [
        { name: 'Adultos', value: reportData.reduce((acc, r) => acc + (r.tickets?.adult || 0), 0) },
        { name: 'Reducidas', value: reportData.reduce((acc, r) => acc + (r.tickets?.reduced || 0), 0) },
        { name: 'Niños Gratis', value: reportData.reduce((acc, r) => acc + (r.tickets?.childFree || 0), 0) },
      ],
      revenue: reportData
        .filter(r => r.status === 'confirmed' || r.status === 'paid')
        .reduce((acc, r) => acc + (Number(r.totalPrice) || 0), 0),
      totalVisits: reportData
        .filter(r => r.status === 'confirmed' || r.status === 'paid')
        .reduce((acc, r) => acc + (Number(r.totalTickets) || 0), 0),
      reportData // Expose filtered data for export
    };
    
    // Trend data for the selected range
    // If range is too large, we might want to sample or group, but for now we list all days in range
    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    const daysInRange = [];
    let curr = new Date(start);
    
    // Limit to safety (max 60 days for trend visualization to avoid clutter)
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 60) {
      while (curr <= end) {
        daysInRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      // If range is huge, just show last 30 days of that range
      let temp = new Date(end);
      for(let i=0; i<30; i++) {
        daysInRange.unshift(temp.toISOString().split('T')[0]);
        temp.setDate(temp.getDate() - 1);
      }
    }

    const dailyTickData = daysInRange.map(date => {
      const dayRes = reportData.filter(r => r.date === date && (r.status === 'confirmed' || r.status === 'paid'));
      return {
        date: date.split('-').slice(1).join('/'),
        tickets: dayRes.reduce((acc, r) => acc + (Number(r.totalTickets) || 0), 0)
      };
    });

    return { ...stats, dailyData: dailyTickData };
  };

  const setReportPeriod = (period: 'today' | 'week' | 'month' | 'total') => {
    const today = new Date().toISOString().split('T')[0];
    if (period === 'today') {
      setReportStartDate(today);
      setReportEndDate(today);
    } else if (period === 'week') {
      const prev = new Date();
      prev.setDate(prev.getDate() - 7);
      setReportStartDate(prev.toISOString().split('T')[0]);
      setReportEndDate(today);
    } else if (period === 'month') {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      setReportStartDate(prev.toISOString().split('T')[0]);
      setReportEndDate(today);
    } else if (period === 'total') {
      setReportStartDate('2024-01-01');
      setReportEndDate(today);
    }
  };

  const stats = getStats();

  if (loading) return (
    <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0D0D0B] text-[#E5E2D9]' : 'bg-gray-50 text-gray-900'}`}>
      Cargando...
    </div>
  );

  if (!isBypass && (!user || !isAdmin)) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0D0D0B] text-[#E5E2D9]' : 'bg-gray-50 text-gray-900'
      }`}>
        {/* Toggle Theme on Login */}
        <div className="absolute top-6 right-6">
          <button 
            onClick={toggleTheme}
            className={`p-3 rounded-full border transition-all flex items-center gap-2 ${
              theme === 'dark' 
                ? 'bg-[#151515] border-[#E5E2D9]/10 text-[#C4A484] hover:bg-[#E5E2D9]/5' 
                : 'bg-white border-gray-200 text-[#C4A484] hover:bg-gray-100 shadow-sm'
            }`}
            title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px] uppercase font-bold tracking-widest">{theme === 'dark' ? 'CLARO' : 'OSCURO'}</span>
          </button>
        </div>

        <img 
          src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" 
          alt="Panel de Taquilla" 
          className="w-20 h-20 object-contain mb-8"
          referrerPolicy="no-referrer"
        />
        <h1 className="text-3xl font-serif mb-2">Panel de Taquilla</h1>
        <p className={`mb-8 max-w-sm text-center transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/60' : 'text-gray-500'}`}>
          Acceso restringido para el personal de las Cuevas de la Peña de Arias Montano.
        </p>
        
        <div className={`p-6 border w-full max-w-sm mb-6 transition-all ${
          theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10' : 'bg-white border-gray-200 shadow-xl rounded-xl'
        }`}>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className={`block text-[10px] uppercase mb-1 font-bold tracking-widest transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>Usuario / Email</label>
              <input 
                type="text" 
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className={`w-full border p-3 focus:outline-none focus:border-[#C4A484] transition-colors ${
                  theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/20 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-[10px] uppercase mb-1 font-bold tracking-widest transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>Contraseña</label>
              <input 
                type="password" 
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className={`w-full border p-3 focus:outline-none focus:border-[#C4A484] transition-colors ${
                  theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/20 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}
              />
            </div>
            <button 
              type="submit"
              className={`w-full transition-all py-3 font-bold uppercase tracking-widest text-xs border ${
                theme === 'dark' 
                  ? 'bg-[#E5E2D9]/5 hover:bg-[#E5E2D9]/10 border-[#E5E2D9]/20 text-[#E5E2D9]' 
                  : 'bg-[#C4A484] hover:bg-[#A68B6E] text-white border-[#C4A484] shadow-md'
              }`}
            >
              Entrar
            </button>
          </form>
        </div>

        <div className="flex flex-col items-center gap-4">
          <span className={`text-[10px] uppercase tracking-widest font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>O también</span>
          <button 
            onClick={loginWithGoogle}
            className={`px-8 py-3 font-bold uppercase tracking-widest text-xs transition-all shadow-lg ${
              theme === 'dark' 
                ? 'bg-[#C4A484] text-[#0D0D0B] hover:bg-[#b09376]' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Acceder con Google
          </button>
        </div>
      </div>
    );
  }

  // Aggregate capacities from dayReservations for active dashboard
  const canSeeReports = ['cinside.info@gmail.com', 'holasolonet@gmail.com'].includes(user?.email || '') || isBypass;

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      theme === 'dark' ? 'bg-[#0D0D0B] text-[#E5E2D9]' : 'bg-gray-50 text-gray-900'
    }`}>
      <nav className={`border-b px-4 lg:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 ${
        theme === 'dark' ? 'border-[#E5E2D9]/10 bg-[#151515]' : 'border-gray-200 bg-white shadow-sm'
      }`}>
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <img 
              src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" 
              alt="Isotipo" 
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className={`font-serif text-xl tracking-wide ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>Panel Taquilla</span>
          </div>
          
          {/* Mobile Theme Logout */}
          <div className="flex md:hidden items-center gap-2">
            {canSeeReports && (
              <button 
                onClick={() => setIsReportsOpen(true)}
                className={`p-2 rounded-full transition-all border ${
                  theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#C4A484]' : 'bg-gray-50 border-gray-200 text-[#C4A484]'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all border ${
                theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#C4A484]' : 'bg-gray-50 border-gray-200 text-[#C4A484]'
              }`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => isBypass ? setIsBypass(false) : logout()} 
              className="p-2 text-red-500/50 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleLang}
              className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 shadow-sm ${
                theme === 'dark' 
                  ? 'bg-[#1A1A1A] border-[#C4A484]/20 text-[#C4A484] hover:bg-[#C4A484]/10' 
                  : 'bg-white border-gray-200 text-[#C4A484] hover:bg-gray-50'
              }`}
              title={lang === 'es' ? 'Switch to English' : 'Pasar a Español'}
            >
              <Globe className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{lang === 'es' ? 'ES' : 'EN'}</span>
            </button>

            <button 
              onClick={toggleFullscreen}
              className={`p-1.5 rounded-full border transition-all flex items-center gap-2 shadow-sm ${
                theme === 'dark' 
                  ? 'bg-[#1A1A1A] border-[#C4A484]/20 text-[#C4A484] hover:bg-[#C4A484]/10' 
                  : 'bg-white border-gray-200 text-[#C4A484] hover:bg-gray-50'
              }`}
              title={isFullscreen ? 'Salir' : 'Max'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {canSeeReports && (
              <button 
                onClick={() => setIsReportsOpen(true)}
                className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-[#1A1A1A] border-[#C4A484]/20 text-[#C4A484] hover:bg-[#C4A484]/10' 
                    : 'bg-white border-gray-200 text-[#C4A484] hover:bg-gray-50'
                }`}
                title="Informes y Estadísticas"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden lg:inline text-[10px] font-black uppercase tracking-widest">Informes</span>
              </button>
            )}
          </div>

          <button 
            onClick={toggleTheme}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 shadow-sm ${
              theme === 'dark' 
                ? 'bg-[#1A1A1A] border-[#C4A484]/20 text-[#C4A484] hover:bg-[#C4A484]/10' 
                : 'bg-white border-gray-300 text-[#C4A484] hover:bg-gray-50'
            }`}
            title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
          </button>

          <div className="hidden md:flex items-center gap-4 border-l pl-4 border-gray-500/20">
            <span className={`font-mono text-[11px] font-bold ${theme === 'dark' ? 'text-[#E5E2D9]/70' : 'text-gray-500'}`}>
              <Users className="w-3.5 h-3.5 inline mr-1.5 opacity-70" />
              {isBypass ? 'Administrador Local' : user?.email}
            </span>
          </div>

          <button 
            onClick={() => {
              if (isBypass) setIsBypass(false);
              else logout();
            }} 
            className="text-[#c48484] hover:text-red-400 flex items-center gap-1 font-black uppercase text-[10px] tracking-widest pl-2 border-l border-gray-500/20"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
            <div>
              <h2 className={`text-2xl font-serif mb-1 ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>Gestión de Aforos y Reservas</h2>
              <p className={theme === 'dark' ? 'text-[#E5E2D9]/60 text-sm' : 'text-gray-500 text-sm'}>Visualiza las ventas online y registra entradas vendidas in-situ.</p>
            </div>
            
            <div className={`flex flex-wrap items-center gap-4 p-2 border transition-colors ${
              theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10' : 'bg-white border-gray-200 shadow-sm'
            }`}>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-[#C4A484] mb-1 font-bold">Fecha de Consulta (Aforos)</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className={`p-2 text-xs focus:outline-none border transition-colors ${
                      theme === 'dark' 
                        ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9] [&::-webkit-calendar-picker-indicator]:invert [color-scheme:dark]' 
                        : 'bg-white border-gray-200 text-gray-900'
                    }`}
                  />
                  <button 
                    onClick={fetchData}
                    disabled={isRefreshing}
                    className="bg-[#C4A484]/10 border border-[#C4A484]/30 p-2 text-[#C4A484] hover:bg-[#C4A484]/20 transition-colors disabled:opacity-50"
                    title="Actualizar datos"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <button 
                    onClick={() => {
                        const data = allReservations.filter(r => r.date === dateFilter && (r.status === 'confirmed' || r.status === 'paid'));
                        downloadPDF(data, `taquilla_${dateFilter}.pdf`);
                    }}
                    className="bg-emerald-500/10 border border-emerald-500/30 p-2 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                    title="Exportar Taquilla PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <div className={`flex flex-col border-l pl-4 ${theme === 'dark' ? 'border-[#E5E2D9]/10' : 'border-gray-200'}`}>
                <span className={`text-[9px] uppercase tracking-widest mb-1 font-bold ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>Filtro Listado</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterByVisitDate(!filterByVisitDate)}
                    className={`px-4 py-2 text-[10px] font-bold uppercase transition-all flex items-center gap-2 border ${
                      filterByVisitDate 
                        ? 'bg-[#C4A484] border-[#C4A484] text-[#0D0D0B]' 
                        : theme === 'dark' 
                          ? 'bg-[#E5E2D9]/5 text-[#E5E2D9]/50 border-[#E5E2D9]/10 hover:bg-[#E5E2D9]/10' 
                          : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {filterByVisitDate ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {filterByVisitDate ? 'Filtro Registro: ON' : 'Filtro Registro: OFF'}
                  </button>
                  <Tooltip text="ON: Muestra solo las reservas para el día de visita consultado. OFF: Muestra todas las reservas." />
                </div>
              </div>
            </div>
          </div>

          <div className={`flex flex-wrap items-center gap-3 mb-8 p-4 border-b transition-colors ${
            theme === 'dark' ? 'bg-[#151515]/50 border-[#E5E2D9]/10' : 'bg-gray-100/50 border-gray-200'
          }`}>
            <div className="relative flex-1 md:w-80">
              <input 
                type="text" 
                placeholder="Buscar por Nombre, Email o Localizador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full border p-3 text-xs focus:border-[#C4A484]/50 focus:outline-none transition-colors pr-10 ${
                  theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-white border-gray-200 text-gray-900'
                }`}
              />
            </div>

            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`border p-3 text-xs focus:border-[#C4A484]/50 focus:outline-none cursor-pointer min-w-[160px] transition-colors ${
                theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              <option value="all">Todos los Estados</option>
              <option value="confirmed">✅ Confirmados</option>
              <option value="paid">💰 Pagados (Redsys)</option>
              <option value="pending">⏳ Pendientes</option>
              <option value="failed">❌ Fallidos</option>
              <option value="cancelled">🚫 Anulados</option>
            </select>

            <select 
              value={infoEmailFilter}
              onChange={(e) => setInfoEmailFilter(e.target.value as any)}
              className={`border p-3 text-xs focus:border-[#C4A484]/50 focus:outline-none cursor-pointer min-w-[160px] transition-colors ${
                theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              <option value="all">Email Info: Todos</option>
              <option value="sent">✅ Enviados</option>
              <option value="pending">⏳ Pendientes</option>
            </select>

            <div className="flex-1"></div>

            <button 
              onClick={() => setIsManualSaleOpen(true)}
              className="bg-[#C4A484] text-[#0D0D0B] px-6 py-2.5 font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-[#E5E2D9] transition-all shadow-lg"
            >
              <Plus className="w-4 h-4" /> Venta Manual
            </button>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {slots.map(slot => (
            <div key={slot} className={`p-6 flex flex-col justify-between relative overflow-hidden border transition-colors ${
              theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10' : 'bg-white border-gray-200 shadow-sm'
            }`}>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <span className="text-xl font-mono text-[#C4A484]">{slot}</span>
                <span className={`px-2 py-1 text-xs font-bold uppercase transition-colors ${
                  capacities[slot].remaining <= 2 
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                    : theme === 'dark' 
                      ? 'bg-[#C4A484]/20 text-[#C4A484]' 
                      : 'bg-[#C4A484]/10 text-[#C4A484]'
                }`}>
                  {capacities[slot].remaining} {t('booking.freeSlots')}
                </span>
              </div>
              <div className="flex items-end gap-2 relative z-10">
                <span className="text-4xl font-light">{capacities[slot].booked}</span>
                <span className={`mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/50' : 'text-gray-400'}`}>/ 30 {t('booking.booked')}</span>
              </div>
              {/* Progress bar background */}
              <div 
                className="absolute left-0 bottom-0 top-0 bg-[#C4A484]/5 z-0 transition-all"
                style={{ width: `${(capacities[slot].booked / 30) * 100}%` }}
              ></div>
            </div>
          ))}
        </div>

        {/* Reservations List */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <h3 className={`text-sm uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
                Listado de Registros ({filteredReservations.length})
              </h3>
              <div className="flex items-center gap-2 border-l border-[#C4A484]/20 pl-4 h-4">
                <button 
                  onClick={() => downloadCSV(filteredReservations, `listado_reservas_${new Date().toISOString().split('T')[0]}.csv`)}
                  className={`p-1 rounded transition-colors flex items-center gap-1.5 group ${theme === 'dark' ? 'hover:bg-[#C4A484]/10 text-[#C4A484]/60' : 'hover:bg-[#C4A484]/5 text-[#C4A484]'}`}
                  title="Exportar listado actual a CSV"
                >
                  <Download className="w-3 h-3" />
                  <span className="text-[8px] font-bold uppercase tracking-widest hidden sm:inline">CSV</span>
                </button>
                <button 
                  onClick={() => downloadPDF(filteredReservations, `listado_reservas_${new Date().toISOString().split('T')[0]}.pdf`)}
                  className={`p-1 rounded transition-colors flex items-center gap-1.5 group ${theme === 'dark' ? 'hover:bg-[#C4A484]/10 text-[#C4A484]/60' : 'hover:bg-[#C4A484]/5 text-[#C4A484]'}`}
                  title="Exportar listado actual a PDF"
                >
                  <FileText className="w-3 h-3" />
                  <span className="text-[8px] font-bold uppercase tracking-widest hidden sm:inline">PDF</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Mostrar:</span>
              <div className={`inline-flex rounded border transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/10' : 'border-gray-200'}`}>
                {[10, 20, 50, 'all'].map((limit) => (
                  <button
                    key={limit}
                    onClick={() => setItemsPerPage(limit as number | 'all')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase transition-all tracking-widest ${
                      itemsPerPage === limit
                        ? 'bg-[#C4A484] text-[#0D0D0B]'
                        : theme === 'dark'
                          ? 'text-[#E5E2D9]/40 hover:bg-white/5'
                          : 'text-gray-400 hover:bg-gray-100'
                    } ${limit !== 'all' ? 'border-r border-inherit' : ''}`}
                  >
                    {limit === 'all' ? 'Todos' : limit}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {statusFilter !== 'all' && (
            <span className="text-[10px] text-[#C4A484]/60 uppercase tracking-tighter">
              Filtro activo: {statusFilter}
            </span>
          )}
        </div>

        {/* VISTA DESKTOP (TABLA) */}
        <div className={`hidden lg:block border transition-colors ${
          theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          <table className="w-full text-left text-sm">
            <thead className={`uppercase tracking-wider text-[10px] border-b transition-colors ${
              theme === 'dark' ? 'bg-[#0D0D0B] text-[#E5E2D9]/50 border-[#E5E2D9]/10' : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
              <tr>
                <th className="p-4 whitespace-nowrap">
                  Registro
                  <Tooltip text="Fecha y hora en la que el cliente inició el proceso de compra." />
                </th>
                <th className="p-4">
                  Fecha/Hora
                  <Tooltip text="Fecha y hora programada para la visita a la cueva." />
                </th>
                <th className="p-4">
                  Localizador
                  <Tooltip text="Código único de la reserva. Úsalo para buscar en Redsys si es necesario." />
                </th>
                <th className="p-4">
                  Cliente
                  <Tooltip text="Datos de contacto del comprador." />
                </th>
                <th className="p-4">
                  C.P. / Ciudad
                  <Tooltip text="Código Postal y Ciudad del cliente." />
                </th>
                <th className="p-4">
                  Tickets (A/R/I)
                  <Tooltip text="Desglose por tipo: Adulto / Reducida / Infantil (Gratis)." />
                </th>
                <th className="p-4">
                  Total
                  <Tooltip text="Número total de visitantes que ocupan plaza." />
                </th>
                <th className="p-4">
                  Origen
                  <Tooltip text="ONLINE: Venta web. MANUAL: Venta directa en taquilla." />
                </th>
                <th className="p-4">
                  Estado
                  <Tooltip text="PENDIENTE: Pago no finalizado. CONFIRMADO: Pago verificado. FALLIDO: Error en pago. CANCELADO: Anulada manual." />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2D9]/5 dark:divide-white/5">
              {displayedReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`p-12 text-center italic transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No se encontraron resultados para los filtros aplicados.' 
                      : 'No hay reservas registradas en el sistema.'}
                  </td>
                </tr>
              ) : (
                displayedReservations.map(r => (
                  <tr key={r.id} className={`transition-colors border-b ${
                    theme === 'dark' ? 'border-[#E5E2D9]/5 hover:bg-[#E5E2D9]/5' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                    <td className={`p-4 whitespace-nowrap text-[10px] font-mono transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '---'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="font-mono text-[#C4A484]">{r.date}</div>
                      <div className={`text-xs transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/60' : 'text-gray-500'}`}>{r.time}</div>
                    </td>
                    <td className={`p-4 font-mono text-xs transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/50' : 'text-gray-400'}`}>#{r.localizador || 'N/A'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3 text-[#C4A484]/40" />
                        <div className={`font-medium transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>{r.customerName}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 group/email">
                        <Mail className="w-3 h-3 text-[#E5E2D9]/20" />
                        <div className={`text-[10px] transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>{r.customerEmail}</div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(r.customerEmail);
                            alert("Email copiado al portapapeles");
                          }}
                          className="opacity-0 group-hover/email:opacity-100 p-0.5 hover:text-[#C4A484] transition-all cursor-pointer"
                          title="Copiar Email"
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className={`p-4 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/50' : 'text-gray-400'}`}>
                      <div className="font-mono text-xs">{r.customerPostalCode || '---'}</div>
                      <div className="text-[9px] uppercase tracking-wider">{r.customerCity || ''}</div>
                    </td>
                    <td className={`p-4 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/70' : 'text-gray-600'}`}>
                      {r.tickets?.adult || 0} / {r.tickets?.reduced || 0} / {r.tickets?.childFree || 0}
                    </td>
                    <td className={`p-4 font-medium transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>{r.totalTickets}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                        r.source === 'online' 
                          ? theme === 'dark' ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-600'
                          : theme === 'dark' ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-600'
                      }`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <StatusBadge r={r} />
                        <ActionButtons r={r} />
                      </div>
                      {r.errorCode && <div className="text-[9px] text-red-400 mt-1 font-mono">Respuesta Redsys: {r.errorCode}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* VISTA MOVIL (TARJETAS) */}
        <div className="lg:hidden space-y-4">
          {displayedReservations.length === 0 ? (
            <div className={`p-12 border text-center italic transition-colors ${
              theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10 text-[#E5E2D9]/40' : 'bg-white border-gray-200 text-gray-400'
            }`}>
              No hay resultados.
            </div>
          ) : (
            displayedReservations.map(r => (
              <div key={r.id} className={`p-5 space-y-4 relative overflow-hidden group border transition-colors ${
                theme === 'dark' ? 'bg-[#151515] border-[#E5E2D9]/10' : 'bg-white border-gray-200 shadow-sm'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className={`text-[10px] font-mono mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>#{r.localizador}</div>
                    <div className={`font-serif text-lg transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>{r.customerName}</div>
                    <div className={`text-[10px] flex items-center gap-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
                      <Mail className="w-3 h-3" />
                      {r.customerEmail}
                    </div>
                    <div className={`text-[10px] font-mono mt-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-500'}`}>
                      CP: {r.customerPostalCode || '---'} {r.customerCity ? `| ${r.customerCity}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge r={r} />
                    <span className={`px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors ${
                      r.source === 'online' 
                        ? theme === 'dark' ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-600'
                        : theme === 'dark' ? 'bg-green-900/20 text-green-300' : 'bg-green-50 text-green-600'
                    }`}>
                      {r.source}
                    </span>
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-4 border-y py-3 transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/5' : 'border-gray-100'}`}>
                  <div className={`space-y-1 border-r transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/5' : 'border-gray-100'}`}>
                    <div className={`text-[9px] uppercase tracking-tighter font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Visita</div>
                    <div className="font-mono text-[#C4A484] text-sm">{r.date}</div>
                    <div className={`text-xs font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>{r.time}</div>
                  </div>
                  <div className="space-y-1">
                    <div className={`text-[9px] uppercase tracking-tighter font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Tickets (A/R/I)</div>
                    <div className={`text-sm font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>
                      {r.totalTickets} <span className={`text-[10px] font-normal tracking-widest ml-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>({r.tickets?.adult}/{r.tickets?.reduced}/{r.tickets?.childFree})</span>
                    </div>
                    <div className={`text-[9px] italic transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>Registro: {r.createdAt ? new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '---'}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xl font-light text-[#C4A484]">{r.totalPrice}€</div>
                  <div className="flex items-center gap-3">
                    <ActionButtons r={r} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Manual Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
          <div className={`p-8 max-w-sm w-full text-center shadow-2xl border transition-colors ${
            theme === 'dark' ? 'bg-[#151515] border-emerald-900/50' : 'bg-white border-emerald-100'
          }`}>
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h3 className={`text-xl font-serif mb-2 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>Confirmar Pago</h3>
            <p className={`text-sm mb-6 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/60' : 'text-gray-600'}`}>
              Esta reserva aparece como <strong>PENDIENTE</strong>. 
              <span className={`block mt-4 p-3 text-xs rounded border transition-colors ${
                theme === 'dark' ? 'bg-emerald-900/20 text-emerald-300 border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
              }`}>
                Asegúrate de que el pago aparece como 'Correcto' en tu terminal de Redsys antes de confirmar en el CRM.
              </span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmModal({ show: false, resId: null })}
                className={`flex-1 py-2 border transition-colors text-xs uppercase font-bold ${
                  theme === 'dark' ? 'border-[#E5E2D9]/20 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                Cerrar
              </button>
              <button 
                onClick={() => confirmModal.resId && handleConfirmReservation(confirmModal.resId)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase font-bold transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHAT - SENTINEL/CONSULTANT */}
      <button 
        onClick={async () => {
          setIsChatLoading(true);
          setChatMessages([{ role: 'system', content: "Buscando componentes..." }]);
          await new Promise(resolve => setTimeout(resolve, 1000));
          setChatMessages([{ role: 'system', content: "Chequeando integridad del sistema..." }]);
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const message = await handleChatSystemCheck();
          alert(message);
          setIsChatLoading(false);
          setChatMessages([]);
        }}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl transition-all z-40 ${
          theme === 'dark' ? 'bg-[#C4A484] text-[#0D0D0B]' : 'bg-[#C4A484] text-white'
        }`}
      >
        <Info className="w-6 h-6" />
      </button>

      {/* Chat interface completely removed/commented out */}
      {/* {isChatOpen && ( ... )} */}


      {/* Cancel Confirmation Modal */}
      {cancelModal.show && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
          <div className={`p-8 max-w-sm w-full text-center shadow-2xl border transition-colors ${
            theme === 'dark' ? 'bg-[#151515] border-red-900/50' : 'bg-white border-red-100'
          }`}>
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className={`text-xl font-serif mb-2 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>¿Anular Reserva?</h3>
            <p className={`text-sm mb-6 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/60' : 'text-gray-600'}`}>
              Esta acción liberará el aforo. 
              <span className="block mt-2 font-bold text-red-400">IMPORTANTE: Esta herramienta NO devuelve el dinero automáticamente. Debes realizar la devolución desde tu terminal de Redsys.</span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setCancelModal({ show: false, resId: null })}
                className={`flex-1 py-2 border transition-colors text-xs uppercase font-bold ${
                  theme === 'dark' ? 'border-[#E5E2D9]/20 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                Cerrar
              </button>
              <button 
                onClick={() => cancelModal.resId && handleCancelReservation(cancelModal.resId)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs uppercase font-bold transition-colors"
                id="confirm-cancel-button"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Venta Manual Modal con Fecha Interna */}
      {isManualSaleOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-lg relative flex flex-col max-h-[90vh] border transition-colors shadow-2xl ${
              theme === 'dark' ? 'bg-[#151513] border-[#C4A484]/30' : 'bg-white border-gray-200'
            }`}
          >
            <div className="p-8 overflow-y-auto w-full">
              <button 
                onClick={() => setIsManualSaleOpen(false)}
                className={`absolute top-4 right-4 z-20 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="font-serif text-2xl text-[#C4A484] mb-6">Nueva Venta Taquilla</h3>
              
              <form onSubmit={handleManualSale} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>FECHA VISITA</label>
                    <input 
                      type="date"
                      required
                      value={manualSaleForm.date}
                      onChange={e => setManualSaleForm({...manualSaleForm, date: e.target.value})}
                      className={`w-full border p-3 text-sm focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                        theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9] [color-scheme:dark]' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>HORARIO</label>
                    <select 
                      value={manualSaleForm.time}
                      onChange={e => setManualSaleForm({...manualSaleForm, time: e.target.value})}
                      className={`w-full border p-3 text-sm focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                        theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    >
                      <option value="11:00">11:00</option>
                      <option value="12:30">12:30</option>
                      <option value="16:00">16:00</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>NOMBRE COMPRADOR</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ej: Juan Pérez"
                    value={manualSaleForm.customerName}
                    onChange={e => setManualSaleForm({...manualSaleForm, customerName: e.target.value})}
                    className={`w-full border p-3 text-sm focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                      theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>EMAIL (OPCIONAL)</label>
                  <input 
                    type="email"
                    placeholder="ejemplo@email.com"
                    value={manualSaleForm.customerEmail}
                    onChange={e => setManualSaleForm({...manualSaleForm, customerEmail: e.target.value})}
                    className={`w-full border p-3 text-sm focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                      theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>CÓDIGO POSTAL</label>
                  <input 
                    type="text"
                    placeholder="Ej: 21340"
                    maxLength={5}
                    pattern="[0-9]{5}"
                    value={manualSaleForm.customerPostalCode}
                    onChange={e => setManualSaleForm({...manualSaleForm, customerPostalCode: e.target.value})}
                    className={`w-full border p-3 text-sm focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                      theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                  {manualSaleForm.customerCity && (
                    <div className="mt-1 text-[10px] text-[#C4A484] uppercase tracking-widest">
                      📍 {manualSaleForm.customerCity}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>ADULTO</label>
                    <input 
                      type="number" 
                      min="0"
                      value={manualSaleForm.tickets.adult}
                      onChange={e => setManualSaleForm({...manualSaleForm, tickets: {...manualSaleForm.tickets, adult: parseInt(e.target.value) || 0}})}
                      className={`w-full border p-3 text-sm text-center focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                        theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>REDUCIDA</label>
                    <input 
                      type="number" 
                      min="0"
                      value={manualSaleForm.tickets.reduced}
                      onChange={e => setManualSaleForm({...manualSaleForm, tickets: {...manualSaleForm.tickets, reduced: parseInt(e.target.value) || 0}})}
                      className={`w-full border p-3 text-sm text-center focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                        theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] uppercase tracking-widest mb-2 font-bold transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>INFANTIL</label>
                    <input 
                      type="number" 
                      min="0"
                      value={manualSaleForm.tickets.childFree}
                      onChange={e => setManualSaleForm({...manualSaleForm, tickets: {...manualSaleForm.tickets, childFree: parseInt(e.target.value) || 0}})}
                      className={`w-full border p-3 text-sm text-center focus:outline-none focus:border-[#C4A484]/50 transition-colors ${
                        theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10 text-[#E5E2D9]' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                </div>

                <div className={`pt-6 border-t flex items-center justify-between transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/10' : 'border-gray-100'}`}>
                  <div className={`uppercase text-[10px] tracking-widest transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
                    Total: <span className="text-[#C4A484] ml-2 font-bold">{manualSaleForm.tickets.adult + manualSaleForm.tickets.reduced + manualSaleForm.tickets.childFree} Plazas</span>
                  </div>
                  <button 
                    type="submit"
                    className="px-8 py-3 bg-[#C4A484] text-[#0D0D0B] text-xs font-bold uppercase tracking-widest hover:bg-[#A68B6E] hover:text-white transition-all shadow-md"
                  >
                    Confirmar Venta
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Reports and Analytics Modal */}
      <AnimatePresence>
        {isReportsOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col border shadow-2xl transition-colors ${
                theme === 'dark' ? 'bg-[#151513] border-[#C4A484]/30 text-[#E5E2D9]' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              {/* Header */}
              <div className={`p-6 border-b flex items-center justify-between transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/10' : 'border-gray-100'}`}>
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-[#C4A484]/10 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-[#C4A484]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif">Informes y Estadísticas</h2>
                    <p className={`text-xs transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>Métricas generales de la temporada</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => downloadCSV(stats.reportData, `informe_reservas_${reportStartDate}_al_${reportEndDate}.csv`)}
                    className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest border transition-all flex items-center gap-2 hover:bg-[#C4A484] hover:text-white ${
                      theme === 'dark' ? 'border-[#C4A484]/30 text-[#C4A484]' : 'border-[#C4A484] text-[#C4A484]'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    CSV
                  </button>
                  <button 
                    onClick={() => downloadPDF(stats.reportData, `informe_reservas_${reportStartDate}_al_${reportEndDate}.pdf`)}
                    className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest border transition-all flex items-center gap-2 hover:bg-[#C4A484] hover:text-white ${
                      theme === 'dark' ? 'border-[#C4A484]/30 text-[#C4A484]' : 'border-[#C4A484] text-[#C4A484]'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    PDF
                  </button>
                  <button 
                    onClick={() => setIsReportsOpen(false)}
                    className={`p-2 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/40 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                
                {/* Local Filters */}
                <div className={`p-4 border rounded-none flex flex-wrap items-center gap-6 transition-colors ${theme === 'dark' ? 'bg-[#0D0D0B] border-[#E5E2D9]/10' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex flex-col gap-1 pr-6 border-r border-[#C4A484]/20">
                    <span className="text-[9px] uppercase font-bold opacity-40">Filtrar por</span>
                    <div className="flex bg-[#C4A484]/5 p-0.5 border border-[#C4A484]/20">
                      <button 
                        onClick={() => setReportFilterType('visit')}
                        className={`px-3 py-1.5 text-[9px] uppercase font-bold tracking-tight transition-all ${reportFilterType === 'visit' ? 'bg-[#C4A484] text-[#0D0D0B]' : 'text-[#C4A484] hover:bg-[#C4A484]/10'}`}
                      >
                        Día de Visita
                      </button>
                      <button 
                        onClick={() => setReportFilterType('creation')}
                        className={`px-3 py-1.5 text-[9px] uppercase font-bold tracking-tight transition-all ${reportFilterType === 'creation' ? 'bg-[#C4A484] text-[#0D0D0B]' : 'text-[#C4A484] hover:bg-[#C4A484]/10'}`}
                      >
                        Día de Compra
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase font-bold opacity-40">Desde</span>
                      <input 
                        type="date" 
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        className={`bg-transparent border-b text-xs focus:outline-none focus:border-[#C4A484] p-1 transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/20 font-light' : 'border-gray-200'}`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase font-bold opacity-40">Hasta</span>
                      <input 
                        type="date" 
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className={`bg-transparent border-b text-xs focus:outline-none focus:border-[#C4A484] p-1 transition-colors ${theme === 'dark' ? 'border-[#E5E2D9]/20 font-light' : 'border-gray-200'}`}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 border-l pl-6 border-[#C4A484]/20">
                    {[
                      { id: 'today', label: 'Hoy' },
                      { id: 'week', label: '7 Días' },
                      { id: 'month', label: '30 Días' },
                      { id: 'total', label: 'Histórico' }
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setReportPeriod(p.id as any)}
                        className={`px-3 py-1.5 text-[9px] uppercase font-bold tracking-widest border transition-all ${
                          theme === 'dark' 
                            ? 'border-[#E5E2D9]/10 text-[#E5E2D9]/60 hover:bg-[#C4A484]/10' 
                            : 'border-gray-200 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="ml-auto text-[10px] font-light opacity-50 uppercase tracking-widest">
                    {stats.reportData.length} Registros encontrados en este rango
                  </div>
                </div>

                {/* Highlights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Revenue Card */}
                  <div className={`p-6 border relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-gray-50 border-gray-100 shadow-sm'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Ingresos Totales</p>
                      <h4 className="text-3xl font-serif text-[#C4A484]">{stats.revenue.toLocaleString()}€</h4>
                      <p className={`text-[9px] mt-2 opacity-50 uppercase tracking-tight`}>Basado en reservas pagadas/confirmadas</p>
                    </div>
                  </div>
                  
                  {/* Visitors Card */}
                  <div className={`p-6 border relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-gray-50 border-gray-100 shadow-sm'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Visitantes Confirmados</p>
                      <h4 className="text-3xl font-serif text-[#C4A484]">{stats.totalVisits}</h4>
                      <p className={`text-[9px] mt-2 opacity-50 uppercase tracking-tight`}>Suma de totalTickets de reservas activas</p>
                    </div>
                  </div>

                  {/* Confirmed Count */}
                  <div className={`p-6 border relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-gray-50 border-gray-100 shadow-sm'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Reservas Activas</p>
                      <h4 className="text-3xl font-serif text-emerald-500">
                        {allReservations.filter(r => r.status === 'confirmed' || r.status === 'paid').length}
                      </h4>
                      <p className={`text-[9px] mt-2 opacity-50 uppercase tracking-tight`}>Excluyendo pendientes y anuladas</p>
                    </div>
                  </div>

                  {/* Conversion / Stats */}
                  <div className={`p-6 border relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-gray-50 border-gray-100 shadow-sm'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/30' : 'text-gray-400'}`}>Canceladas / Error</p>
                      <h4 className="text-3xl font-serif text-red-400">
                        {stats.reportData.filter(r => r.status === 'cancelled' || r.status === 'failed').length}
                      </h4>
                      <p className={`text-[9px] mt-2 opacity-50 uppercase tracking-tight`}>Bajas totales del sistema</p>
                    </div>
                  </div>

                  {/* New: Ticket Breakdown Cards */}
                  <div className={`p-4 border col-span-1 md:col-span-2 lg:col-span-4 grid grid-cols-3 gap-4 transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-white border-gray-100'}`}>
                    {stats.tickets.map(t => (
                      <div key={t.name} className="text-center border-r last:border-0 border-[#C4A484]/10">
                        <p className={`text-[8px] uppercase font-bold tracking-widest mb-1 opacity-50`}>{t.name}</p>
                        <p className="text-xl font-serif text-[#C4A484]">{t.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Daily Visitors Line Chart */}
                  <div className={`p-8 border min-h-[400px] flex flex-col transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-white border-gray-100 shadow-xl'}`}>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-8 border-b pb-4 border-[#C4A484]/10">Tendencia de Visitantes (Últimos 14 días)</h3>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={stats.dailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#eee'} vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke={theme === 'dark' ? '#666' : '#999'} 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            dy={10}
                          />
                          <YAxis 
                            stroke={theme === 'dark' ? '#666' : '#999'} 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <RechartsTooltip 
                            contentStyle={{ 
                              backgroundColor: theme === 'dark' ? '#1A1A1A' : '#fff', 
                              border: `1px solid ${theme === 'dark' ? '#C4A48433' : '#ddd'}`,
                              fontSize: '11px' 
                            }}
                            itemStyle={{ color: '#C4A484' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="tickets" 
                            stroke="#C4A484" 
                            strokeWidth={3} 
                            dot={{ fill: '#C4A484', strokeWidth: 2, r: 4 }} 
                            activeDot={{ r: 6, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Status Breakdown Pie Chart */}
                  <div className={`p-8 border min-h-[400px] flex flex-col transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-white border-gray-100 shadow-xl'}`}>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-8 border-b pb-4 border-[#C4A484]/10">Distribución por Estado</h3>
                    <div className="flex-1 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={stats.status}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {stats.status.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Ticket Types Breakdown Bar Chart */}
                  <div className={`p-8 border min-h-[400px] flex flex-col transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#E5E2D9]/5' : 'bg-white border-gray-100 shadow-xl'}`}>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-8 border-b pb-4 border-[#C4A484]/10">Tipos de Entradas Vendidas</h3>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.tickets} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#eee'} horizontal={false} />
                          <XAxis type="number" stroke={theme === 'dark' ? '#666' : '#999'} fontSize={10} axisLine={false} tickLine={false} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            stroke={theme === 'dark' ? '#E5E2D9' : '#333'} 
                            fontSize={10} 
                            width={100} 
                            axisLine={false} 
                            tickLine={false}
                          />
                          <RechartsTooltip 
                             cursor={{fill: 'transparent'}}
                             contentStyle={{ 
                               backgroundColor: theme === 'dark' ? '#1A1A1A' : '#fff', 
                               border: `1px solid ${theme === 'dark' ? '#C4A48433' : '#ddd'}`
                             }} 
                          />
                          <Bar dataKey="value" fill="#C4A484" radius={[0, 4, 4, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Quick Export Tips */}
                  <div className={`p-8 border min-h-[400px] flex flex-col justify-center transition-colors ${theme === 'dark' ? 'bg-[#1A1A1A] border-[#C4A484]/10' : 'bg-amber-50 border-amber-100'}`}>
                    <PieChartIcon className="w-12 h-12 text-[#C4A484] mb-6 opacity-40 mx-auto" />
                    <h3 className="text-center font-serif text-xl mb-4">Exportación de Datos</h3>
                    <p className={`text-center text-xs leading-relaxed max-w-sm mx-auto mb-8 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/60' : 'text-gray-600'}`}>
                      Puedes descargar todos los registros filtrados actualmente en la tabla principal. 
                      El archivo incluirá desgloses de tickets, precios, localizadores y datos de contacto.
                    </p>
                    <div className="flex justify-center gap-4">
                      <button 
                        onClick={() => downloadCSV(allReservations, `exportacion_completa_${new Date().toISOString().split('T')[0]}.csv`)}
                        className="px-6 py-3 bg-[#C4A484] hover:bg-[#A68B6E] text-[#0D0D0B] font-bold uppercase text-[10px] tracking-widest transition-all shadow-lg flex items-center gap-2"
                      >
                         <Download className="w-4 h-4" />
                         Descargar CSV
                      </button>
                      <button 
                        onClick={() => downloadPDF(allReservations, `exportacion_completa_${new Date().toISOString().split('T')[0]}.pdf`)}
                        className="px-6 py-3 border border-[#C4A484] text-[#C4A484] hover:bg-[#C4A484] hover:text-[#0D0D0B] font-bold uppercase text-[10px] tracking-widest transition-all shadow-lg flex items-center gap-2"
                      >
                         <FileText className="w-4 h-4" />
                         Descargar PDF
                      </button>
                    </div>
                    <p className={`text-center text-[10px] mt-8 opacity-40 italic`}>
                      * Los informes son generados en tiempo real con los datos actuales de la base de datos.
                    </p>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
