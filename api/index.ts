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
      Ds_Merchant_Terminal: '001',
      Ds_Merchant_MerchantURL: `https://${req.get('host')}/api/redsys-webhook`,
      Ds_Merchant_UrlOK: `https://${req.get('host')}?payment=success&order=${orderId}`,
      Ds_Merchant_UrlKO: `https://${req.get('host')}?payment=error&order=${orderId}`,
      Ds_Merchant_ConsumerLanguage: '001'
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
      }, { merge: true });
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

    console.log(`✅ Firma de ida generada para Pedido ${orderId}`);

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
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 📥 WEBHOOK REDSYS RECIBIDO`);
  
  // Redsys puede enviar los datos en el body o como query params dependiendo de la configuración
  const body = req.body || {};
  const Ds_MerchantParameters = body.Ds_MerchantParameters || req.query.Ds_MerchantParameters as string;
  const Ds_Signature = body.Ds_Signature || req.query.Ds_Signature as string;

  if (!Ds_MerchantParameters) {
    console.warn("⚠️ Webhook llamado sin Ds_MerchantParameters");
    return res.status(200).send("No params received, but acknowledged");
  }

  try {
    // Decodificar Base64 (Redsys usa codificación estándar base64)
    const decodedParamsStr = Buffer.from(Ds_MerchantParameters, 'base64').toString('utf8');
    const params = JSON.parse(decodedParamsStr);
    
    // Intentar obtener el ID del pedido de varias fuentes posibles en la respuesta de Redsys
    const orderId = params.Ds_Order || params.Ds_Merchant_Order || params.Ds_Order_Id;
    const responseCode = params.Ds_Response;
    const responseNum = parseInt(responseCode, 10);
    const isSuccess = responseNum >= 0 && responseNum <= 99;

    console.log(`🔔 Webhook Redsys [${orderId}]: Código=${responseCode} | Éxito=${isSuccess}`);

    if (!orderId) {
      console.error("❌ No se encontró OrderId en los parámetros decodificados");
      return res.status(200).send("OK-NO-ORDER");
    }

    if (isSuccess) {
      console.log(`✅ PAGO CONFIRMADO para ${orderId}. Actualizando a 'confirmed'...`);
      
      try {
        const resRef = db.collection('reservations').doc(orderId);
        await resRef.update({ 
          status: 'confirmed', 
          paidAt: new Date().toISOString(),
          redsysResponse: params.Ds_Response,
          redsysAuthCode: params.Ds_AuthorisationCode
        });
        
        // Recuperar datos para el email
        const resSnap = await resRef.get();
        const resData = resSnap.data();
        
        if (resData && resData.customerEmail) {
          const { date, time, customerName, customerEmail, tickets, totalTickets } = resData;

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #151515; padding: 20px;">
              <div style="background-color: #151515; padding: 30px; text-align: center;">
                <h1 style="color: #C4A484; font-family: serif; margin: 0;">Cuevas de la Peña</h1>
                <p style="color: rgba(229, 226, 217, 0.6); margin-top: 5px;">Arias Montano</p>
              </div>
              
              <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                <h2 style="font-family: serif; margin-top: 0; color: #151515;">¡Reserva Confirmada!</h2>
                <p>Hola <strong>${customerName}</strong>,</p>
                <p>Tu pago ha sido procesado con éxito. Aquí tienes tus entradas:</p>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #C4A484; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #C4A484; text-transform: uppercase; font-size: 14px;">Detalles de la Visita</h3>
                  <p style="margin: 5px 0;"><strong>Localizador:</strong> #${orderId}</p>
                  <p style="margin: 5px 0;"><strong>Fecha:</strong> ${date}</p>
                  <p style="margin: 5px 0;"><strong>Hora:</strong> ${time}</p>
                  <p style="margin: 5px 0;"><strong>Total tickets:</strong> ${totalTickets}</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
                  <p style="font-size: 13px; color: #666; margin: 0;">
                    Adultos: ${tickets.adult || 0} | Reducidas: ${tickets.reduced || 0} | Menores (Gratis): ${tickets.childFree || 0}
                  </p>
                </div>
  
                <p>Presenta este email (digital o impreso) en la entrada. Recomendamos llegar 10-15 minutos antes.</p>
                <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #888; text-align: center;">
                  Si necesitas ayuda, contáctanos en info@cuevasdealajar.com
                </p>
              </div>
            </div>
          `;
  
          await resend.emails.send({
            from: 'Cuevas de la Peña <info@cuevasdealajar.com>',
            to: customerEmail,
            subject: `🎟️ Reserva Confirmada #${orderId} - Cuevas de la Peña`,
            html: emailHtml
          });
          
          console.log(`✉️ Ticket enviado correctamente a ${customerEmail}`);
        }
      } catch (err: any) {
        console.error('⚠️ Error actualizando reserva o enviando email:', err.message);
      }
    } else {
      console.log(`❌ PAGO DENEGADO para ${orderId}. Marcando como 'failed' y liberando aforo.`);
      try {
        const resRef = db.collection('reservations').doc(orderId);
        const resSnap = await resRef.get();
        if (resSnap.exists) {
          const resData = resSnap.data();
          if (resData && resData.status === 'pending') {
            const { date, time, totalTickets } = resData;
            // Liberar aforo
            const slotId = `${date}_${time}`;
            await db.collection('slots').doc(slotId).set({ 
              bookedCount: admin.firestore.FieldValue.increment(-Number(totalTickets)),
              date,
              time
            }, { merge: true });
            
            await resRef.update({ 
              status: 'failed', 
              errorCode: params.Ds_Response,
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.error("Error marcando fallo en DB:", e);
      }
    }

    // Redsys espera siempre un OK
    res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Error crítico procesando webhook:", err);
    res.status(200).send("OK-ERR"); // Respondemos OK a Redsys para que deje de reintentar si el fallo es nuestro
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
