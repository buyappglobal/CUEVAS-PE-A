import express from 'express';
import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

import crypto from 'crypto';
import path from 'path';
import cors from 'cors';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// --- Initialization ---
let db: any;
let resend: Resend;

const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, 'utf8'));
} catch (e) {
  console.error("❌ Could not read firebase-applet-config.json", e);
}

const getFirestoreConfig = () => {
  // Option A: Full JSON string (Most robust)
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      console.log("🔐 Firebase Admin: Usando Service Account desde JSON completo...");
      const serviceAccount = JSON.parse(serviceAccountVar);
      return {
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      };
    } catch (e) {
      console.error("❌ Error parseando FIREBASE_SERVICE_ACCOUNT:", e);
    }
  }

  // Option B: Individual variables (Legacy/Fallback)
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;

  if (privateKey && clientEmail) {
    console.log("🔐 Firebase Admin: Configurando con Service Account (Individual Vars)...");
    let formattedKey = privateKey
      .trim()
      .replace(/^['"]+|['"]+$/g, '') 
      .replace(/\\\\n/g, '\n')      
      .replace(/\\n/g, '\n');       

    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
       formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}`;
    }
    if (!formattedKey.includes('-----END PRIVATE KEY-----')) {
       formattedKey = `${formattedKey}\n-----END PRIVATE KEY-----`;
    }

    return {
      credential: admin.credential.cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: formattedKey,
      }),
      projectId: projectId.trim()
    };
  }
  
  console.log("ℹ️ Firebase Admin: Usando configuración de proyecto por defecto.");
  return { projectId };
};

const firebaseApp = admin.apps.length === 0 
  ? admin.initializeApp(getFirestoreConfig())
  : admin.app();

try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  db = getFirestore(firebaseApp, dbId);
  console.log(`✅ Firebase Admin initialized. Project: ${firebaseConfig.projectId} | DB: ${dbId}`);
} catch (e) {
  console.error("⚠️ Error initializing Firestore with specific ID, using default", e);
  db = getFirestore(firebaseApp);
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
app.get(['/api/debug-db', '/debug-db'], async (req, res) => {
  try {
    const snap = await db.collection('reservations').orderBy('createdAt', 'desc').limit(5).get();
    const reservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({
      count: reservations.length,
      reservations,
      databaseId: (db as any)._databaseId || 'default',
      projectId: (db as any)._projectId || 'default'
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
    const totalTickets = Number(tickets.adult || 0) + Number(tickets.reduced || 0) + Number(tickets.childFree || 0);
    
    if (!db) {
      throw new Error("Base de datos no inicializada correctamente.");
    }

    await db.collection('reservations').doc(orderId).set({
      localizador: orderId,
      date,
      time,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPostalCode: customer.postalCode || '',
      customerCity: customer.city || '',
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
      await slotRef.update({ bookedCount: FieldValue.increment(totalTickets) });
    } else {
      await slotRef.set({ date, time, bookedCount: totalTickets }, { merge: true });
    }
    console.log(`✅ DB: Reserva ${orderId} pre-registrada y aforo bloqueado`);

    const paramsBase64 = Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
    const transactionKey = encrypt3DES(orderId, ACTUAL_SECRET);
    const signature = mac256(paramsBase64, transactionKey);

    res.json({ url: REDSYS_URL, paramsBase64, signature, version: 'HMAC_SHA256_V1' });
  } catch (error: any) {
    console.error('❌ Error Redsys Init:', error);
    res.status(500).json({ 
      error: 'Fallo al procesar parámetros de pago',
      details: error.message 
    });
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
        if (resData && (resData.status === 'pending' || resData.status === 'failed')) {
          await resRef.update({ 
            status: 'paid', // Mark as paid but not yet confirmed/emailed
            paidAt: new Date().toISOString(),
            redsysResponse: responseCode,
            updatedAt: new Date().toISOString()
          });
          console.log(`💰 Pedido ${orderId} marcado como pagado via Webhook. Esperando confirmación manual.`);
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
            bookedCount: FieldValue.increment(-resData.totalTickets) 
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

app.post(['/api/ask-gemini', '/ask-gemini'], async (req, res) => {
  try {
    const { prompt, context } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY missing in environment variables');
      return res.status(500).json({ error: 'Configuración faltante: API Key no definida' });
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
    const result = await model.generateContent(`Eres un asistente inteligente para el CRM de reservas. Basado en estos datos de reservas, responde a la consulta del usuario.
      Datos actuales: ${JSON.stringify(context)}
      Consulta: ${prompt}`);
    
    const text = result.response.text();
    
    res.json({ text });
  } catch (error: any) {
    console.error('❌ Error gemini-ask (detailed):', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Error técnico al contactar al asistente' });
  }
});

app.post(['/api/send-manual-email', '/send-manual-email'], async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Falta orderId' });

  try {
    const resRef = db.collection('reservations').doc(orderId);
    const resSnap = await resRef.get();
    
    if (!resSnap.exists) return res.status(404).json({ error: 'Reserva no encontrada' });
    const resData: any = resSnap.data();

    if (!resData || !resData.tickets) {
      return res.status(400).json({ error: 'La reserva no tiene datos de tickets válidos' });
    }

    // Si el operario manda el email, es que ha validado el pago, por lo que marcamos como confirmado
    await resRef.update({ 
      status: 'confirmed', 
      verifiedManually: true,
      verifiedAt: new Date().toISOString()
    });

    const ticketsHtml = `
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Detalle de Entradas</h3>
        ${(resData.tickets.adult || 0) > 0 ? `<p><strong>Adultos:</strong> ${resData.tickets.adult}</p>` : ''}
        ${(resData.tickets.reduced || 0) > 0 ? `<p><strong>Reducidas:</strong> ${resData.tickets.reduced}</p>` : ''}
        ${(resData.tickets.childFree || 0) > 0 ? `<p><strong>Infantiles (Gratis):</strong> ${resData.tickets.childFree}</p>` : ''}
        <p style="font-size: 18px; font-weight: bold; margin-top: 15px;">Total Pagado: ${resData.amount || 0}€</p>
      </div>
    `;

    await resend.emails.send({
      from: 'Cuevas de la Peña <info@cuevasdealajar.com>',
      to: resData.customerEmail,
      subject: `🎟️ Tu entrada confirmada - Peña de Arias Montano (#${orderId})`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; color: #333; line-height: 1.6;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" alt="Logo" style="width: 80px; height: auto;">
            <h1 style="color: #C4A484; font-weight: 300; margin-top: 10px;">Reserva Confirmada</h1>
          </div>
          
          <p>Hola <strong>${resData.customerName}</strong>,</p>
          <p>Nos complace confirmarte que tu reserva para visitar las <strong>Cuevas de la Peña de Arias Montano</strong> ha sido validada correctamente.</p>
          
          <div style="border-left: 4px solid #C4A484; padding-left: 20px; margin: 30px 0;">
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${resData.date.split('-').reverse().join('/')}</p>
            <p style="margin: 5px 0;"><strong>Hora:</strong> ${resData.time}h</p>
            <p style="margin: 5px 0;"><strong>Localizador:</strong> <span style="background: #eee; padding: 2px 6px; border-radius: 3px;">#${orderId}</span></p>
          </div>

          ${ticketsHtml}

          <p><strong>Información importante:</strong></p>
          <ul style="color: #666; font-size: 14px;">
            <li><strong>Punto de encuentro:</strong> La visita comienza en el <strong>Centro de Interpretación "Arias Montano"</strong>, situado en la misma Peña. Es imprescindible presentarse allí para validar su entrada antes del inicio.</li>
            <li>Por favor, llega al menos 15 minutos antes de tu hora reservada.</li>
            <li>Presenta este email (digital o impreso) en el Centro de Interpretación.</li>
            <li>Se recomienda calzado cómodo y ropa adecuada para el interior de las cuevas.</li>
          </ul>

          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
            <p>Cuevas de la Peña de Arias Montano - Ayuntamiento de Alájar</p>
            <p>Si tienes alguna pregunta, contacta con nosotros en <a href="mailto:info@cuevasdealajar.com" style="color: #C4A484;">info@cuevasdealajar.com</a></p>
          </div>
        </div>
      `
    });
    return res.json({ success: true, message: 'Email enviado correctamente' });
  } catch (err: any) {
    console.error("❌ Manual Email Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/send-info-email', '/send-info-email'], async (req, res) => {
  const { orderId, emailContent } = req.body;
  if (!orderId || !emailContent) return res.status(400).json({ error: 'Falta orderId o contenido' });

  try {
    const resRef = db.collection('reservations').doc(orderId);
    const resSnap = await resRef.get();
    
    if (!resSnap.exists) return res.status(404).json({ error: 'Reserva no encontrada' });
    const resData: any = resSnap.data();

    if (!resData || !resData.customerEmail) {
      return res.status(400).json({ error: 'La reserva no tiene un email válido' });
    }

    await resend.emails.send({
      from: 'Cuevas de la Peña <info@cuevasdealajar.com>',
      to: resData.customerEmail,
      subject: `ℹ️ Información importante sobre tu visita - Peña de Arias Montano (#${orderId})`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; color: #333; line-height: 1.6;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://solonet.es/wp-content/uploads/2026/04/ICONO-CUEVAS-ALAJAR.png" alt="Logo" style="width: 80px; height: auto;">
          </div>
          <pre style="white-space: pre-wrap; font-family: inherit;">${emailContent}</pre>
          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
            <p>Cuevas de la Peña de Arias Montano - Ayuntamiento de Alájar</p>
            <p>Si tienes alguna pregunta, contacta con nosotros en <a href="mailto:info@cuevasdealajar.com" style="color: #C4A484;">info@cuevasdealajar.com</a></p>
          </div>
        </div>
      `
    });
    
    await resRef.update({ infoEmailSent: true });

    return res.json({ success: true, message: 'Email de información enviado' });
  } catch (err: any) {
    console.error("❌ Info Email Error:", err);
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
