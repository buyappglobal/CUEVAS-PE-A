import express from 'express';
import crypto from 'crypto';
import path from 'path';
import cors from 'cors';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// --- Initialization ---
let db: admin.firestore.Firestore;
let resend: Resend;

const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, 'utf8'));
} catch (e) {
  console.error("❌ Could not read firebase-applet-config.json", e);
}

if (admin.apps.length === 0) {
  admin.initializeApp();
}

try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  db = admin.firestore(dbId);
  console.log(`✅ Firebase Admin initialized with DB: ${dbId}`);
} catch (e) {
  console.error("⚠️ Error initializing Firestore with specific ID, using default", e);
  db = admin.firestore();
}

resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback_so_it_doesnt_crash');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Redsys Config ---
const REDSYS_SECRET_KEY = (process.env.REDSYS_SECRET_KEY || '').trim();
const MERCHANT_CODE = (process.env.REDSYS_MERCHANT_CODE || '369364104').trim();
const REDSYS_URL = process.env.REDSYS_URL || (REDSYS_SECRET_KEY && REDSYS_SECRET_KEY !== 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' 
  ? 'https://sis.redsys.es/sis/realizarPago' 
  : 'https://sis-t.redsys.es:25443/sis/realizarPago');

const ACTUAL_SECRET = REDSYS_SECRET_KEY || 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';

function encrypt3DES(orderId: string, secret: string) {
  const decodedSecret = Buffer.from(secret, 'base64');
  let keyBytes: Buffer;
  if (decodedSecret.length >= 24) {
    keyBytes = decodedSecret.slice(0, 24);
  } else if (decodedSecret.length === 16) {
    keyBytes = Buffer.concat([decodedSecret, decodedSecret.slice(0, 8)]);
  } else {
    keyBytes = Buffer.alloc(24, 0);
    decodedSecret.copy(keyBytes);
  }
  const iv = Buffer.alloc(8, 0); 
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBytes, iv);
  cipher.setAutoPadding(false);
  const orderBuffer = Buffer.alloc(Math.ceil(orderId.length / 8) * 8, 0);
  orderBuffer.write(orderId, 'utf8');
  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}

function mac256(data: string, key: Buffer) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('base64');
}

// --- Endpoints ---
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ 
    status: 'ok',
    dbInited: !!db,
    resendInited: !!resend,
    config: { merchantCode: MERCHANT_CODE, hasKey: !!process.env.REDSYS_SECRET_KEY }
  });
});

app.post(['/api/create-payment', '/create-payment'], async (req, res) => {
  try {
    const { amount, tickets, date, time, customer, orderId: incomingOrderId } = req.body;
    const orderId = incomingOrderId || new Date().toISOString().replace(/\D/g, '').slice(0, 12);
    const amountStr = Math.round(amount * 100).toString();
    
    console.log(`🎟️ Invocando Pago - Pedido: ${orderId} | Total: ${amount}€`);
    
    const isProduction = REDSYS_URL.includes('sis.redsys.es');
    const domain = req.get('host') || 'cuevasdealajar.com';
    
    const params = {
      Ds_Merchant_Amount: amountStr,
      Ds_Merchant_Order: orderId,
      Ds_Merchant_MerchantCode: MERCHANT_CODE,
      Ds_Merchant_Currency: '978',
      Ds_Merchant_TransactionType: '0',
      Ds_Merchant_Terminal: '001',
      Ds_Merchant_MerchantURL: `https://${domain}/api/redsys-webhook`,
      Ds_Merchant_UrlOK: `https://${domain}?payment=success&order=${orderId}`,
      Ds_Merchant_UrlKO: `https://${domain}?payment=error&order=${orderId}`,
      Ds_Merchant_ConsumerLanguage: '001'
    };

    // Pre-save to CRM
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

      const slotId = `${date}_${time}`;
      const slotRef = db.collection('slots').doc(slotId);
      const slotSnap = await slotRef.get();
      if (slotSnap.exists) {
        await slotRef.update({ bookedCount: admin.firestore.FieldValue.increment(totalTickets) });
      } else {
        await slotRef.set({ date, time, bookedCount: totalTickets }, { merge: true });
      }
      console.log(`✅ DB: Reserva ${orderId} pre-registrada y aforo bloqueado`);
    } catch (dbErr: any) {
      console.error('⚠️ Error pre-registrando en DB:', dbErr.message);
    }

    const paramsBase64 = Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
    const transactionKey = encrypt3DES(orderId, ACTUAL_SECRET);
    const signature = mac256(paramsBase64, transactionKey);

    res.json({ url: REDSYS_URL, paramsBase64, signature, version: 'HMAC_SHA256_V1' });
  } catch (error) {
    console.error('❌ Error Redsys Init:', error);
    res.status(500).json({ error: 'Fallo al procesar parámetros de pago' });
  }
});

app.post(['/api/redsys-webhook', '/redsys-webhook'], async (req, res) => {
  const Ds_MerchantParameters = req.body.Ds_MerchantParameters;
  const Ds_Signature = req.body.Ds_Signature;

  if (!Ds_MerchantParameters || !Ds_Signature) return res.status(200).send("OK-NO-PARAMS");

  try {
    const decodedParamsStr = Buffer.from(Ds_MerchantParameters, 'base64').toString('utf8');
    const params = JSON.parse(decodedParamsStr);
    const orderId = params.Ds_Order || params.Ds_Merchant_Order;

    const transactionKey = encrypt3DES(orderId, ACTUAL_SECRET);
    const expectedSignature = mac256(Ds_MerchantParameters, transactionKey);

    if (Ds_Signature.replace(/_/g, '/').replace(/-/g, '+') !== expectedSignature) {
      console.error(`❌ FIRMA INVÁLIDA Webhook: ${orderId}`);
      return res.status(200).send("OK-BAD-SIG"); 
    }

    const responseCode = params.Ds_Response;
    const isSuccess = parseInt(responseCode, 10) <= 99;

    if (isSuccess) {
      const resRef = db.collection('reservations').doc(orderId);
      const resSnap = await resRef.get();
      
      if (resSnap.exists) {
        const resData = resSnap.data();
        if (resData && resData.status !== 'confirmed') {
          await resRef.update({ 
            status: 'confirmed', 
            paidAt: new Date().toISOString(),
            redsysResponse: responseCode,
            updatedAt: new Date().toISOString()
          });
          
          // Send Email
          if (resData.customerEmail && process.env.RESEND_API_KEY) {
            try {
              await resend.emails.send({
                from: 'Cuevas de la Peña <info@cuevasdealajar.com>',
                to: resData.customerEmail,
                subject: `🎟️ Reserva Confirmada #${orderId}`,
                html: `<h1>¡Reserva Confirmada!</h1><p>Hola ${resData.customerName}, tu visita para el ${resData.date} a las ${resData.time} ha sido confirmada.</p>`
              });
              console.log(`✉️ Email enviado a ${resData.customerEmail}`);
            } catch (e) {
              console.error("❌ Email error:", e);
            }
          }
        }
      }
    } else {
      const resRef = db.collection('reservations').doc(orderId);
      const resSnap = await resRef.get();
      if (resSnap.exists) {
        const resData = resSnap.data();
        if (resData && resData.status === 'pending') {
          const slotId = `${resData.date}_${resData.time}`;
          await db.collection('slots').doc(slotId).update({ 
            bookedCount: admin.firestore.FieldValue.increment(-resData.totalTickets) 
          });
          await resRef.update({ status: 'failed', errorCode: responseCode });
        }
      }
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Webhook error:", err);
    res.status(200).send("OK-ERR");
  }
});

app.post(['/api/send-manual-email', '/send-manual-email'], async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Falta orderId' });

  try {
    const resRef = db.collection('reservations').doc(orderId);
    const resSnap = await resRef.get();
    
    if (!resSnap.exists) return res.status(404).json({ error: 'Reserva no encontrada' });
    const resData = resSnap.data();

    if (resData && resData.customerEmail && process.env.RESEND_API_KEY) {
      const isConfirmed = resData.status === 'confirmed' || resData.status === 'paid';
      
      await resend.emails.send({
        from: 'Cuevas de la Peña <info@cuevasdealajar.com>',
        to: resData.customerEmail,
        subject: isConfirmed ? `🎟️ Comprobante de Reserva #${orderId}` : `⏳ Resumen de solicitud #${orderId}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
            <h1 style="color: #C4A484;">${isConfirmed ? '¡Reserva Confirmada!' : 'Resumen de tu solicitud'}</h1>
            <p>Hola <strong>${resData.customerName}</strong>,</p>
            <p>Este es el detalle de tu reserva para visitar las Cuevas de la Peña de Arias Montano:</p>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Fecha:</strong> ${resData.date}</li>
              <li><strong>Hora:</strong> ${resData.time}h</li>
              <li><strong>Localizador:</strong> #${orderId}</li>
              <li><strong>Estado:</strong> ${resData.status.toUpperCase()}</li>
            </ul>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              Si tienes cualquier duda, por favor contacta con nosotros respondiendo a este email.
            </p>
          </div>
        `
      });
      return res.json({ success: true });
    }
    res.status(400).json({ error: 'No se pudo enviar el correo' });
  } catch (err: any) {
    console.error("❌ Manual Email Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Vite / Static ---
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
}

start();

export default app;
