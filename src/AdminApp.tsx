import React, { useEffect, useState } from 'react';
import { db, auth, loginWithGoogle, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, increment, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Calendar, Clock, Ticket, Users, FileText, CheckCircle, Plus, LogOut, Mountain, X, RefreshCw, Info, Ban, AlertCircle, Copy, Mail, Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isBypass, setIsBypass] = useState(false);
  
  // Data states
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    // Obtener YYYY-MM-DD en hora local
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterByVisitDate, setFilterByVisitDate] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('crm-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

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

  // Status Badge Helper
  const StatusBadge = ({ r }: { r: any }) => (
    <span className={`px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
      r.status === 'confirmed' 
        ? theme === 'dark' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
      : r.status === 'paid'
        ? theme === 'dark' 
          ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
          : 'bg-cyan-50 text-cyan-700 border border-cyan-200 shadow-sm'
        : r.status === 'pending'
          ? theme === 'dark' 
            ? 'bg-amber-900/40 text-amber-300 shadow-[0_0_8px_rgba(217,119,6,0.3)] animate-pulse' 
            : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
          : theme === 'dark' ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'
    }`}>
      {r.status === 'paid' ? '💰 Pagado' : 
       r.status === 'confirmed' ? '✅ Confirmado' : 
       r.status === 'pending' ? '⏳ Pendiente' : 
       r.status === 'cancelled' ? '🚫 Anulada' : '❌ Fallido'}
    </span>
  );

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
      {(r.status === 'paid' || r.status === 'confirmed') && (
        <div className="flex items-center gap-1">
          <button 
            onClick={() => handleSendManualEmail(r.localizador)}
            className={`p-1 transition-colors ${r.status === 'paid' ? 'text-blue-400 hover:text-blue-200 animate-pulse' : 'text-blue-600/50 hover:text-blue-400'}`}
            title="Abrir Email (Mailto)"
          >
            <Mail className="w-5 h-5 lg:w-4 lg:h-4" />
          </button>
          <button 
            onClick={() => alert("📤 Envío de email vía sistema en desarrollo (Resend). Por favor, use el botón de Mailto para enviar manualmente.")}
            className={`p-1 transition-colors cursor-help ${theme === 'dark' ? 'text-[#E5E2D9]/20 hover:text-[#C4A484]' : 'text-gray-300 hover:text-[#C4A484]'}`}
            title="Enviar vía Sistema (En desarrollo)"
          >
            <RefreshCw className="w-4 h-4 lg:w-3 lg:h-3" />
          </button>
        </div>
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
        r.localizador?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Filtro por Estado (Ocultamos canceladas por defecto si el filtro es 'all'?) 
      // No, mostramos todo lo que coincida con el estado.
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      
      // 3. Filtro por Fecha de Creación (DÍA ON/OFF)
      // Normalizamos ambos strings para comparar solo la parte YYYY-MM-DD
      const rDateFull = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      const fDate = dateFilter ? dateFilter.trim() : '';
      const matchesVisitDate = !filterByVisitDate || rDateFull === fDate;
      
      return matchesSearch && matchesStatus && matchesVisitDate;
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
  // Modal states
  const [isManualSaleOpen, setIsManualSaleOpen] = useState(false);
  const [manualSaleForm, setManualSaleForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '11:00',
    customerName: '',
    customerEmail: '',
    tickets: { adult: 0, reduced: 0, childFree: 0 }
  });

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

  const [confirmEmailModal, setConfirmEmailModal] = useState<{ show: boolean, orderId: string }>({ show: false, orderId: '' });

  const executeManualEmail = async () => {
    const { orderId } = confirmEmailModal;
    setConfirmEmailModal({ show: false, orderId: '' });
    try {
      const resp = await fetch('/api/send-manual-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      if (resp.ok) {
        alert("📧 Email enviado y reserva confirmada en el CRM.");
        // Refresh local data to reflect the status change
        setAllReservations(prev => prev.map(r => r.localizador === orderId ? { ...r, status: 'confirmed' } : r));
      } else {
        alert("❌ Error enviando email.");
      }
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  };

  const handleSendManualEmail = (orderId: string) => {
    const r = allReservations.find(res => res.localizador === orderId);
    if (!r) return;

    const subject = encodeURIComponent(`Reserva Confirmada #${r.localizador} - Cuevas de Alájar`);
    const body = encodeURIComponent(`Hola ${r.customerName},

Confirmamos tu reserva para la visita a las Cuevas de la Peña de Arias Montano.

DETALLES:
- Localizador: #${r.localizador}
- Fecha: ${r.date}
- Hora: ${r.time}
- Plazas: ${r.totalTickets}

Recuerda acudir 10 minutos antes a la entrada de las Cuevas.

Saludos,
Cuevas de Alájar`);

    window.location.href = `mailto:${r.customerEmail}?subject=${subject}&body=${body}`;
    
    // Opcionalmente, si estaba en 'paid', lo pasamos a 'confirmed' localmente 
    // pues asumimos que el operario ya lo ha gestionado.
    if (r.status === 'paid') {
      updateDoc(doc(db, 'reservations', r.id), { status: 'confirmed', updatedAt: new Date().toISOString() })
        .catch(err => console.error("Error confirmando tras email manual:", err));
    }
  };

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
          <button 
            onClick={toggleTheme}
            className={`px-4 py-2 rounded-full border transition-all flex items-center gap-2 shadow-md relative z-50 ${
              theme === 'dark' 
                ? 'bg-[#1A1A1A] border-[#C4A484]/40 text-[#C4A484] hover:bg-[#C4A484]/10' 
                : 'bg-white border-gray-300 text-[#C4A484] hover:bg-gray-50'
            }`}
            title={theme === 'dark' ? 'Pasar a Modo Claro' : 'Pasar a Modo Oscuro'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px] font-black uppercase tracking-widest">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
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
                  <Tooltip text="ON: Muestra solo las reservas realizadas EN el día de consulta. OFF: Muestra todas las reservas (o por búsqueda)." />
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
                  {capacities[slot].remaining} Libres
                </span>
              </div>
              <div className="flex items-end gap-2 relative z-10">
                <span className="text-4xl font-light">{capacities[slot].booked}</span>
                <span className={`mb-1 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/50' : 'text-gray-400'}`}>/ 30 ocupadas</span>
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
            <h3 className={`text-sm uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-[#E5E2D9]/40' : 'text-gray-400'}`}>
              Listado de Registros ({filteredReservations.length})
            </h3>
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

      {/* Manual Email Confirmation Modal */}
      {confirmEmailModal.show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className={`p-8 max-w-sm w-full text-center shadow-2xl border transition-colors ${
            theme === 'dark' ? 'bg-[#151515] border-blue-900/30' : 'bg-white border-blue-100'
          }`}>
            <Mail className="w-16 h-16 text-blue-400 mx-auto mb-4" />
            <h3 className={`text-xl font-serif mb-2 transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]' : 'text-gray-900'}`}>Confirmar Envío de Email</h3>
            
            <p className={`text-sm mb-6 leading-relaxed transition-colors ${theme === 'dark' ? 'text-[#E5E2D9]/70' : 'text-gray-600'}`}>
              ¿Has comprobado primero en el panel de <strong>Redsys</strong> que el pago del pedido <span className={theme === 'dark' ? 'text-[#E5E2D9]' : 'font-bold'}>#{confirmEmailModal.orderId}</span> es correcto?
            </p>
            
            <div className={`border p-4 mb-8 transition-colors ${
              theme === 'dark' ? 'bg-blue-900/10 border-blue-900/50' : 'bg-blue-50 border-blue-100'
            }`}>
              <p className={`text-[10px] flex items-start gap-2 text-left transition-colors ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                <Info className="w-4 h-4 flex-shrink-0" />
                Al confirmar, se enviará el email oficial de reserva al cliente y el estado pasará a <strong>CONFIRMADO</strong> automáticamente en el CRM.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setConfirmEmailModal({ show: false, orderId: '' })}
                className={`py-2 border transition-colors text-[10px] uppercase font-bold tracking-wider ${
                  theme === 'dark' ? 'border-[#E5E2D9]/10 hover:bg-[#E5E2D9]/5' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                Cerrar
              </button>
              <button 
                onClick={executeManualEmail}
                className="py-2 bg-blue-600 hover:bg-blue-500 text-white transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                Confirmar y Enviar
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
