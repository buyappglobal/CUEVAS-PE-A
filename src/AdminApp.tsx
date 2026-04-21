import React, { useEffect, useState } from 'react';
import { db, auth, loginWithGoogle, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, increment, where } from 'firebase/firestore';
import { Calendar, Clock, Ticket, Users, FileText, CheckCircle, Plus, Trash2, LogOut, Mountain, X } from 'lucide-react';

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data states
  const [reservations, setReservations] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  
  // Login form states
  const [emailInput, setEmailInput] = useState('taquilla@cuevas.com');
  const [passwordInput, setPasswordInput] = useState('');
  
  // New manual reservation form
  const [showNewModal, setShowNewModal] = useState(false);
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
          const adminDoc = await getDoc(doc(db, 'admins', u.uid));
          setIsAdmin(adminDoc.exists());
          if (adminDoc.exists()) {
            fetchData(dateFilter);
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

  const fetchData = async (d: string) => {
    try {
      const q = query(collection(db, 'reservations'), where('date', '==', d));
      const snap = await getDocs(q);
      const res = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservations(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchData(dateFilter);
  }, [dateFilter, isAdmin]);

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = newRes.tickets.adult + newRes.tickets.reduced + newRes.tickets.childFree;
    if (total === 0) return alert("Selecciona tickets");

    const payload = {
      date: dateFilter,
      time: newRes.time,
      customerName: newRes.customerName,
      customerEmail: newRes.customerEmail || 'manual@taquilla.local',
      tickets: newRes.tickets,
      totalTickets: total,
      amount: 0, // In taquilla, you might not track € here, or calculate it.
      source: 'manual',
      status: 'confirmed',
      localizador: 'MAN' + String(Math.floor(Date.now() / 1000)).substring(4, 12),
      createdAt: Date.now(),
      ownerId: user?.uid
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
      fetchData(dateFilter);
      alert("Reserva manual creada con éxito.");
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loginWithEmail(emailInput, passwordInput);
    } catch(err: any) {
      alert("Error iniciando sesión. Comprueba que la contraseña es correcta y que has habilitado el proveedor de 'Correo y Contraseña' en Firebase Authentication.");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0D0D0B] text-white flex items-center justify-center">Cargando...</div>;

  if (!user || !isAdmin) {
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
                type="email" 
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

  // Aggregate capacities from reservations directly to show the operator
  const slots = ['11:00', '12:30', '16:00'];
  const capacities = slots.reduce((acc, slot) => {
    const slotRes = reservations.filter(r => r.time === slot);
    const booked = slotRes.reduce((sum, r) => sum + r.totalTickets, 0);
    acc[slot] = { booked, remaining: 30 - booked };
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
          <span className="text-[#E5E2D9]/60">{user.email}</span>
          <button onClick={logout} className="text-[#c48484] hover:text-red-400 flex items-center gap-1">
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
          <div className="flex items-center gap-4">
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-[#151515] border border-[#E5E2D9]/20 p-2 text-[#E5E2D9] [&::-webkit-calendar-picker-indicator]:invert"
            />
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
        <div className="bg-[#151515] border border-[#E5E2D9]/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0D0D0B] text-[#E5E2D9]/50 uppercase tracking-wider text-[10px] border-b border-[#E5E2D9]/10">
              <tr>
                <th className="p-4">Hora</th>
                <th className="p-4">Localizador</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Tickets (A/R/I)</th>
                <th className="p-4">Total</th>
                <th className="p-4">Origen</th>
                <th className="p-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#E5E2D9]/40 italic">
                    No hay reservas registradas en esta fecha.
                  </td>
                </tr>
              ) : (
                reservations.sort((a,b) => a.time.localeCompare(b.time)).map(r => (
                  <tr key={r.id} className="border-b border-[#E5E2D9]/5 hover:bg-[#E5E2D9]/5 transition-colors">
                    <td className="p-4 font-mono text-[#C4A484]">{r.time}</td>
                    <td className="p-4 font-mono text-xs text-[#E5E2D9]/50">#{r.localizador || 'N/A'}</td>
                    <td className="p-4">
                      <div>{r.customerName}</div>
                      <div className="text-[10px] text-[#E5E2D9]/40">{r.customerEmail}</div>
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
                      <span className={`px-2 py-1 text-[10px] uppercase tracking-wider ${r.status === 'confirmed' || r.status === 'paid' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-orange-900/30 text-orange-300'}`}>
                        {r.status === 'paid' ? 'Pagado (Web)' : r.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

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
                  value={newRes.customerName}
                  onChange={e => setNewRes({...newRes, customerName: e.target.value})}
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
