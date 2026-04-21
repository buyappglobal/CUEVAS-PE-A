import express from 'express';
import crypto from 'crypto';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Webhooks urlencoded payloads sometimes
app.use(express.urlencoded({ extended: true })); 

// --- Configuración de Redsys (Entorno de Test) ---
const REDSYS_SECRET_KEY = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
const MERCHANT_CODE = '369364104';
const TERMINAL = '1';

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
    const { amount, tickets, date, time, customer } = req.body;
    
    // Importe multiplicado x 100 para ser céntimos (exigencia de Redsys)
    const amountStr = Math.round(amount * 100).toString();
    
    // Generador de ID de pedido único (Redsys requiere mínimo 4 dígitos iniciales)
    // Usamos el timestamp actual en segundos completado a 12 caracteres.
    const orderId = String(Math.floor(Date.now() / 1000)).substring(0, 12).padStart(12, '0');

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
      url: 'https://sis-t.redsys.es:25443/sis/realizarPago',
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
app.post('/api/redsys-webhook', (req, res) => {
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
      console.log('✅ PAGO CONFIRMADO. Aquí escribiríamos los tickets en la Base de Datos.');
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
