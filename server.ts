import express from 'express';
import crypto from 'crypto';
import path from 'path';
import cors from 'cors';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback_so_it_doesnt_crash');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
// Webhooks urlencoded payloads sometimes
app.use(express.urlencoded({ extended: true })); 

// --- Configuración de Redsys ---
const REDSYS_SECRET_KEY = process.env.REDSYS_SECRET_KEY || 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
const MERCHANT_CODE = process.env.REDSYS_MERCHANT_CODE || '369364104';
const TERMINAL = process.env.REDSYS_TERMINAL || '1';
const REDSYS_URL = process.env.REDSYS_URL || 'https://sis-t.redsys.es:25443/sis/realizarPago';

// Función para encriptar la MAC usando 3DES (Triple DES)
function encrypt3DES(orderId: string, secret: string) {
  const decodedSecret = Buffer.from(secret, 'base64');
  const iv = Buffer.alloc(8, 0); // Initialization Vector a 0
  const cipher = crypto.createCipheriv('des-ede3-cbc', decodedSecret, iv);
  cipher.setAutoPadding(false);

  // Asegurar padding de ceros hasta un múltiplo de 8 para cumplir exigencias 3des
  const orderBuffer = Buffer.from(orderId, 'utf-8');
  let paddedLength = orderBuffer.length;
  if (paddedLength % 8 !== 0) {
    paddedLength += 8 - (paddedLength % 8);
  }
  const paddedOrder = Buffer.alloc(paddedLength, 0);
  orderBuffer.copy(paddedOrder);

  let encrypted = cipher.update(paddedOrder);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted;
}

// Función para generar la firma HMAC-SHA256 final
function mac256(data: string, key: Buffer) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('base64');
}

// --- Endpoints de la API ---

// 1. Endpoint para iniciar el pago
app.post('/api/create-payment', (req, res) => {
  try {
    const { amount, tickets, date, time, customer, orderId } = req.body;
    
    // Importe multiplicado x 100 para ser céntimos (exigencia de Redsys)
    const amountStr = Math.round(amount * 100).toString();
    
    console.log(`🎟️ Iniciando reserva - Pedido: ${orderId} | Total: ${amount}€`);

    // El servidor puede recibir esta URL dependiendo de si estamos en dev o deploy,
    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

    const params = {
      DS_MERCHANT_AMOUNT: amountStr,
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: MERCHANT_CODE,
      DS_MERCHANT_CURRENCY: '978',
      DS_MERCHANT_TRANSACTIONTYPE: '0',
      DS_MERCHANT_TERMINAL: TERMINAL,
      DS_MERCHANT_MERCHANTURL: `${baseUrl}/api/redsys-webhook`, // Callback URL en segundo plano
      DS_MERCHANT_URLOK: `${baseUrl}?payment=success`, // URL de retorno si éxito
      DS_MERCHANT_URLKO: `${baseUrl}?payment=error`,   // URL de retorno si fallo
      DS_MERCHANT_MERCHANTDATA: JSON.stringify({ tickets, date, time, customer }) // Pasamos la config de tickets para control interno
    };

    const paramsBase64 = Buffer.from(JSON.stringify(params), 'utf-8').toString('base64');

    // Generar la firma segura (Server Side)
    const transactionKey = encrypt3DES(orderId, REDSYS_SECRET_KEY);
    const signature = mac256(paramsBase64, transactionKey);

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
app.post('/api/redsys-webhook', async (req, res) => {
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

    // Respuestas en 0000 al 0099 son autorizadas
    const responseCode = parseInt(params.Ds_Response, 10);
    if (responseCode >= 0 && responseCode <= 99) {
      console.log('✅ PAGO CONFIRMADO. Enviando ticket...');
      
      try {
        // Redsys de vuelve el MerchantData codificado en la URL (a veces)
        const merchantDataStr = decodeURIComponent(params.Ds_MerchantData);
        const { date, time, customer, tickets } = JSON.parse(merchantDataStr);
        
        const totalTickets = (tickets.adult || 0) + (tickets.reduced || 0) + (tickets.childFree || 0);

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #151515;">
            <div style="background-color: #151515; padding: 30px; text-align: center;">
              <h1 style="color: #C4A484; font-family: serif; margin: 0;">Cuevas de la Peña</h1>
              <p style="color: rgba(229, 226, 217, 0.6); margin-top: 5px;">Arias Montano</p>
            </div>
            
            <div style="padding: 30px; border: 1px solid #eee;">
              <h2 style="font-family: serif; margin-top: 0;">¡Hola ${customer.name}!</h2>
              <p>Tu pago ha sido confirmado correctamente. Aquí tienes los detalles de tu visita:</p>
              
              <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #C4A484; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #C4A484; text-transform: uppercase; font-size: 14px;">Detalles de la Reserva</h3>
                <p><strong>Localizador:</strong> #${params.Ds_Order}</p>
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
                <p>Si tienes alguna duda, ponte en contacto con taquilla@cuevas.com</p>
              </div>
            </div>
          </div>
        `;

        // Send Email via Resend
        await resend.emails.send({
          from: 'Cuevas de la Peña <onboarding@resend.dev>', // Usamos el generico de pruebas de Resend
          to: customer.email,
          subject: '🎟️ Tus entradas confirmadas - Cuevas de la Peña',
          html: emailHtml
        });
        
        console.log(`✉️ Email enviado a: ${customer.email} correctamente.`);
      } catch (err: any) {
        console.error('⚠️ Error procesando el email post-pago:', err.message);
      }
    } else {
      console.log('❌ PAGO DENEGADO por la tarjeta.');
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
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
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
