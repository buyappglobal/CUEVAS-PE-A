/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, Calendar, Ticket, ChevronRight, Mountain, 
  Leaf, History, Music, ArrowRight, Clock, Users, X, Info, Camera, Tent
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
  const [selectedTour, setSelectedTour] = useState('');

  const openBooking = (tourName: string = '') => {
    setSelectedTour(tourName);
    setIsBookingModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0D0D0B] font-sans text-[#E5E2D9] selection:bg-[#C4A484] selection:text-[#0D0D0B] overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0D0D0B]/90 backdrop-blur-md border-b border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mountain className="w-6 h-6 text-[#C4A484]" />
            <span className="font-serif text-xl tracking-[0.05em] uppercase">Peña Arias Montano</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[11px] uppercase tracking-[0.15em] font-medium text-[#E5E2D9]/70">
            <a href="#descubre" className="hover:text-[#E5E2D9] transition-colors">Las Cuevas</a>
            <a href="#visitas" className="hover:text-[#E5E2D9] transition-colors">Visitas y Tarifas</a>
            <button onClick={() => openBooking()} className="text-[#C4A484] hover:opacity-100 opacity-80 font-bold transition-opacity">
              Comprar Entradas
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 h-[90vh] min-h-[600px] flex items-center justify-center">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=80" 
            alt="Interior de las Cuevas" 
            className="w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-[#0D0D0B]/60"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0B] via-[#0D0D0B]/40 to-transparent"></div>
        </div>
        
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto mt-12">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-[#C4A484] uppercase tracking-[0.3em] text-[12px] font-medium mb-6"
          >
            Apertura al Público · Sierra de Aracena
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
              Comprar Entradas
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
                  <h3 className="font-serif text-xl mb-2 text-[#E5E2D9]">Cueva de los Sillares</h3>
                  <p className="text-sm text-[#E5E2D9]/60 leading-[1.6]">Asombrosa formación principal donde la fuerza del agua ha esculpido bóvedas naturales impresionantes.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="shrink-0 mt-1">
                  <History className="w-6 h-6 text-[#C4A484]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl mb-2 text-[#E5E2D9]">El Palacio Oscuro</h3>
                  <p className="text-sm text-[#E5E2D9]/60 leading-[1.6]">Un recóndito pasaje que revela vestigios y el misticismo del baluarte rocoso que enamoró a Arias Montano.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <div className="aspect-[4/5] rounded-none border border-[#E5E2D9]/10 bg-[#E5E2D9]/[0.02] overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1499540633125-484965b60031?auto=format&fit=crop&w=1000&q=80" 
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

      {/* Visitas Guiadas */}
      <section id="visitas" className="py-24 bg-[#0D0D0B] border-t border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-[64px] font-serif mb-6 font-light leading-[1.1]">Visita las Cuevas</h2>
            <p className="text-[#E5E2D9]/60 text-lg">Asegura tu plaza. El aforo al interior de las cuevas está estrictamente limitado para la conservación del espacio geológico.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Tarjeta 1 */}
            <FadeIn delay={0}>
              <div className="bg-[#E5E2D9]/[0.02] border border-[#E5E2D9]/[0.05] hover:border-[#C4A484]/50 transition-colors group h-full flex flex-col p-8 md:p-10 rounded-none">
                <div className="mb-6 flex justify-between items-start">
                  <div className="bg-[#0D0D0B] border border-[#E5E2D9]/10 w-12 h-12 rounded-none flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-[#C4A484]" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.1em] font-medium text-[#C4A484]">Aprox. 45 min</span>
                </div>
                <h3 className="font-serif text-3xl mb-4 text-[#E5E2D9]">Visita Guiada Oficial</h3>
                <p className="text-[#E5E2D9]/60 text-sm leading-[1.6] mb-8 flex-grow">
                  Recorrido interpretado por las galerías recientemente habilitadas. Un experto desvelará los secretos en la formación de las estalactitas, la cueva de los Sillares y su importancia histórica. Incluye casco e iluminación adaptada.
                </p>
                <div className="flex items-center justify-between mt-auto pt-6 border-t border-[#E5E2D9]/10">
                  <div className="flex flex-col">
                    <span className="text-3xl font-serif text-[#E5E2D9]">8€</span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mt-1">Tarifa General</span>
                  </div>
                  <button onClick={() => openBooking('Visita Guiada a las Cuevas')} className="py-3 px-6 bg-[#E5E2D9]/5 hover:bg-[#C4A484] hover:text-[#0D0D0B] text-[#C4A484] flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-bold transition-colors">
                    Adquirir Entrada
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
                  <span className="text-[10px] uppercase tracking-[0.1em] font-medium text-[#C4A484]">Grupos +15 pax</span>
                </div>
                <h3 className="font-serif text-3xl mb-4 text-[#E5E2D9]">Grupos y Colegios</h3>
                <p className="text-[#E5E2D9]/60 text-sm leading-[1.6] mb-8 flex-grow">
                  Experiencia adaptada para agrupaciones, excursiones y centros educacionales. Reserva de franjas horarias exclusivas y tarifa reducida garantizada. (Necesaria solicitud previa).
                </p>
                <div className="flex items-center justify-between mt-auto pt-6 border-t border-[#E5E2D9]/10">
                  <div className="flex flex-col">
                    <span className="text-3xl font-serif text-[#E5E2D9]">6€</span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mt-1">Tarifa Reducida</span>
                  </div>
                  <button onClick={() => openBooking('Visita de Grupos')} className="py-3 px-6 bg-transparent border border-[#E5E2D9]/20 hover:border-[#C4A484] hover:text-[#C4A484] text-[#E5E2D9] flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-bold transition-colors">
                    Reserva Especial
                  </button>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Footer / Info */}
      <footer className="bg-[#0D0D0B] text-[#E5E2D9]/40 py-20 border-t border-[#E5E2D9]/10">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 text-[10px] uppercase tracking-[0.1em]">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Mountain className="w-6 h-6 text-[#C4A484]" />
              <span className="font-serif text-lg normal-case tracking-[0.05em] text-[#E5E2D9]">Peña Arias Montano</span>
            </div>
            <p className="max-w-sm leading-[1.6] mb-8 normal-case text-[12px] opacity-70">
              Protegiendo y valorando el patrimonio histórico y natural de Alájar. Reserva oficial de entradas y visitas.
            </p>
            <div className="flex gap-4">
               {/* Redes sociales */}
               <div className="w-10 h-10 rounded-none border border-[#E5E2D9]/20 flex items-center justify-center hover:bg-[#E5E2D9]/10 hover:text-[#E5E2D9] transition-colors cursor-pointer text-sm normal-case">Ig</div>
               <div className="w-10 h-10 rounded-none border border-[#E5E2D9]/20 flex items-center justify-center hover:bg-[#E5E2D9]/10 hover:text-[#E5E2D9] transition-colors cursor-pointer text-sm normal-case">Fb</div>
            </div>
          </div>
          
          <div>
            <h4 className="text-[#C4A484] mb-6">Información</h4>
            <ul className="space-y-4 text-[#E5E2D9]/40">
              <li><a href="#" className="hover:text-[#E5E2D9] transition-colors">Cómo llegar</a></li>
              <li><a href="#" className="hover:text-[#E5E2D9] transition-colors">Normas del recinto</a></li>
              <li><a href="#" className="hover:text-[#E5E2D9] transition-colors">Accesibilidad</a></li>
              <li><a href="#" className="hover:text-[#E5E2D9] transition-colors">Contacto</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#C4A484] mb-6">Contacto</h4>
            <ul className="space-y-4 text-[#E5E2D9]/40">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="normal-case text-[12px]">Ermita Reina de los Ángeles, 21340 Alájar, Huelva</span>
              </li>
              <li className="flex items-center gap-3">
                <Info className="w-4 h-4 shrink-0" />
                <span className="normal-case text-[12px]">info@peñamontano.es</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-[#E5E2D9]/10 text-[10px] uppercase tracking-[0.1em] opacity-40 flex flex-col sm:flex-row justify-between items-center">
          <p>© {new Date().getFullYear()} Cuevas Peña Arias Montano. Todos los derechos reservados.</p>
          <div className="flex gap-4 mt-4 sm:mt-0">
            <a href="#" className="hover:text-[#E5E2D9]">Aviso Legal</a>
            <a href="#" className="hover:text-[#E5E2D9]">Privacidad</a>
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
              className="bg-[#0D0D0B] text-[#E5E2D9] rounded-none w-full max-w-lg border border-[#E5E2D9]/10 relative shadow-2xl"
            >
              <div className="p-8">
                <button 
                  onClick={() => setIsBookingModalOpen(false)}
                  className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center bg-[#E5E2D9]/5 hover:bg-[#E5E2D9]/10 border border-[#E5E2D9]/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <span className="text-[#C4A484] text-[10px] uppercase tracking-[0.2em] mb-2 block">Reserva de Entradas</span>
                <h2 className="font-serif text-3xl mb-6 pr-8 font-light">Confirma tu visita</h2>
                
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); alert("¡Reserva completada con éxito! (Simulación)"); setIsBookingModalOpen(false); }}>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mb-2">Entrada Seleccionada</label>
                    <select className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none px-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]" defaultValue={selectedTour}>
                      <option value="" className="bg-[#0D0D0B]">Seleccionar entrada...</option>
                      <option value="Visita Guiada a las Cuevas" className="bg-[#0D0D0B]">Visita Guiada Oficial (8€)</option>
                      <option value="Visita de Grupos" className="bg-[#0D0D0B]">Reserva de Grupos y Colegios (6€)</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mb-2">Fecha</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4A484]" />
                        <input type="date" className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none pl-10 pr-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484] [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" required />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mb-2">Asistentes</label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4A484]" />
                        <input type="number" min="1" max="10" defaultValue="2" className="w-full bg-[#E5E2D9]/5 border border-[#E5E2D9]/10 rounded-none pl-10 pr-4 py-3 text-[#E5E2D9] focus:outline-none focus:border-[#C4A484]" required />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E2D9]/10 pt-6 mt-6">
                    <button type="submit" className="w-full bg-[#C4A484] text-[#0D0D0B] rounded-none py-4 text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#b09376] transition-colors active:scale-[0.98]">
                      Proceder al Pago Seguro
                    </button>
                    <p className="text-center text-[10px] uppercase tracking-[0.1em] text-[#E5E2D9]/50 mt-4 flex items-center justify-center gap-1">
                      <Info className="w-3 h-3" /> Sin cargos ocultos. Cancelación 48H.
                    </p>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
