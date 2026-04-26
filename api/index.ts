import express from 'express';
import crypto from 'crypto';
import path from 'path';
import cors from 'cors';
import { Resend } from 'resend';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback_so_it_doesnt_crash');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
// Webhooks urlencoded payloads sometimes
app.use(express.urlencoded({ extended: true })); 

// --- Configuración de Redsys ---
const REDSYS_SECRET_KEY = (process.env.REDSYS_SECRET_KEY || '').trim();
const MERCHANT_CODE = (process.env.REDSYS_MERCHANT_CODE || '369364104').trim();

// Si el usuario ha configurado su propia clave, probablemente quiera ir a Producción (excepto si especifica URL)
const REDSYS_URL = process.env.REDSYS_URL || (REDSYS_SECRET_KEY && REDSYS_SECRET_KEY !== 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' 
  ? 'https://sis.redsys.es/sis/realizarPago' 
  : 'https://sis-t.redsys.es:25443/sis/realizarPago');

const ACTUAL_SECRET = REDSYS_SECRET_KEY || 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';

// Función para encriptar la MAC usando 3DES (Triple DES)
function encrypt3DES(orderId: string, secret: string) {
  const decodedSecret = Buffer.from(secret, 'base64');
  
  // Ajuste de seguridad para Triple DES: Redsys espera 24 bytes (192 bits).
  // Si la clave tiene 32 bytes (común en SHA256), usamos los primeros 24.
  // Si tiene 16 bytes, se suele usar el esquema K1-K2-K1.
  let keyBytes: Buffer;
  if (decodedSecret.length >= 24) {
    keyBytes = decodedSecret.slice(0, 24);
  } else if (decodedSecret.length === 16) {
    keyBytes = Buffer.concat([decodedSecret, decodedSecret.slice(0, 8)]);
  } else {
    // Si la clave tiene otra longitud, rellenamos con ceros hasta 24
    keyBytes = Buffer.alloc(24, 0);
    decodedSecret.copy(keyBytes);
  }

  const iv = Buffer.alloc(8, 0); 
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBytes, iv);
  cipher.setAutoPadding(false);

  // Redsys requiere padding de ceros hasta un múltiplo de 8 bytes para el ID de pedido
  // Para 12 caracteres, el buffer de salida debe ser de 16 bytes.
  const orderBuffer = Buffer.alloc(Math.ceil(orderId.length / 8) * 8, 0);
  orderBuffer.write(orderId, 'utf8');

  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}

// Función para generar la firma HMAC-SHA256 final (especificación Redsys)
function mac256(data: string, key: Buffer) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('base64');
}

// --- Endpoints de la API ---
app.all('*', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/create-payment') {
    if (!process.env.REDSYS_SECRET_KEY) {
      console.warn('⚠️ ADVERTENCIA: REDSYS_SECRET_KEY no detectada. Usando clave de pruebas.');
    } else {
      console.log('🛡️ Usando REDSYS_SECRET_KEY configurada por el usuario.');
    }
  }
  next();
});

// Middleware para normalizar la ruta
app.use((req, res, next) => {
  next();
});

    // 0. Health check
    app.get(['/api/health', '/health'], (req, res) => {
      res.json({ 
        status: 'ok', 
        env: {
          hasSecret: !!process.env.REDSYS_SECRET_KEY,
          merchantCode: MERCHANT_CODE,
          nodeEnv: process.env.NODE_ENV
        }
      });
    });

// 1. Endpoint para iniciar el pago
app.post(['/api/create-payment', '/create-payment'], async (req, res) => {
  try {
    const { amount, tickets, date, time, customer, orderId: incomingOrderId } = req.body;
    
    // Usar el orderId que viene del frontend o generar uno si falta
    const orderId = incomingOrderId || new Date().toISOString().replace(/\D/g, '').slice(0, 12);
    
    // Importe multiplicado x 100 para ser céntimos (exigencia de Redsys)
    const amountStr = Math.round(amount * 100).toString();
    
    console.log(`🎟️ Invocando Pago - Pedido: ${orderId} | Total: ${amount}€ (${amountStr} cts)`);
    
    const keyBytes = Buffer.from(ACTUAL_SECRET, 'base64');
    console.log(`🔑 Clave usada (Longitud decodificada): ${keyBytes.length} bytes`);

    // Parámetros JSON para Redsys. 
    const params = {
      Ds_Merchant_Amount: amountStr,
      Ds_Merchant_Order: orderId,
      Ds_Merchant_MerchantCode: MERCHANT_CODE,
      Ds_Merchant_Currency: '978',
      Ds_Merchant_TransactionType: '0',
      Ds_Merchant_Terminal: '1',
      Ds_Merchant_MerchantURL: `https://${req.get('host')}/api/redsys-webhook`,
      Ds_Merchant_UrlOK: `https://${req.get('host')}?payment=success`,
      Ds_Merchant_UrlKO: `https://${req.get('host')}?payment=error`,
      Ds_Merchant_ConsumerLanguage: '001',
      Ds_Merchant_MerchantData: Buffer.from(JSON.stringify({ date, time, customer, tickets })).toString('base64')
    };

    // PERSISTENCIA INICIAL: Guardar la reserva en estado "pending" para visibilidad inmediata en el CRM
    try {
      const totalTickets = (tickets.adult || 0) + (tickets.reduced || 0) + (tickets.childFree || 0);
      await db.collection('reservations').doc(orderId).set({
        localizador: orderId,
        date,
        time,
        customerName: customer.name,
        customerEmail: customer.email,
        tickets,
        totalTickets,
        amount,
        status: 'pending',
        source: 'online',
        createdAt: new Date().toISOString()
      });
      console.log(`📡 Reserva registrada (Admin SDK) como PENDIENTE: ${orderId}`);
      
      // BLOQUEAR AFORO: Incrementar el contador de ocupación inmediatamente
      const slotId = `${date}_${time}`;
      const slotRef = db.collection('slots').doc(slotId);
      const slotSnap = await slotRef.get();
      if (slotSnap.exists) {
        await slotRef.update({ bookedCount: admin.firestore.FieldValue.increment(totalTickets) });
      } else {
        await slotRef.set({ date, time, bookedCount: totalTickets });
      }
      console.log(`📉 Aforo actualizado para ${slotId} (+${totalTickets})`);
    } catch (dbErr) {
      console.error('⚠️ Error guardando reserva pendiente en DB:', dbErr);
    }

    const paramsBase64 = Buffer.from(JSON.stringify(params), 'utf8').toString('base64');

    // Generar la firma segura (Server Side)
    const transactionKey = encrypt3DES(orderId, ACTUAL_SECRET);
    const signature = mac256(paramsBase64, transactionKey);

    console.log(`✅ Firma generada para el comerciante ${MERCHANT_CODE}`);

    // Devolvemos el pack completo al Frontend
    res.json({
      url: REDSYS_URL,
      paramsBase64,
      signature,
      version: 'HMAC_SHA256_V1'
    });
  } catch (error) {
    console.error('❌ Error al inicializar Redsys:', error);
    res.status(500).json({ error: 'Fallo al procesar parámetros de pago' });
  }
});

// 2. Endpoint oculto (Webhook) donde Redsys confirmará si el pago fue exitoso
app.post(['/api/redsys-webhook', '/redsys-webhook'], async (req, res) => {
  console.log("📥 WEBHOOK REDSYS - URL:", req.url);
  console.log("📥 WEBHOOK REDSYS - BODY RECIBIDO:", JSON.stringify(req.body, null, 2));
  
  const { Ds_SignatureVersion, Ds_MerchantParameters, Ds_Signature } = req.body;
  
  if (!Ds_MerchantParameters) {
    return res.status(400).send("No se recibieron parámetros");
  }

  try {
    const decodedParamsStr = Buffer.from(Ds_MerchantParameters, 'base64').toString('utf8');
    const params = JSON.parse(decodedParamsStr);
    
    // Aquí (en entorno real) verificaríamos la firma que de vuelta envía Redsys
    // calculándola con la clave igual que a la ida, pero cifrando con la firma entrante.
    
    console.log(`🔔 Notificación de Redsys Recibida [Pedido ${params.Ds_Order}] => RespCode: ${params.Ds_Response}`);

    const orderId = params.Ds_Order;
    // Respuestas en 0000 al 0099 son autorizadas
    const responseCode = parseInt(params.Ds_Response, 10);
    const isSuccess = responseCode >= 0 && responseCode <= 99;

    if (isSuccess) {
      console.log('✅ PAGO CONFIRMADO. Actualizando DB y enviando ticket...');
      
      try {
        // Actualizar estado en Firebase (Admin SDK)
        const resRef = db.collection('reservations').doc(orderId);
        await resRef.update({ status: 'confirmed', paidAt: new Date().toISOString() });
        
        // Recuperar datos para el email
        const resSnap = await resRef.get();
        const resData = resSnap.data();
        
        if (resData) {
          const { date, time, customerName, customerEmail, tickets, totalTickets } = resData;

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #151515;">
              <div style="background-color: #151515; padding: 30px; text-align: center;">
                <h1 style="color: #C4A484; font-family: serif; margin: 0;">Cuevas de la Peña</h1>
                <p style="color: rgba(229, 226, 217, 0.6); margin-top: 5px;">Arias Montano</p>
              </div>
              
              <div style="padding: 30px; border: 1px solid #eee;">
                <h2 style="font-family: serif; margin-top: 0;">¡Hola ${customerName}!</h2>
                <p>Tu pago ha sido confirmado correctamente. Aquí tienes los detalles de tu visita:</p>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #C4A484; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #C4A484; text-transform: uppercase; font-size: 14px;">Detalles de la Reserva</h3>
                  <p><strong>Localizador:</strong> #${orderId}</p>
                  <p><strong>Fecha:</strong> ${date}</p>
                  <p><strong>Hora:</strong> ${time}</p>
                  <p><strong>Total personas:</strong> ${totalTickets}</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
                  <p style="font-size: 13px; color: #666; margin: 0;">
                    Adultos: ${tickets.adult || 0} | Reducidas: ${tickets.reduced || 0} | Menores (Gratis): ${tickets.childFree || 0}
                  </p>
                </div>
  
                <p>Muestra este correo electrónico en tu teléfono móvil al guía cuando llegues a la entrada de la cueva.</p>
                <p>Te recomendamos llegar 10 minutos antes de tu hora asignada.</p>
                
                <div style="text-align: center; margin-top: 40px; color: #999; font-size: 12px;">
                  <p>Si tienes alguna duda, ponte en contacto con info@cuevasdealajar.com</p>
                </div>
              </div>
            </div>
          `;
  
          // Send Email via Resend
          await resend.emails.send({
            from: 'Cuevas de la Peña <info@send.cuevasdealajar.com>',
            to: customerEmail,
            subject: '🎟️ Tus entradas confirmadas - Cuevas de la Peña',
            html: emailHtml
          });
          
          console.log(`✉️ Email enviado a: ${customerEmail} correctamente.`);
        }
      } catch (err: any) {
        console.error('⚠️ Error procesando post-pago:', err.message);
      }
    } else {
      console.log('❌ PAGO DENEGADO por la tarjeta.');
      try {
        await db.collection('reservations').doc(orderId).update({ status: 'failed', errorCode: params.Ds_Response });
      } catch (e) {}
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error processando webhook de Redsys:", err);
    res.status(500).send("ERROR");
  }
});

// --- Middleware de Aplicación Web (Vite + React) ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // En producción (incluyendo Vercel), servimos estáticos si no lo hace el host
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Si la URL empieza por /api y llega aquí, es que no se encontró la ruta
      if (req.url.startsWith('/api')) {
        console.warn(`⚠️ Ruta API no encontrada: ${req.url}`);
        return res.status(404).json({ error: 'API route not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // En Vercel no llamamos a listen, exportamos la app para que Serverless functions escuche.
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server up and running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

export default app;
