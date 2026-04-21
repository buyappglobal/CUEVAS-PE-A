import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
admin.initializeApp({ projectId: 'gen-lang-client-0307049198' });
const db = getFirestore(admin.app(), 'ai-studio-ebcefd58-4a1b-433f-91c9-7e7b1de61d65');
async function run() {
  try {
    await db.collection('test').doc('test').set({ hello: 'world' });
    console.log("SUCCESS");
  } catch (err: any) {
    console.log("FAILURE", err.message);
  }
}
run();
