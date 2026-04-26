import React, { useEffect, useState } from 'react';
import { db, auth, loginWithGoogle, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, increment, where, onSnapshot } from 'firebase/firestore';
import { Calendar, Clock, Ticket, Users, FileText, CheckCircle, Plus, Trash2, LogOut, Mountain, X, RefreshCw, Info, Ban, AlertCircle, Copy, Mail } from 'lucide-react';

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isBypass, setIsBypass] = useState(false);
  
  // Data states
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Login form states
  const [emailInput, setEmailInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');

  // Tooltip helper component
  const Tooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-block ml-1">
      <Info className="w-3 h-3 text-[#C4A484]/50 hover:text-[#C4A484] cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-[#1A1A1A] border border-[#C4A484]/30 text-[10px] leading-relaxed text-[#E5E2D9] rounded shadow-2xl z-50 pointer-events-none">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#1A1A1A]"></div>
      </div>
    </div>
  );

  const [cancelModal, setCancelModal] = useState<{show: boolean, resId: string | null}>({ show: false, resId: null });
  const [confirmModal, setConfirmModal] = useState<{show: boolean, resId: string | null}>({ show: false, resId: null });
  const [showNewModal, setShowNewModal] = useState(false);

  // Filtered and Sorted Reservations
  const filteredReservations = allReservations
    .filter(r => {
      const matchesSearch = 
        r.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Priorizar fecha de registro (más recientes arriba)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

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

      // Restituir aforo
      const slotId = `${resData.date}_${resData.time}`;
      const slotRef = doc(db, 'slots', slotId);
      await updateDoc(slotRef, { bookedCount: increment(-Number(resData.totalTickets || 0)) });

      // Marcar como cancelado
      await updateDoc(doc(db, 'reservations', resId), { 
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      });

      setCancelModal({ show: false, resId: null });
      alert("Reserva anulada. Recuerda realizar la devolución manual en el terminal de Redsys si corresponde.");
    } catch (e) {
      alert("Error al anular: " + (e as Error).message);
    }
  };
  const [newRes, setNewRes] = useState({
    time: '11:00',
    customerName: '',
    customerEmail: '',
    tickets: { adult: 0, reduced: 0, childFree: 0 }
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Verify admin
        try {
          const authorizedEmails = ['holasolonet@gmail.com', 'caballerovazquezrafael@gmail.com', 'taquilla@cuevas.com'];
          const isAuthorizedEmail = u.email && authorizedEmails.includes(u.email);
          
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

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = newRes.tickets.adult + newRes.tickets.reduced + newRes.tickets.childFree;
    if (total === 0) return alert("Selecciona tickets");

    // Check capacity locally first
    const currentBooked = dayReservations
      .filter(r => r.time === newRes.time)
      .reduce((sum, r) => sum + (r.totalTickets || 0), 0);
    
    if (currentBooked + total > 30) {
      return alert(`No hay suficiente espacio. Quedan ${30 - currentBooked} plazas libres.`);
    }

    const payload = {
      date: dateFilter,
      time: newRes.time,
      customerName: newRes.customerName,
      customerEmail: newRes.customerEmail || 'manual@taquilla.local',
      tickets: newRes.tickets,
      totalTickets: total,
      amount: 0, 
      source: 'manual',
      status: 'confirmed',
      localizador: 'MAN' + String(Math.floor(Date.now() / 1000)).substring(4, 12),
      createdAt: Date.now(),
      ownerId: isBypass ? 'bypass-admin' : user?.uid
    };

    try {
      const resRef = doc(collection(db, 'reservations'));
      await setDoc(resRef, payload);
      
      // Update slots aggregate
      const slotId = `${dateFilter}_${newRes.time}`;
      const slotRef = doc(db, 'slots', slotId);
      const slotSnap = await getDoc(slotRef);
      if (slotSnap.exists()) {
        await updateDoc(slotRef, { bookedCount: increment(total) });
      } else {
        await setDoc(slotRef, { date: dateFilter, time: newRes.time, bookedCount: total });
      }

      setShowNewModal(false);
      fetchData();
      alert("Reserva manual creada con éxito.");
    } catch (err: any) {
      alert("Error: " + err.message);
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

  if (loading) return <div className="min-h-screen bg-[#0D0D0B] text-white flex items-center justify-center">Cargando...</div>;

  if (!isBypass && (!user || !isAdmin)) {
    return (
      <div className="min-h-screen bg-[#0D0D0B] text-[#E5E2D9] flex flex-col items-center justify-center p-4">
        <Mountain className="w-16 h-16 text-[#C4A484] mb-8" />
        <h1 className="text-3xl font-serif mb-2">Panel de Taquilla</h1>
        <p className="text-[#E5E2D9]/60 mb-8 max-w-sm text-center">Acceso restringido para el personal de las Cuevas de la Peña de Arias Montano.</p>
        
        <div className="bg-[#151515] p-6 border border-[#E5E2D9]/10 w-full max-w-sm mb-6">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase text-[#E5E2D9]/50 mb-1">Usuario / Email</label>
              <input 
                type="text" 
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-[#E5E2D9]/50 mb-1">Contraseña</label>
              <input 
                type="password" 
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-[#E5E2D9]/5 hover:bg-[#E5E2D9]/10 border border-[#E5E2D9]/20 transition-colors py-3 font-bold uppercase tracking-widest text-xs"
            >
              Entrar
            </button>
          </form>
        </div>

        <div className="flex flex-col items-center gap-4">
          <span className="text-xs uppercase tracking-wider text-[#E5E2D9]/30">O también</span>
          <button 
            onClick={loginWithGoogle}
            className="bg-[#C4A484] text-[#0D0D0B] px-8 py-3 font-bold uppercase tracking-widest text-xs hover:bg-[#b09376] transition-colors"
          >
            Acceder con Google
          </button>
        </div>
      </div>
    );
  }

  // Aggregate capacities from dayReservations for active dashboard
  const slots = ['11:00', '12:30', '16:00'];
  const capacities = slots.reduce((acc, slot) => {
    const slotRes = dayReservations.filter(r => r.time === slot);
    const booked = slotRes.reduce((sum, r) => sum + (Number(r.totalTickets) || 0), 0);
    acc[slot] = { booked, remaining: Math.max(0, 30 - booked) };
    return acc;
  }, {} as Record<string, { booked: number, remaining: number }>);

  return (
    <div className="min-h-screen bg-[#0D0D0B] text-[#E5E2D9] font-sans">
      <nav className="border-b border-[#E5E2D9]/10 bg-[#151515] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Mountain className="text-[#C4A484] w-6 h-6" />
          <span className="font-serif text-xl tracking-wide">Panel Taquilla</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[#E5E2D9]/60">{isBypass ? 'Administrador Local' : user?.email}</span>
          <button 
            onClick={() => {
              if (isBypass) setIsBypass(false);
              else logout();
            }} 
            className="text-[#c48484] hover:text-red-400 flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-serif mb-1">Gestión de Aforos y Reservas</h2>
            <p className="text-[#E5E2D9]/60 text-sm">Visualiza las ventas online y registra entradas vendidas in-situ.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Buscador Avanzado */}
            <div className="relative flex-1 md:flex-none md:w-64">
              <input 
                type="text" 
                placeholder="Buscar cliente, email o ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#151515] border border-[#E5E2D9]/10 p-2.5 pl-3 text-[#E5E2D9] text-xs focus:border-[#C4A484]/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Filtro de Estado */}
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#151515] border border-[#E5E2D9]/10 p-2.5 text-[#E5E2D9] text-xs focus:border-[#C4A484]/50 focus:outline-none appearance-none cursor-pointer min-w-[140px]"
            >
              <option value="all">Todos los Estados</option>
              <option value="confirmed">✅ Confirmados</option>
              <option value="pending">⏳ Pendientes</option>
              <option value="failed">❌ Fallidos</option>
              <option value="cancelled">🚫 Anulados</option>
            </select>

            <div className="h-8 w-px bg-[#E5E2D9]/10 mx-1 hidden md:block"></div>

            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-[#151515] border border-[#E5E2D9]/20 p-2 text-[#E5E2D9] [&::-webkit-calendar-picker-indicator]:invert"
            />
            <button 
              onClick={fetchData}
              disabled={isRefreshing}
              className="bg-[#151515] border border-[#E5E2D9]/20 p-2 text-[#E5E2D9] hover:bg-[#E5E2D9]/5 transition-colors disabled:opacity-50"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setShowNewModal(true)}
              className="bg-[#C4A484] text-[#0D0D0B] px-4 py-2 font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-[#b09376]"
            >
              <Plus className="w-4 h-4" /> Venta Manual
            </button>
          </div>
        </div>

        {/* Dashboards Capacities */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {slots.map(slot => (
            <div key={slot} className="bg-[#151515] border border-[#E5E2D9]/10 p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="flex justify-between items-start mb-4 relative z-10">
                <span className="text-xl font-mono text-[#C4A484]">{slot}</span>
                <span className={`px-2 py-1 text-xs font-bold uppercase ${capacities[slot].remaining <= 2 ? 'bg-red-900/50 text-red-200' : 'bg-[#C4A484]/20 text-[#C4A484]'}`}>
                  {capacities[slot].remaining} Libres
                </span>
              </div>
              <div className="flex items-end gap-2 relative z-10">
                <span className="text-4xl font-light">{capacities[slot].booked}</span>
                <span className="text-[#E5E2D9]/50 mb-1">/ 30 ocupadas</span>
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
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-sm uppercase tracking-widest text-[#E5E2D9]/40 font-bold">
            Listado de Registros ({filteredReservations.length})
          </h3>
          {statusFilter !== 'all' && (
            <span className="text-[10px] text-[#C4A484]/60 uppercase tracking-tighter">
              Filtro activo: {statusFilter}
            </span>
          )}
        </div>
        <div className="bg-[#151515] border border-[#E5E2D9]/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0D0D0B] text-[#E5E2D9]/50 uppercase tracking-wider text-[10px] border-b border-[#E5E2D9]/10">
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
            <tbody>
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#E5E2D9]/40 italic">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No se encontraron resultados para los filtros aplicados.' 
                      : 'No hay reservas registradas en el sistema.'}
                  </td>
                </tr>
              ) : (
                filteredReservations.map(r => (
                  <tr key={r.id} className="border-b border-[#E5E2D9]/5 hover:bg-[#E5E2D9]/5 transition-colors">
                    <td className="p-4 whitespace-nowrap text-[10px] font-mono text-[#E5E2D9]/40">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '---'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="font-mono text-[#C4A484]">{r.date}</div>
                      <div className="text-xs text-[#E5E2D9]/60">{r.time}</div>
                    </td>
                    <td className="p-4 font-mono text-xs text-[#E5E2D9]/50">#{r.localizador || 'N/A'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3 text-[#C4A484]/40" />
                        <div className="font-medium text-[#E5E2D9]">{r.customerName}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 group/email">
                        <Mail className="w-3 h-3 text-[#E5E2D9]/20" />
                        <div className="text-[10px] text-[#E5E2D9]/40">{r.customerEmail}</div>
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
                    <td className="p-4 text-[#E5E2D9]/70">
                      {r.tickets?.adult || 0} / {r.tickets?.reduced || 0} / {r.tickets?.childFree || 0}
                    </td>
                    <td className="p-4 font-medium">{r.totalTickets}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-[10px] uppercase tracking-wider ${r.source === 'online' ? 'bg-blue-900/30 text-blue-300' : 'bg-green-900/30 text-green-300'}`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-[10px] uppercase tracking-wider ${
                          r.status === 'confirmed' || r.status === 'paid' 
                            ? 'bg-emerald-900/40 text-emerald-300' 
                            : r.status === 'pending'
                              ? 'bg-amber-900/40 text-amber-300 shadow-[0_0_8px_rgba(217,119,6,0.3)] animate-pulse'
                              : 'bg-red-900/40 text-red-300'
                        }`}>
                          {r.status === 'paid' || r.status === 'confirmed' 
                            ? '✅ Confirmado' 
                            : r.status === 'pending' 
                              ? '⏳ Pendiente' 
                              : r.status === 'cancelled'
                                ? '🚫 Anulada'
                                : '❌ Fallido'}
                        </span>
                        {r.status === 'pending' && (
                          <button 
                            onClick={() => setConfirmModal({ show: true, resId: r.id })}
                            className="p-1 hover:text-emerald-400 text-emerald-600 transition-colors"
                            title="Confirmar Manualmente"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {(r.status === 'confirmed' || r.status === 'paid' || r.status === 'pending') && (
                          <button 
                            onClick={() => setCancelModal({ show: true, resId: r.id })}
                            className="p-1 hover:text-red-400 text-red-600/50 transition-colors"
                            title="Anular Reserva"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {r.errorCode && <div className="text-[9px] text-red-400 mt-1 font-mono">Respuesta Redsys: {r.errorCode}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Manual Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#151515] border border-emerald-900/50 p-8 max-w-sm w-full text-center shadow-2xl">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-serif mb-2">Confirmar Pago</h3>
            <p className="text-sm text-[#E5E2D9]/60 mb-6">
              Esta reserva aparece como <strong>PENDIENTE</strong>. 
              <span className="block mt-4 p-3 bg-emerald-900/20 text-emerald-300 text-xs rounded border border-emerald-800/30">
                Asegúrate de que el pago aparece como 'Correcto' en tu terminal de Redsys antes de confirmar en el CRM.
              </span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmModal({ show: false, resId: null })}
                className="flex-1 py-2 border border-[#E5E2D9]/20 hover:bg-white/5 transition-colors text-xs uppercase font-bold"
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

      {/* Cancel Confirmation Modal */}
      {cancelModal.show && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#151515] border border-red-900/50 p-8 max-w-sm w-full text-center shadow-2xl">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-serif mb-2">¿Anular Reserva?</h3>
            <p className="text-sm text-[#E5E2D9]/60 mb-6">
              Esta acción liberará el aforo. 
              <span className="block mt-2 font-bold text-red-400">IMPORTANTE: Esta herramienta NO devuelve el dinero automáticamente. Debes realizar la devolución desde tu terminal de Redsys.</span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setCancelModal({ show: false, resId: null })}
                className="flex-1 py-2 border border-[#E5E2D9]/20 hover:bg-white/5 transition-colors text-xs uppercase font-bold"
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

      {/* Manual Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#151515] border border-[#C4A484]/30 w-full max-w-md relative flex flex-col max-h-[90vh]">
            <div className="p-6 overflow-y-auto">
              <button onClick={() => setShowNewModal(false)} className="absolute top-4 right-4 text-[#E5E2D9]/50 hover:text-white z-20">
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-serif text-2xl mb-6">Nueva Venta Taquilla</h3>
              
              <form onSubmit={handleCreateManual} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[#E5E2D9]/50 mb-1">Horario</label>
                <select 
                  value={newRes.time} 
                  onChange={e => setNewRes({...newRes, time: e.target.value})}
                  className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]"
                >
                  {slots.map(s => <option key={s} value={s}>{s} ({capacities[s].remaining} libres)</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-xs uppercase text-[#E5E2D9]/50 mb-1">Nombre Comprador</label>
                <input 
                  type="text" required
                  placeholder="Ej: Juan Pérez"
                  value={newRes.customerName}
                  onChange={e => setNewRes({...newRes, customerName: e.target.value})}
                  className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#E5E2D9]/50 mb-1">Email (Opcional)</label>
                <input 
                  type="email"
                  placeholder="ejemplo@email.com"
                  value={newRes.customerEmail === 'manual@taquilla.local' ? '' : newRes.customerEmail}
                  onChange={e => setNewRes({...newRes, customerEmail: e.target.value || 'manual@taquilla.local'})}
                  className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]"
                />
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E5E2D9]/10">
                {['adult', 'reduced', 'childFree'].map(type => (
                  <div key={type}>
                    <label className="block text-[10px] uppercase text-[#E5E2D9]/50 mb-1">
                      {type === 'adult' ? 'Adulto' : type === 'reduced' ? 'Reducida' : 'Infantil'}
                    </label>
                    <input 
                      type="number" min="0" 
                      value={newRes.tickets[type as keyof typeof newRes.tickets]}
                      onChange={e => setNewRes({
                        ...newRes, 
                        tickets: { ...newRes.tickets, [type]: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full bg-[#0D0D0B] border border-[#E5E2D9]/20 p-2 text-center text-[#E5E2D9]"
                    />
                  </div>
                ))}
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#C4A484] text-[#0D0D0B] font-bold uppercase tracking-widest py-3 mt-6 hover:bg-[#b09376]"
              >
                Registrar Venta
              </button>
            </form>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
