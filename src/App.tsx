/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './firebase';
import { collection, doc, setDoc, getDoc, updateDoc, increment, query, where, onSnapshot } from 'firebase/firestore';
import { Gallery } from './components/Gallery';
import { 
  MapPin, Calendar, Ticket, ChevronRight, Mountain, 
  Leaf, History, Utensils, ArrowRight, Clock, Users, X, Info, Camera, Tent,
  CheckCircle, AlertCircle, User, Mail, Phone, FileText, Download, Share2
} from 'lucide-react';

const FadeIn = ({ children, delay = 0, ...props }: { children: React.ReactNode, delay?: number, key?: React.Key }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.7, delay, ease: "easeOut" }}
    {...props}
  >
    {children}
  </motion.div>
);

export default function App() {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [redsysParams, setRedsysParams] = useState<any>(null);
  const [currentOrderId, setCurrentOrderId] = useState('');
  const [isNormasModalOpen, setIsNormasModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isFullOrdinanceOpen, setIsFullOrdinanceOpen] = useState(false);
  const [selectedTour, setSelectedTour] = useState('');
  
  // Modal states for dynamic price calc
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [tickets, setTickets] = useState({ adult: 0, reduced: 0, childFree: 0 });
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('payment') === 'success') {
      setPaymentStatus('success');
      // Clean url
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (searchParams.get('payment') === 'error') {
      setPaymentStatus('error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const openBooking = (tourName: string = '') => {
    setSelectedTour(tourName);
    setIsBookingModalOpen(true);
  };

  // Safely parse YYYY-MM-DD date for cross-browser compatibility (avoids "Invalid Date" on some engines)
  const getSafeDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  // Holidays list (YYYY-MM-DD)
  const NATIONAL_HOLIDAYS = [
    '2024-01-01', '2024-01-06', '2024-03-28', '2024-03-29', '2024-05-01', '2024-08-15', '2024-10-12', '2024-11-01', '2024-12-06', '2024-12-08', '2024-12-25',
    '2025-01-01', '2025-01-06', '2025-04-17', '2025-04-18', '2025-05-01', '2025-08-15', '2025-10-12', '2025-11-01', '2025-12-06', '2025-12-08', '2025-12-25',
    '2026-01-01', '2026-01-06', '2026-04-02', '2026-04-03', '2026-05-01', '2026-08-15', '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25'
  ];

  const isHoliday = (dateStr: string) => NATIONAL_HOLIDAYS.includes(dateStr);

  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
  };

  const isSelectableDate = (dateStr: string) => {
    if (!dateStr) return false;
    // No online sales for today
    if (isToday(dateStr)) return false;
    return isWeekend(dateStr) || isHoliday(dateStr);
  };

  const isWeekend = (dateStr: string) => {
    const d = getSafeDate(dateStr);
    if (!d) return false;
    const day = d.getDay();
    return day === 0 || day === 6; // 0 = Sun, 6 = Sat
  };

  const isBatSeason = (dateStr: string) => {
    const d = getSafeDate(dateStr);
    if (!d) return false;
    const m = d.getMonth() + 1; // 1-12
    const day = d.getDate();
    
    // March 30 to Sept 30
    if (m > 3 && m < 9) return true;
    if (m === 3 && day >= 30) return true;
    if (m === 9 && day <= 30) return true;
    return false;
  };

  // Calculations
  const isSpecialPriceDay = isWeekend(date) || isHoliday(date);
  const calcAdultPrice = isSpecialPriceDay ? 12 : 10;
  const calcReducedPrice = isSpecialPriceDay ? 10 : 8;
  const discount = isBatSeason(date) ? 2 : 0;
  
  // Defensive calculation to prevent NaN or unexpected zeros
  const finalAdultPrice = Math.max(0, (calcAdultPrice || 0) - (discount || 0));
  const finalReducedPrice = Math.max(0, (calcReducedPrice || 0) - (discount || 0));
  
  // Dynamic capacities
  const MAX_ONLINE_LIMIT = 20;
  const TOTAL_CAPACITY = 30;
  const [slotCapacities, setSlotCapacities] = useState<Record<string, number>>({});
  
  const totalPrice = React.useMemo(() => {
    const adultNum = Number(tickets.adult) || 0;
    const reducedNum = Number(tickets.reduced) || 0;
    return (adultNum * finalAdultPrice) + (reducedNum * finalReducedPrice) || 0;
  }, [tickets.adult, tickets.reduced, finalAdultPrice, finalReducedPrice]);

  const totalSelectedTickets = React.useMemo(() => {
    return (Number(tickets.adult) || 0) + (Number(tickets.reduced) || 0) + (Number(tickets.childFree) || 0);
  }, [tickets.adult, tickets.reduced, tickets.childFree]);
  
  // Realtime fetching of capacity when date changes
  useEffect(() => {
    if (!date || !isBookingModalOpen) return;
    
    // Listen to all slots for the selected date
    const q = query(collection(db, 'slots'), where('date', '==', date));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const caps: Record<string, number> = {};
      // Initialize with 0 for the standard times
      ['11:00', '12:30', '16:00'].forEach(t => caps[t] = 0);
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.time) {
          caps[data.time] = data.bookedCount || 0;
        }
      });
      setSlotCapacities(caps);
    }, (error) => {
      console.error("Error listening to slots:", error);
    });
    
    return () => unsubscribe();
  }, [date, isBookingModalOpen]);
  
  const currentSlotBooked = (time && slotCapacities[time]) ? slotCapacities[time] : 0;
  
  // Online limit logic: Only 20 allowed online, even if total is 30
  const remainingOnlineLimit = Math.max(0, MAX_ONLINE_LIMIT - currentSlotBooked);
  const remainingTotalLimit = Math.max(0, TOTAL_CAPACITY - currentSlotBooked);
  
  // The client can only buy up to 20 online, or whatever is left of the 30
  const remainingCapacity = Math.min(remainingOnlineLimit, remainingTotalLimit);
  const canAddMore = totalSelectedTickets < remainingCapacity;

  const updateTicket = (type: 'adult'|'reduced'|'childFree', delta: number) => {
    setTickets(prev => {
      const newAmount = Math.max(0, prev[type] + delta);
      // Prevenir superar el aforo máximo global
      const currentOthers = Object.entries(prev)
        .filter(([k]) => k !== type)
        .reduce((sum, [_, v]) => sum + (v as number), 0);
      
      if (currentOthers + newAmount > remainingCapacity) {
        return prev;
      }
      return {
        ...prev,
        [type]: newAmount
      };
    });
  };

  const handleContinueToSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      alert("Por favor, seleccione fecha y horario.");
      return;
    }
    if (totalPrice === 0 && tickets.childFree === 0) return;
    
    if (totalPrice === 0) {
       alert("Debe seleccionar al menos una entrada de pago para procesar la reserva.");
       return;
    }

    setIsLoadingPayment(true);
    
    try {
      const now = new Date();
      const YYYY = now.getFullYear().toString();
      const MM = (now.getMonth() + 1).toString().padStart(2, '0');
      const DD = now.getDate().toString().padStart(2, '0');
      const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
      const orderId = `${YYYY}${MM}${DD}${randomPart}`.substring(0, 12);
      setCurrentOrderId(orderId);

      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId, 
          amount: totalPrice, 
          tickets, 
          date, 
          time, 
          customer: { name: customerName, email: customerEmail } 
        })
      });
      
      const session = await response.json();

      if (!response.ok) {
        throw new Error(session.details || session.error || "Error registrando la reserva en el sistema");
      }

      setRedsysParams(session);
      
      // Cerramos el modal de reserva y abrimos el de resumen
      setIsBookingModalOpen(false);
      setIsSummaryModalOpen(true);
      setIsLoadingPayment(false);
    } catch (error: any) {
      console.error(error);
      alert(`Error al registrar los datos: ${error.message || "Por favor, inténtelo de nuevo."}`);
      setIsLoadingPayment(false);
    }
  };

  const executePayment = () => {
    if (!redsysParams) return;

    try {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = redsysParams.url;

      const versionInput = document.createElement('input');
      versionInput.type = 'hidden';
      versionInput.name = 'Ds_SignatureVersion';
      versionInput.value = redsysParams.version;
      form.appendChild(versionInput);

      const paramsInput = document.createElement('input');
      paramsInput.type = 'hidden';
      paramsInput.name = 'Ds_MerchantParameters';
      paramsInput.value = redsysParams.paramsBase64;
      form.appendChild(paramsInput);

      const signatureInput = document.createElement('input');
      signatureInput.type = 'hidden';
      signatureInput.name = 'Ds_Signature';
      signatureInput.value = redsysParams.signature;
      form.appendChild(signatureInput);

      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      console.error(error);
      alert("Error lanzando la pasarela de pago.");
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Cuevas de Alájar - Reserva tu Visita',
      text: 'Descubre la magia de las Cuevas de Alájar en la Peña de Arias Montano. ¡Reserva tus entradas online!',
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        alert('Enlace copiado al portapapeles');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error sharing:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0B] font-sans text-[#E5E2D9] selection:bg-[#C4A484] selection:text-[#0D0D0B] overflow-x-hidden">
      {/* Notificaciones de Pago */}
      <AnimatePresence>
        {paymentStatus && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className={`fixed top-0 inset-x-0 z-[60] flex items-center justify-center p-4`}
          >
            <div className={`p-4 md:p-6 w-full max-w-lg border flex gap-4 ${paymentStatus === 'success' ? 'bg-[#151a14] border-[#C4A484]/40' : 'bg-[#1a1111] border-red-900/40'}`}>
              <div className="shrink-0 mt-1">
                 {paymentStatus === 'success' ? <CheckCircle className="w-6 h-6 text-[#C4A484]" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
              </div>
              <div className="flex-grow">
                <h3 className={`font-serif text-xl mb-1 ${paymentStatus === 'success' ? 'text-[#E5E2D9]' : 'text-red-100'}`}>
                  {paymentStatus === 'success' ? '¡Reserva Completada!' : 'Pago Denegado'}
                </h3>
                <p className="text-sm opacity-70">
                  {paymentStatus === 'success' ? 'Hemos procesado su pago correctamente. Revise su correo para los tickets digitales.' : 'La operación con tarjeta ha sido rechazada por el banco. Por favor, vuelva a intentarlo.'}
                </p>
              </div>
              <button onClick={() => setPaymentStatus(null)} className="shrink-0 text-[#E5E2D9]/50 hover:text-[#E5E2D9]">
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0D0D0B]/90 backdrop-blur-md border-b border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity cursor-pointer group"
          >
            <img 
              src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" 
              alt="Peña Arias Montano" 
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-serif text-xl tracking-[0.05em] uppercase">Peña Arias Montano</span>
          </button>
          
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden md:flex items-center gap-8 text-[11px] uppercase tracking-[0.15em] font-medium text-[#E5E2D9]/70">
              <a href="#descubre" className="hover:text-[#E5E2D9] transition-colors">Las Cuevas</a>
              <a href="#galeria" className="hover:text-[#E5E2D9] transition-colors">Galería</a>
              <a href="#visitas" className="hover:text-[#E5E2D9] transition-colors">Visitas y Tarifas</a>
              <a href="#alajar" className="hover:text-[#E5E2D9] transition-colors">Descubre Alájar</a>
            </div>
            
            <div className="flex items-center gap-4 md:gap-6 md:border-l md:border-[#E5E2D9]/10 md:pl-6">
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleShare}
                className="text-[#C4A484] hover:text-[#E5E2D9] transition-colors p-2"
                title="Compartir web"
              >
                <Share2 className="w-5 h-5 md:w-4 md:h-4" />
              </motion.button>
              <button 
                onClick={() => openBooking()} 
                className="hidden sm:block text-[#C4A484] hover:opacity-100 opacity-80 font-bold transition-opacity text-[11px] uppercase tracking-[0.15em]"
              >
                Solicitar Reserva
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 h-[90vh] min-h-[600px] flex items-center justify-center">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img 
            src="https://solonet.es/wp-content/uploads/2026/04/DSC08546-scaled.jpg" 
            alt="Interior de las Cuevas" 
            className="w-full h-full object-cover opacity-85"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-[#0D0D0B]/30"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0B] via-[#0D0D0B]/20 to-transparent"></div>
        </div>
        
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto mt-12">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-[#C4A484] uppercase tracking-[0.3em] text-[12px] font-medium mb-6"
          >
            Apertura al Público · Sierra de Huelva
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
            className="text-5xl md:text-7xl lg:text-[80px] font-serif text-[#E5E2D9] leading-[1.1] mb-8 font-light"
          >
            Adéntrate en el <br className="hidden md:block"/>
            <span className="text-[#C4A484]">mundo subterráneo</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-[18px] text-[#E5E2D9]/80 mb-10 max-w-2xl mx-auto font-light leading-[1.6]"
          >
            Tras años de cuidadosa adaptación para proteger su entorno, las históricas cuevas de la Peña de Arias Montano abren sus puertas al visitante.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button onClick={() => openBooking()} className="px-8 py-4 bg-[#C4A484] text-[#0D0D0B] rounded-none text-[12px] uppercase font-bold tracking-[0.1em] hover:bg-[#b09376] transition-all w-full sm:w-auto">
              Solicitar Reserva
            </button>
            <a href="#descubre" className="px-8 py-4 bg-transparent border border-[#E5E2D9]/30 text-[#E5E2D9] rounded-none uppercase text-[12px] font-bold tracking-[0.1em] hover:bg-[#E5E2D9]/5 transition-all w-full sm:w-auto flex justify-center items-center gap-2">
              Descubrir las cuevas <ChevronRight className="w-4 h-4" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Intro / Patrimonio */}
      <section id="descubre" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif mb-6 leading-[1.1] font-light">
              Explora las entrañas de la <span className="text-[#C4A484]">Peña Monumental</span>.
            </h2>
            <p className="text-[18px] text-[#E5E2D9]/60 mb-8 leading-[1.6]">
              Por primera vez, las espectaculares galerías subterráneas de la Peña de Arias Montano están accesibles al público. Un recorrido acondicionado meticulosamente permite maravillar a los visitantes con un paisaje kárstico subterráneo de estalactitas, estalagmitas y columnas calcáreas de excepcional valor.
            </p>
            
            <div className="grid sm:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="shrink-0 mt-1">
                  <Mountain className="w-6 h-6 text-[#C4A484]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl mb-2 text-[#E5E2D9]">Sima de los caballos</h3>
                  <p className="text-sm text-[#E5E2D9]/60 leading-[1.6]">Una impresionante cavidad vertical donde se pueden apreciar caprichosas formas geológicas.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="shrink-0 mt-1">
                  <History className="w-6 h-6 text-[#C4A484]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl mb-2 text-[#E5E2D9]">Palacio Oscuro</h3>
                  <p className="text-sm text-[#E5E2D9]/60 leading-[1.6]">Un recóndito pasaje que revela vestigios y el misticismo del baluarte rocoso que enamoró a Arias Montano.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="shrink-0 mt-1">
                  <Mountain className="w-6 h-6 text-[#C4A484]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl mb-2 text-[#E5E2D9]">Sillita del rey</h3>
                  <p className="text-sm text-[#E5E2D9]/60 leading-[1.6]">Formación emblemática esculpida por el tiempo, testimonio del legado histórico de la Peña.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <div className="aspect-[4/5] rounded-none border border-[#E5E2D9]/10 bg-[#E5E2D9]/[0.02] overflow-hidden">
              <img 
                src="https://solonet.es/wp-content/uploads/2026/04/DSC08544-scaled.jpg" 
                alt="Formaciones rocosas interiores" 
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000 opacity-90 grayscale-[50%]"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Context Badge */}
            <div className="absolute -bottom-8 -left-8 bg-[#0D0D0B] border border-[#E5E2D9]/10 p-6 rounded-none shadow-2xl max-w-xs hidden sm:block">
              <p className="font-serif text-lg leading-snug">"Un viaje al pasado geológico, donde el agua y el tiempo esculpieron la roca."</p>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <Gallery />

      {/* Visitas Guiadas */}
      <section id="visitas" className="py-24 bg-[#0D0D0B] border-t border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-[64px] font-serif mb-6 font-light leading-[1.1]">Tarifas y Entradas</h2>
            <p className="text-[#E5E2D9]/60 text-lg">Asegura tu plaza. El aforo al interior de las cuevas está estrictamente limitado para la conservación del espacio geológico.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Tarjeta 1 */}
            <FadeIn delay={0}>
              <div className="bg-[#E5E2D9]/[0.02] border border-[#E5E2D9]/[0.05] hover:border-[#C4A484]/50 transition-colors group h-full flex flex-col p-8 md:p-10 rounded-none">
                <div className="mb-6 flex justify-between items-start">
                  <div className="bg-[#0D0D0B] border border-[#E5E2D9]/10 w-12 h-12 rounded-none flex items-center justify-center">
                    <Ticket className="w-5 h-5 text-[#C4A484]" />
                  </div>
                </div>
                <h3 className="font-serif text-3xl mb-4 text-[#E5E2D9]">Entrada General y Reducida</h3>
                <p className="text-[#E5E2D9]/60 text-sm leading-[1.6] mb-8 flex-grow">
                  Acceso a las cuevas acondicionadas. Tarifa general desde 10€. Tarifa reducida (desde 8€) disponible para mayores de 65, tarjeta Andalucía Junta 65, diversidad funcional, Carnet Joven y niños (4-12 años). Formato gratuito para menores de 4. <br/><br/>
                  <span className="italic text-[11px]">* Los fines de semana y festivos se aplica un suplemento de +2€. Descuento temporal (-2€) aplicado en temporada de reposo de murciélagos.</span>
                </p>
                <div className="flex items-center justify-between mt-auto pt-6 border-t border-[#E5E2D9]/10">
                  <div className="flex flex-col">
                    <span className="text-3xl font-serif text-[#E5E2D9]">Desde 8€</span>
                  </div>
                  <button onClick={() => openBooking('Visita Guidada a las Cuevas')} className="py-3 px-6 bg-[#E5E2D9]/5 hover:bg-[#C4A484] hover:text-[#0D0D0B] text-[#C4A484] flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-bold transition-colors">
                    Solicitar Reserva
                  </button>
                </div>
              </div>
            </FadeIn>

            {/* Tarjeta 2 */}
            <FadeIn delay={0.2}>
              <div className="bg-[#E5E2D9]/[0.02] border border-[#E5E2D9]/[0.05] hover:border-[#C4A484]/50 transition-colors group h-full flex flex-col p-8 md:p-10 rounded-none">
                <div className="mb-6 flex justify-between items-start">
                  <div className="bg-[#0D0D0B] border border-[#E5E2D9]/10 w-12 h-12 rounded-none flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#C4A484]" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.1em] font-medium text-[#C4A484]">Grupos +20 pax</span>
                </div>
                <h3 className="font-serif text-3xl mb-4 text-[#E5E2D9]">Grupos y Colegios</h3>
                <p className="text-[#E5E2D9]/60 text-sm leading-[1.6] mb-8 flex-grow">
                  Experiencia adaptada para agrupaciones, escuelas y empresas de turismo con convenio. Reserva de franjas horarias exclusivas y tarifa reducida en bloque para grupos de más de 20 estudiantes. (Es obligatoria la reserva previa por parte del Centro o AMPA).
                </p>
                <div className="flex flex-col items-center justify-center mt-auto pt-6 border-t border-[#E5E2D9]/10 text-center gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C4A484] mb-1 font-bold">Solicitar Reserva</span>
                  <span className="text-[#E5E2D9] text-base font-serif lowercase tracking-wide">info@cuevasdealajar.com</span>
                  <span className="text-[#E5E2D9] text-base font-serif tracking-wide">671 844 875</span>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Descubre Alájar Section */}
      <section id="alajar" className="py-24 px-6 border-t border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <FadeIn>
            <h2 className="text-4xl md:text-5xl font-serif mb-6 leading-[1.1] font-light italic">
              Descubre <span className="text-[#C4A484] not-italic font-normal">Alájar</span>
            </h2>
            <p className="text-[18px] text-[#E5E2D9]/60 mb-8 leading-[1.6]">
              En el corazón del Parque Natural Sierra de Aracena y Picos de Aroche se encuentra Alájar, uno de los municipios más singulares de la provincia de Huelva. Declarado Conjunto Histórico-Artístico, su trazado medieval y sus fachadas blancas custodiadas por el monumento natural de la Peña de Arias Montano, lo convierten en una parada obligatoria para el viajero.
            </p>
            <div className="space-y-4 mb-10">
              <div className="flex items-start gap-4">
                <Leaf className="w-5 h-5 text-[#C4A484] shrink-0 mt-1" />
                <p className="text-sm text-[#E5E2D9]/70">Senderos naturales y rutas de senderismo de valor excepcional.</p>
              </div>
              <div className="flex items-start gap-4">
                <Utensils className="w-5 h-5 text-[#C4A484] shrink-0 mt-1" />
                <p className="text-sm text-[#E5E2D9]/70">Gastronomía tradicional centrada en el ibérico y la micología.</p>
              </div>
            </div>
            
            <a 
              href="https://www.alajar.es/es/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 bg-[#C4A484] text-[#0D0D0B] rounded-none text-[12px] uppercase font-bold tracking-[0.1em] hover:bg-[#b09376] transition-all"
            >
              Descubre Alájar <ArrowRight className="w-4 h-4" />
            </a>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <div className="aspect-video lg:aspect-square relative overflow-hidden group">
              <img 
                src="https://picsum.photos/seed/alajar/1200/1200" 
                alt="Vistas de Alájar" 
                className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000 grayscale-[30%]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0B]/60 to-transparent"></div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Footer / Info */}
      <footer className="bg-[#0D0D0B] text-[#E5E2D9]/40 py-20 border-t border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 text-[10px] uppercase tracking-[0.1em]">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <img 
                src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" 
                alt="Peña Arias Montano" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="font-serif text-lg normal-case tracking-[0.05em] text-[#E5E2D9]">Peña Arias Montano</span>
            </div>
            <p className="max-w-sm leading-[1.6] mb-8 normal-case text-[12px] opacity-70">
              Protegiendo y valorando el patrimonio histórico y natural de Alájar. Reserva oficial de entradas y visitas.
            </p>
            <div className="flex gap-4">
               {/* Redes sociales */}
               <a href="https://www.instagram.com/aytoalajar/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-none border border-[#E5E2D9]/20 flex items-center justify-center hover:bg-[#E5E2D9]/10 hover:text-[#E5E2D9] transition-colors cursor-pointer text-sm normal-case">Ig</a>
               <a href="https://www.facebook.com/aytoalajar" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-none border border-[#E5E2D9]/20 flex items-center justify-center hover:bg-[#E5E2D9]/10 hover:text-[#E5E2D9] transition-colors cursor-pointer text-sm normal-case">Fb</a>
            </div>
          </div>
          
          <div>
            <h4 className="text-[#C4A484] mb-6">Información</h4>
            <ul className="space-y-4 text-[#E5E2D9]/40">
              <li><a href="https://maps.app.goo.gl/fGMEYWZvqwkUCWcN7" target="_blank" rel="noopener noreferrer" className="hover:text-[#E5E2D9] transition-colors">Cómo llegar</a></li>
              <li><button onClick={() => setIsNormasModalOpen(true)} className="hover:text-[#E5E2D9] transition-colors text-left uppercase">Normas del recinto</button></li>
              <li><button onClick={() => setIsAccessModalOpen(true)} className="hover:text-[#E5E2D9] transition-colors text-left uppercase">Accesibilidad</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#C4A484] mb-6">Contacto</h4>
            <ul className="space-y-4 text-[#E5E2D9]/40">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="normal-case text-[12px] font-bold text-[#E5E2D9]/60">Ayuntamiento de Alájar</span>
                  <span className="normal-case text-[12px]">Plaza España nº3, 21340 Alájar (Huelva)</span>
                  <span className="text-[10px]">CIF: P2100100C</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 shrink-0 mt-1" />
                <div className="flex flex-col gap-1">
                  <span className="normal-case text-[12px]">959 12 57 10 / 671 844 875</span>
                  <span className="text-[10px] text-[#E5E2D9]/30">Horario de Atención telefónica de 9-14 horas</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 shrink-0" />
                <div className="flex flex-col">
                  <span className="normal-case text-[12px]">info@cuevasdealajar.com</span>
                  <span className="normal-case text-[12px]">secretaria@alajar.es</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-[#E5E2D9]/10 text-[10px] uppercase tracking-[0.1em] font-bold opacity-80 flex flex-col sm:flex-row justify-between items-center">
          <p>© {new Date().getFullYear()} Cuevas Peña Arias Montano. Todos los derechos reservados.</p>
          <div className="flex gap-4 mt-4 sm:mt-0 items-center">
            <button onClick={() => setIsLegalModalOpen(true)} className="hover:text-[#E5E2D9] uppercase tracking-[0.1em] font-black border-b border-transparent hover:border-white transition-all">Aviso Legal</button>
            <button onClick={() => setIsPrivacyModalOpen(true)} className="hover:text-[#E5E2D9] uppercase tracking-[0.1em] font-black border-b border-transparent hover:border-white transition-all">Privacidad</button>
            <span className="w-px h-3 bg-[#E5E2D9]/20"></span>
            <a href="https://www.cuevasdealajar.com/admin" className="text-[#C4A484] hover:text-[#E5E2D9] transition-colors uppercase tracking-[0.1em] font-black">Admin</a>
          </div>
        </div>
      </footer>

      {/* Booking Modal Overlay */}
      <AnimatePresence>
        {isBookingModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0D0B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-lg border border-[#E5E2D9]/10 relative shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
                <button 
                  onClick={() => setIsBookingModalOpen(false)}
                  className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center bg-[#E5E2D9]/5 hover:bg-[#E5E2D9]/10 border border-[#E5E2D9]/10 transition-colors z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <span className="text-[#C4A484] text-[10px] uppercase tracking-[0.2em] mb-2 block">Reserva de Entradas</span>
                <h2 className="font-serif text-3xl mb-6 pr-8 font-light">Confirma tu visita</h2>
                
                <form className="space-y-6" onSubmit={handleContinueToSummary}>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mb-2">Fecha y Horario de Visita</label>
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      {/* Date */}
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4A484]" />
                        <input 
                          type="date" 
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none pl-10 pr-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484] [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" 
                          required 
                        />
                      </div>
                      {/* Time Slots */}
                      <div className="grid grid-cols-3 gap-2">
                        {['11:00', '12:30', '16:00'].map(t => {
                          const booked = slotCapacities[t] || 0;
                          // Online capacity is 20, but cannot exceed 30 total
                          const free = Math.max(0, Math.min(MAX_ONLINE_LIMIT - booked, TOTAL_CAPACITY - booked));
                          const isFull = free === 0;
                          const isDateAllowed = isSelectableDate(date);
                          const isDisabled = isFull || !isDateAllowed;
                          
                          return (
                          <button
                            key={t}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => setTime(t)}
                            className={`py-3 text-[12px] font-bold tracking-[0.1em] border rounded-none transition-all flex flex-col items-center justify-center gap-1 ${time === t ? 'bg-[#C4A484] text-[#0D0D0B] border-[#C4A484]' : isDisabled ? 'bg-red-900/10 border-red-900/20 text-red-500/50 cursor-not-allowed' : 'bg-transparent border-[#E5E2D9]/20 text-[#E5E2D9] hover:border-[#C4A484]/50 hover:text-[#C4A484]'}`}
                          >
                            <div className="flex items-center gap-2"><Clock className="w-3 h-3" /> {t}</div>
                            <span className="text-[9px] opacity-70 tracking-normal font-normal">
                              {!isDateAllowed ? 'Cerrado' : isFull ? 'Completo' : `${free} libres`}
                            </span>
                          </button>
                        )})}
                      </div>
                    </div>
                    {date && !isSelectableDate(date) && (
                      <p className="text-[10px] text-red-400 mt-2 uppercase tracking-[0.05em] flex items-center gap-1">
                        <Info className="w-3 h-3" /> {isToday(date) ? "No se realizan ventas online para el mismo día." : "Solo se realizan visitas Sábados, Domingos y Festivos Nacionales."}
                      </p>
                    )}
                    {date && isSelectableDate(date) && isBatSeason(date) && (
                      <p className="text-[10px] text-[#C4A484] mt-2 uppercase tracking-[0.05em] flex items-center gap-1">
                        <Info className="w-3 h-3" /> Descuento de temporada aplicado (Cierre Palacio Oscuro).
                      </p>
                    )}
                    {date && isSpecialPriceDay && (
                      <p className="text-[10px] text-white/50 mt-2 uppercase tracking-[0.05em] flex items-center gap-1">
                        <Info className="w-3 h-3" /> Tarifa de fin de semana / festivo aplicada.
                      </p>
                    )}
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between border-b border-[#E5E2D9]/10 pb-2 mb-4">
                      <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50">Selección de Entradas</label>
                      <span className={`text-[10px] uppercase tracking-[0.1em] font-medium ${remainingCapacity - totalSelectedTickets === 0 ? 'text-red-400' : 'text-[#C4A484]'}`}>
                        {remainingCapacity - totalSelectedTickets} restantes de {remainingCapacity} disponibles
                      </span>
                    </div>
                    
                    {/* Adult Entry */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[#E5E2D9] text-sm font-serif">Adulto General</p>
                        <p className="text-[10px] text-[#E5E2D9]/50">{finalAdultPrice}€ por persona</p>
                      </div>
                      <div className="flex items-center gap-3 bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 p-1">
                        <button type="button" onClick={() => updateTicket('adult', -1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484]">-</button>
                        <span className="w-4 text-center text-sm font-medium">{tickets.adult}</span>
                        <button type="button" disabled={!canAddMore} onClick={() => updateTicket('adult', 1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484] disabled:opacity-20">+</button>
                      </div>
                    </div>

                    {/* Reduced Entry */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[#E5E2D9] text-sm font-serif">Entrada Reducida <span className="text-[#C4A484]">*</span></p>
                        <p className="text-[10px] text-[#E5E2D9]/50">{finalReducedPrice}€ por persona</p>
                      </div>
                      <div className="flex items-center gap-3 bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 p-1">
                        <button type="button" onClick={() => updateTicket('reduced', -1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484]">-</button>
                        <span className="w-4 text-center text-sm font-medium">{tickets.reduced}</span>
                        <button type="button" disabled={!canAddMore} onClick={() => updateTicket('reduced', 1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484] disabled:opacity-20">+</button>
                      </div>
                    </div>

                    {/* Infant Entry */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[#E5E2D9] text-sm font-serif">Menores de 4 años</p>
                        <p className="text-[10px] text-[#E5E2D9]/50">Gratis (acompañados)</p>
                      </div>
                      <div className="flex items-center gap-3 bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 p-1">
                        <button type="button" onClick={() => updateTicket('childFree', -1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484]">-</button>
                        <span className="w-4 text-center text-sm font-medium">{tickets.childFree}</span>
                        <button type="button" disabled={!canAddMore} onClick={() => updateTicket('childFree', 1)} className="w-8 h-8 flex items-center justify-center text-[#E5E2D9]/50 hover:text-[#C4A484] disabled:opacity-20">+</button>
                      </div>
                    </div>
                    <p className="text-[9px] text-[#E5E2D9]/40 mt-4 mb-8 leading-relaxed">
                      * Tarifa reducida válida para: Mayores de 65 años, tarjeta «Andalucía Junta 65», discapacidad &gt; 33%, Carnet Joven y niños de 4 a 12 años. Se requerirá acreditación en el acceso.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mb-4 border-b border-[#E5E2D9]/10 pb-2">Datos Personales</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4A484]" />
                        <input 
                          type="text" 
                          placeholder="Nombre y apellidos" 
                          required 
                          value={customerName} 
                          onChange={e => setCustomerName(e.target.value)} 
                          className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none pl-10 pr-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484] placeholder:text-[#E5E2D9]/30" 
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4A484]" />
                        <input 
                          type="email" 
                          placeholder="Correo electrónico" 
                          required 
                          value={customerEmail} 
                          onChange={e => setCustomerEmail(e.target.value)} 
                          className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none pl-10 pr-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484] placeholder:text-[#E5E2D9]/30" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E2D9]/10 pt-6 mt-6">
                    <div className="flex items-end justify-between mb-6">
                      <span className="text-[11px] uppercase tracking-[0.1em] text-[#E5E2D9]/70">Total a Pagar</span>
                      <span className="text-4xl font-serif text-[#C4A484] leading-none">{totalPrice.toFixed(2)}€</span>
                    </div>
                    <button 
                      type="submit" 
                      disabled={isLoadingPayment || (totalPrice === 0 && tickets.childFree === 0)}
                      className="w-full bg-[#C4A484] disabled:opacity-50 disabled:cursor-not-allowed text-[#0D0D0B] rounded-none py-4 text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#b09376] transition-colors active:scale-[0.98] flex items-center justify-center"
                    >
                      {isLoadingPayment ? <span className="animate-pulse">Registrando datos...</span> : 'Continuar al Resumen'}
                    </button>
                    <p className="text-center text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mt-4 flex items-center justify-center gap-1">
                      <Info className="w-3 h-3" /> Plataforma de pago 100% segura.
                    </p>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Modal */}
      <AnimatePresence>
        {isSummaryModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-[#0D0D0B]/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0D0D0B] border border-[#C4A484]/30 p-8 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setIsSummaryModalOpen(false)}
                className="absolute right-6 top-6 text-[#E5E2D9]/50 hover:text-[#E5E2D9]"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <CheckCircle className="w-12 h-12 text-[#C4A484] mx-auto mb-4" />
                <h2 className="font-serif text-3xl text-[#E5E2D9]">Resumen de Pedido</h2>
                <p className="text-[#C4A484] text-[10px] uppercase tracking-[0.2em] mt-2">Localizador: {currentOrderId}</p>
              </div>

              <div className="space-y-4 border-t border-b border-[#E5E2D9]/10 py-6 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-[#E5E2D9]/50">Visitante</span>
                  <span className="text-[#E5E2D9] font-medium">{customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#E5E2D9]/50">Fecha</span>
                  <span className="text-[#E5E2D9] font-medium">{date.split('-').reverse().join('/')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#E5E2D9]/50">Hora</span>
                  <span className="text-[#E5E2D9] font-medium">{time}h</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-[#E5E2D9]/5">
                  <span className="text-[#E5E2D9]/50">Entradas</span>
                  <div className="text-right">
                    {tickets.adult > 0 && <div className="text-[#E5E2D9]">{tickets.adult}x Adulto</div>}
                    {tickets.reduced > 0 && <div className="text-[#E5E2D9]">{tickets.reduced}x Reducida</div>}
                    {tickets.childFree > 0 && <div className="text-[#E5E2D9]">{tickets.childFree}x Infantil</div>}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-8">
                <span className="text-sm uppercase tracking-widest text-[#E5E2D9]/70">Total a Pagar</span>
                <span className="text-3xl font-serif text-[#C4A484]">{totalPrice.toFixed(2)}€</span>
              </div>

              <button 
                onClick={executePayment}
                className="w-full bg-[#C4A484] text-[#0D0D0B] py-4 rounded-none text-[12px] font-bold uppercase tracking-[0.2em] hover:bg-[#b09376] transition-all flex items-center justify-center gap-2"
              >
                Confirmar y Pagar <ArrowRight className="w-4 h-4" />
              </button>
              
              <p className="text-[9px] text-[#E5E2D9]/40 mt-6 text-justify leading-relaxed">
                Al hacer clic en "Confirmar y Pagar", será redirigido a la pasarela segura de Redsys para completar la transacción. Sus datos ya han sido registrados de forma segura en nuestro sistema.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accessibility Modal */}
      <AnimatePresence>
        {isAccessModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0D0B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-md border border-[#E5E2D9]/10 relative shadow-2xl p-8"
            >
              <button 
                onClick={() => setIsAccessModalOpen(false)} 
                className="absolute top-4 right-4 text-[#E5E2D9]/30 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-6 text-[#C4A484]">
                <Info className="w-6 h-6" />
                <h3 className="font-serif text-2xl tracking-wide uppercase">Accesibilidad</h3>
              </div>
              
              <div className="space-y-4 text-sm text-[#E5E2D9]/60 leading-relaxed font-light">
                <p>
                  Las cuevas son un espacio natural con terreno irregular, humedad y tramos con escalones. Por su propia morfología geológica, el recorrido no es accesible en su totalidad para personas con movilidad reducida severa, sillas de ruedas o carritos de bebé.
                </p>
                <ul className="space-y-2 list-disc pl-4 italic">
                  <li>Se recomienda el uso de mochilas portabebés.</li>
                  <li>Es obligatorio el uso de calzado cómodo y cerrado (deportivo o montaña).</li>
                  <li>No recomendado para personas con problemas respiratorios o cardíacos graves debido a la humedad y el esfuerzo físico moderado.</li>
                </ul>
              </div>
              
              <button 
                onClick={() => setIsAccessModalOpen(false)}
                className="w-full mt-8 bg-[#C4A484]/10 border border-[#C4A484]/20 text-[#C4A484] py-3 text-[10px] uppercase font-bold tracking-widest hover:bg-[#C4A484] hover:text-[#0D0D0B] transition-all"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Normas Modal */}
      <AnimatePresence>
        {isNormasModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0D0B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-lg border border-[#E5E2D9]/10 relative shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button onClick={() => setIsNormasModalOpen(false)} className="absolute top-4 right-4 text-[#E5E2D9]/30 hover:text-white"><X className="w-5 h-5" /></button>
              <div className="flex items-center gap-3 mb-6 text-[#C4A484] uppercase tracking-wider">
                <FileText className="w-6 h-6" />
                <h3 className="font-serif text-2xl tracking-wide uppercase">Normas de la Visita</h3>
              </div>
              <div className="space-y-4 text-xs text-[#E5E2D9]/70 leading-relaxed uppercase tracking-wider font-light">
                <p className="font-bold border-b border-[#E5E2D9]/10 pb-2">Ordenanza Municipal del Excmo. Ayuntamiento de Alájar</p>
                <ul className="space-y-3 list-none">
                  <li className="flex gap-3"><CheckCircle className="w-4 h-4 text-[#C4A484] shrink-0" /> Uso obligatorio de casco protector facilitado por la organización.</li>
                  <li className="flex gap-3"><CheckCircle className="w-4 h-4 text-[#C4A484] shrink-0" /> Obligatorio calzado cerrado, cómodo y con suela antideslizante.</li>
                  <li className="flex gap-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> Prohibido tocar o extraer formaciones geológicas, flora o fauna.</li>
                  <li className="flex gap-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> Prohibido el acceso con animales (excepto perros guía).</li>
                  <li className="flex gap-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> Prohibido fumar, comer o introducir líquidos en la cavidad.</li>
                  <li className="flex gap-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> Prohibido el uso de trípodes o iluminación artificial sin permiso.</li>
                  <li className="flex gap-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> Queda prohibida la toma de fotografías en el interior de las cuevas sin autorización previa.</li>
                </ul>
                
                <div className="mt-8 pt-6 border-t border-[#E5E2D9]/10 space-y-3">
                  <button 
                    onClick={() => setIsFullOrdinanceOpen(true)}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-[#C4A484] text-[#0D0D0B] transition-all font-bold text-[10px] uppercase tracking-widest"
                  >
                    <FileText className="w-4 h-4" /> Leer Ordenanza Completa
                  </button>
                  <a 
                    href="/ordenanza.pdf" 
                    target="_blank" 
                    className="flex items-center justify-center gap-2 w-full py-4 bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 text-[#E5E2D9] hover:bg-[#C4A484] hover:text-[#0D0D0B] transition-all font-bold text-[10px] uppercase tracking-widest"
                  >
                    <Download className="w-4 h-4" /> Descargar Ordenanza (PDF)
                  </a>
                  <p className="text-[9px] text-[#E5E2D9]/30 mt-3 text-center normal-case italic">
                    Publicado en el Boletín Oficial de la Provincia
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aviso Legal Modal */}
      <AnimatePresence>
        {isLegalModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0D0B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-lg border border-[#E5E2D9]/10 relative shadow-2xl p-8"
            >
              <button onClick={() => setIsLegalModalOpen(false)} className="absolute top-4 right-4 text-[#E5E2D9]/30 hover:text-white"><X className="w-5 h-5" /></button>
              <h3 className="font-serif text-2xl tracking-wide uppercase mb-6 text-[#C4A484]">Aviso Legal</h3>
              <div className="space-y-4 text-xs text-[#E5E2D9]/70 leading-relaxed font-light uppercase tracking-widest leading-[1.8]">
                <p><span className="font-bold">Titular:</span> Excmo. Ayuntamiento de Alájar</p>
                <p><span className="font-bold">CIF:</span> P2100100C</p>
                <p><span className="font-bold">Dirección:</span> Plaza de España, 3, 21340, Alájar (Huelva)</p>
                <p><span className="font-bold">Email:</span> info@cuevasdealajar.com</p>
                <p className="mt-6 pt-4 border-t border-[#E5E2D9]/10 opacity-60 normal-case text-[10px]">En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacidad Modal */}
      <AnimatePresence>
        {isPrivacyModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0D0B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-lg border border-[#E5E2D9]/10 relative shadow-2xl p-8"
            >
              <button onClick={() => setIsPrivacyModalOpen(false)} className="absolute top-4 right-4 text-[#E5E2D9]/30 hover:text-white"><X className="w-5 h-5" /></button>
              <h3 className="font-serif text-2xl tracking-wide uppercase mb-6 text-[#C4A484]">Protección de Datos</h3>
              <div className="space-y-4 text-xs text-[#E5E2D9]/70 leading-relaxed font-light uppercase tracking-widest leading-[1.8]">
                <p><span className="font-bold">Responsable:</span> Excmo. Ayuntamiento de Alájar (P2100100C)</p>
                <p><span className="font-bold">Finalidad:</span> Gestión de reservas, venta de entradas y control de acceso a las Cuevas de Alájar.</p>
                <p><span className="font-bold">Legitimación:</span> Su consentimiento explícito al realizar la reserva.</p>
                <p><span className="font-bold">Derechos:</span> Acceso, rectificación, y borrado de sus datos escribiendo a secretaria@alajar.es.</p>
                <p className="mt-6 pt-4 border-t border-[#E5E2D9]/10 opacity-60 normal-case text-[10px]">Toda la información es gestionada bajo estrictas medidas de seguridad conforme al RGPD.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Ordinance Text Modal */}
      <AnimatePresence>
        {isFullOrdinanceOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-[#0D0D0B]/95 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-4xl border border-[#E5E2D9]/10 relative shadow-2xl flex flex-col max-h-[90vh]"
            >
              <button onClick={() => setIsFullOrdinanceOpen(false)} className="absolute top-6 right-6 text-[#E5E2D9]/30 hover:text-white z-10"><X className="w-6 h-6" /></button>
              
              <div className="p-8 md:p-12 overflow-y-auto custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-12 pb-20">
                  <div className="text-center space-y-4 border-b border-[#E5E2D9]/10 pb-12">
                    <img 
                      src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" 
                      alt="Excmo. Ayuntamiento de Alájar" 
                      className="w-16 h-16 object-contain mx-auto mb-4"
                      referrerPolicy="no-referrer"
                    />
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#C4A484]">Excmo. Ayuntamiento de Alájar</h2>
                    <h1 className="text-3xl md:text-4xl font-serif leading-tight">ORDENANZA REGULADORA DEL USO, ACCESO, SEGURIDAD Y CONSERVACIÓN</h1>
                    <p className="text-[10px] opacity-40 uppercase tracking-widest pt-4">Peña de Arias Montano, Cuevas de Alájar y Centro de Visitantes</p>
                  </div>

                  <div className="space-y-8 text-sm leading-relaxed text-[#E5E2D9]/80 font-light font-serif">
                    <section>
                      <h3 className="text-[#C4A484] uppercase tracking-widest text-xs font-bold mb-4 italic">Exposición de Motivos</h3>
                      <p>El municipio de Alájar, debido al gran patrimonio cultural con el que cuenta, recibe gran afluencia de visitantes durante todo el año. El conjunto histórico de Alájar, declarado como Bien de Interés Cultural, requiere una gestión adecuada para garantizar su preservación y permitir su disfrute público en condiciones de seguridad y conservación.</p>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-[#C4A484] uppercase tracking-widest text-xs font-bold mb-2">Título I. Disposiciones Generales</h3>
                      <div className="space-y-4">
                        <p><span className="font-bold block mb-1">Artículo 1. Objeto.</span> Regular el acceso, uso y funcionamiento de las visitas turísticas a la Peña de Arias Montano, Cuevas de Alájar y Centro de visitantes.</p>
                        <p><span className="font-bold block mb-1">Artículo 2. Ámbito de aplicación.</span> Será de aplicación a la Peña de Arias Montano, Cuevas de Alájar y Centro de visitantes, así como sus zonas de acceso y rutas de aproximación.</p>
                      </div>
                    </section>

                    <section className="space-y-4 text-[#E5E2D9]/90">
                      <h3 className="text-[#C4A484] uppercase tracking-widest text-xs font-bold mb-2">Título II. Acceso y Uso</h3>
                      <div className="space-y-6">
                        <div className="border-l-2 border-[#C4A484]/20 pl-4">
                          <p className="font-bold mb-2 uppercase text-[10px] tracking-widest text-[#C4A484]/70">Artículo 4. Modalidades.</p>
                          <p>1. El acceso a la ruta turística consistente en la visita turística a la Peña de Arias Montano, Cuevas de Alájar y Centro de visitantes, se realizará a través de visita guiada oficial. No obstante, el acceso a la Peña únicamente es libre y gratuito.</p>
                        </div>
                        <div className="border-l-2 border-[#C4A484]/20 pl-4">
                          <p className="font-bold mb-2 uppercase text-[10px] tracking-widest text-[#C4A484]/70">Artículo 6. Aforos y reservas.</p>
                          <p>1. El Ayuntamiento fijará un aforo máximo en función de informes técnicos y medioambientales para preservar la geología y biodiversidad.</p>
                          <p>2. Las visitas podrán requerir reserva previa, siendo obligatoria para grupos de más de 30 personas.</p>
                        </div>
                        <div className="border-l-2 border-[#C4A484]/20 pl-4 text-red-100/70 bg-red-500/5 p-4">
                          <p className="font-bold mb-2 flex items-center gap-2 uppercase text-[10px] tracking-widest"><AlertCircle className="w-4 h-4" /> Artículo 7. Condiciones de acceso.</p>
                          <p>5. El acceso a las Cuevas es totalmente incompatible a personas con limitaciones físicas. Se informará claramente de esta cuestión en el proceso de reserva.</p>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-[#C4A484] uppercase tracking-widest text-xs font-bold mb-2">Título III. Normas de Seguridad</h3>
                      <div className="bg-[#E5E2D9]/5 p-6 space-y-4 border border-[#E5E2D9]/10">
                        <p className="font-bold text-[#E5E2D9] uppercase text-[10px] tracking-widest mb-4">Artículo 9. Equipamiento obligatorio:</p>
                        <ul className="list-disc pl-5 space-y-3 text-xs leading-relaxed">
                          <li>Uso de casco protector y redecilla higiénica para el pelo (facilitados por el guía).</li>
                          <li>Uso de calzado adecuado, especialmente el carácter antideslizante.</li>
                          <li>Ropa adecuada considerando el porcentaje de humedad en el interior.</li>
                        </ul>
                      </div>
                    </section>

                    <section className="space-y-4 font-serif italic text-lg leading-relaxed text-[#C4A484]/90 border-y border-[#E5E2D9]/10 py-12 text-center">
                      <p>"Queda completamente prohibido tocar cualquier formación geológica en el interior de las Cuevas, así como sustraer rocas o molestar a la fauna existente."</p>
                    </section>

                    <div className="pt-12 text-center opacity-40 text-[10px] uppercase tracking-[0.2em] space-y-2">
                      <p>Sede Administrativa:</p>
                      <p>Plaza de España, 3, 21340, Alájar (HUELVA)</p>
                      <p>Excmo. Ayuntamiento de Alájar</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
