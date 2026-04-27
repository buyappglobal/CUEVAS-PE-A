import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
  span?: string;
}

const DRIVE_API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID;

export const Gallery: React.FC = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      if (!DRIVE_API_KEY || !FOLDER_ID) {
        console.warn("Google Drive API Key o Folder ID no configurados");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name)&key=${DRIVE_API_KEY}`
        );
        const data = await response.json();
        
        if (data.files) {
          const fetchedImages: GalleryImage[] = data.files.map((file: any, index: number) => ({
            id: file.id,
            url: `https://lh3.googleusercontent.com/d/${file.id}`,
            caption: file.name.split('.')[0].replace(/[-_]/g, ' '),
            // Asignamos spans aleatorios o basados en indice para el diseño bento
            span: index === 0 ? 'col-span-2 row-span-2' : index === 3 ? 'col-span-1 row-span-2' : ''
          }));
          setImages(fetchedImages);
        }
      } catch (error) {
        console.error("Error fetching images from Drive:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, []);

  const openLightbox = (index: number) => {
    setSelectedImageIndex(index);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setSelectedImageIndex(null);
    document.body.style.overflow = 'auto';
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex + 1) % images.length);
    }
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex - 1 + images.length) % images.length);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 bg-[#0D0D0B] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C4A484] animate-spin" />
      </div>
    );
  }

  if (images.length === 0 && !isLoading) {
    return null; // O mostrar algo si no hay imágenes
  }

  return (
    <section id="galeria" className="py-24 bg-[#0D0D0B]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16 text-center">
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[#C4A484] uppercase tracking-[0.3em] text-[10px] font-bold mb-4"
          >
            Galería Visual
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-serif text-[#E5E2D9] font-light"
          >
            Belleza <span className="italic text-[#C4A484]">Subterránea</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[200px] md:auto-rows-[250px]">
          {images.map((img, index) => (
            <motion.div
              key={img.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className={`relative group overflow-hidden cursor-pointer bg-[#151513] border border-[#E5E2D9]/5 ${img.span || ''}`}
              onClick={() => openLightbox(index)}
            >
              <img 
                src={img.url} 
                alt={img.caption || 'Imagen de la cueva'} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                <p className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1">Peña de Arias Montano</p>
                <p className="text-white text-sm font-serif line-clamp-2">{img.caption}</p>
                <Maximize2 className="absolute top-4 right-4 w-4 h-4 text-white/50" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedImageIndex !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={closeLightbox}
          >
            <button 
              className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20"
              onClick={closeLightbox}
            >
              <X className="w-8 h-8" />
            </button>

            <button 
              className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-4"
              onClick={prevImage}
            >
              <ChevronLeft className="w-10 h-10" />
            </button>

            <button 
              className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-4"
              onClick={nextImage}
            >
              <ChevronRight className="w-10 h-10" />
            </button>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <img 
                src={images[selectedImageIndex].url} 
                alt="Lightbox View" 
                className="max-w-full max-h-[85vh] object-contain shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="mt-8 text-center max-w-2xl">
                <p className="text-[#C4A484] text-[10px] uppercase tracking-[0.4em] mb-2">Imagen {selectedImageIndex + 1} de {images.length}</p>
                <h3 className="text-2xl font-serif text-white">{images[selectedImageIndex].caption}</h3>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
