import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, getDocs, getDoc, query, where, increment } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    
    // Check if admin, if email is authorized, auto-add to admins
    const authorizedBootstrappers = ['holasolonet@gmail.com', 'caballerovazquezrafael@gmail.com'];
    if (result.user.email && authorizedBootstrappers.includes(result.user.email)) {
      const adminRef = doc(db, 'admins', result.user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, { email: result.user.email });
      }
    }
    
    return result.user;
  } catch (error) {
    console.error("Error logging in", error);
    throw error;
  }
};

export const logout = () => signOut(auth);
