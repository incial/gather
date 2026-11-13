import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, connectAuthEmulator, deleteUser, getAuth, onAuthStateChanged, reauthenticateWithPopup, signInWithCredential,
  signInAnonymously, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import {
  Timestamp, arrayUnion, collection, increment, connectFirestoreEmulator, deleteDoc, doc, documentId, getCountFromServer, getDoc, getDocs, initializeFirestore, limit, onSnapshot, orderBy, startAfter,
  persistentLocalCache, persistentMultipleTabManager, query, serverTimestamp, setDoc, where,
  writeBatch, type DocumentData, type DocumentSnapshot, type Query,
} from 'firebase/firestore';
import type { Backend, QueryOpts, Where } from './backend';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firestore timestamps become ISO strings so screens and CSVs handle one format. */
function plain(snap: DocumentSnapshot<DocumentData>) {
  const out: Record<string, unknown> = { id: snap.id };
  const data = snap.data({ serverTimestamps: 'estimate' }) ?? {};
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? v.toDate().toISOString() : v;
  return out;
}

export function createFirebaseBackend(): Backend {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    // Keeps the schedule and speakers readable when hall Wi-Fi drops.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === '1'; // local testing only
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8181);
  }
  const buildQuery = (path: string, w: Where, opts?: QueryOpts): Query => {
    // A field written as 'name[]' means "this list contains the value" (array-contains); anything else is equality.
    const parts = [...w.map(([f, v]) => (f.endsWith('[]') ? where(f.slice(0, -2), 'array-contains', v) : where(f, '==', v)))];
    const shaped = [
      ...(opts?.orderBy ? [orderBy(opts.orderBy, opts.desc ? 'desc' : 'asc'), orderBy(documentId(), opts.desc ? 'desc' : 'asc')] : []),
      ...(opts?.orderBy && opts.after ? [startAfter(...opts.after)] : []),
      ...(opts?.limit ? [limit(opts.limit)] : []),
    ];
    return query(collection(db, path), ...parts, ...shaped);
  };

  return {
    mode: 'firebase',
    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u ? {
      uid: u.uid, email: (u.email ?? '').toLowerCase(), name: u.displayName ?? '', emailVerified: u.emailVerified, photo: u.photoURL ?? undefined,
      ...(u.isAnonymous ? { guest: true } : {}),
    } : null)),
    async signInGuest() { await signInAnonymously(auth); },
    async signInGoogle() {
      if (useEmulator) {
        const who = (window as unknown as { __testGoogleUser: object }).__testGoogleUser;
        await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify(who)));
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Some phones and in-app browsers (WhatsApp, Instagram) block pop-ups: use a full-page redirect instead.
        const code = (e as { code?: string }).code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw e;
      }
    },
    signOut: () => signOut(auth),
    idToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : ''),
    async deleteAccount() {
      const u = auth.currentUser;
      if (!u) return;
      try { await deleteUser(u); }
      catch (e) {
        // Firebase asks for a fresh sign-in before deleting an account.
        if ((e as { code?: string }).code !== 'auth/requires-recent-login') throw e;
        await reauthenticateWithPopup(u, new GoogleAuthProvider());
        await deleteUser(u);
      }
    },
    watchDoc: (path, cb, onErr) => onSnapshot(doc(db, path),
      (s) => cb(s.exists() ? (plain(s) as never) : null), onErr),
    watchCol: (path, w, cb, onErr, opts) => onSnapshot(buildQuery(path, w, opts),
      (s) => cb(s.docs.map(plain) as never), onErr),
    async getDoc(path) {
      const s = await getDoc(doc(db, path));
      return s.exists() ? (plain(s) as never) : null;
    },
    async getCol(path, w = [], opts) {
      return (await getDocs(buildQuery(path, w, opts))).docs.map(plain) as never;
    },
    async count(path, w = []) {
      return (await getCountFromServer(buildQuery(path, w))).data().count;
    },
    async write(ops) {
      if (ops.length === 1 && ops[0].type === 'delete') return deleteDoc(doc(db, ops[0].path));
      if (ops.length === 1 && ops[0].type === 'set') {
        return setDoc(doc(db, ops[0].path), ops[0].data, { merge: !!ops[0].merge });
      }
      // Firestore caps a batch at 500 writes; large CSV imports are split.
      for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 450)) {
          if (op.type === 'delete') batch.delete(doc(db, op.path));
          else batch.set(doc(db, op.path), op.data, { merge: !!op.merge });
        }
        await batch.commit();
      }
    },
    now: () => serverTimestamp(),
    timestampIn: (ms) => Timestamp.fromMillis(Date.now() + ms),
    newId: () => doc(collection(db, 'ids')).id,
    inc: (n) => increment(n),
    union: (...v) => arrayUnion(...v),
  };
}
