const defaultLoad = () => Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]);
export function createCloudSync(o) {
    const config = o.emulator ? { apiKey: 'demo-key', projectId: 'demo-french', authDomain: 'localhost' } : o.config;
    const status = { user: null, state: 'idle', ready: false };
    const watchers = [];
    // copy: a watcher may unsubscribe itself while we loop
    const emit = (p) => { Object.assign(status, p); watchers.slice().forEach(f => f(status)); };
    let fb = null, uid = null;
    let pushTimer;
    let chain = Promise.resolve();
    async function doSync() {
        if (!fb || !uid)
            return;
        clearTimeout(pushTimer);
        pushTimer = undefined;
        const { fs, db } = fb;
        emit({ state: 'syncing' });
        try {
            const ref = fs.doc(db, o.collection, uid);
            const snap = await fs.getDoc(ref);
            const local = o.getLocal();
            const remote = snap.exists() ? JSON.parse(snap.data().st) : null;
            const merged = remote ? o.merge(local, remote) : local;
            if (!o.same(merged, local)) {
                o.setLocal(merged);
                o.onRemoteChange();
            }
            if (!remote || !o.same(merged, remote)) {
                await fs.setDoc(ref, { st: JSON.stringify(merged), updatedAt: fs.serverTimestamp(), ua: navigator.userAgent.slice(0, 120) });
            }
            emit({ state: 'ok', at: Date.now(), msg: undefined });
        }
        catch (e) {
            const code = e.code || '';
            emit({ state: 'error', msg: code.includes('permission') ? '同期できませんでした（保存先の権限設定を確認してください）' : '同期できませんでした。電波のよいところで「今すぐ同期」を押してください' });
        }
    }
    /** Pull, merge, and push if the cloud is behind. Runs one at a time. */
    const syncNow = () => (chain = chain.then(doSync, doSync));
    return {
        available: !!config,
        onStatus(fn) { watchers.push(fn); fn(status); return () => { const i = watchers.indexOf(fn); if (i >= 0)
            watchers.splice(i, 1); }; },
        syncNow,
        async init() {
            if (!config)
                return;
            try {
                const [{ initializeApp, getApps }, authMod, fs] = await (o.loadFirebase || defaultLoad)();
                const app = getApps()[0] || initializeApp(config);
                fb = { auth: authMod.getAuth(app), authMod, db: fs.getFirestore(app), fs };
                if (o.emulator) {
                    authMod.connectAuthEmulator(fb.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
                    fs.connectFirestoreEmulator(fb.db, '127.0.0.1', 8085);
                    const { auth } = fb;
                    // tests sign in without the Google popup
                    window.__testSignIn = (email) => authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, name: email.split('@')[0], email_verified: true })));
                }
                authMod.getRedirectResult(fb.auth).catch(() => { });
                authMod.onAuthStateChanged(fb.auth, u => {
                    uid = u ? u.uid : null;
                    emit({ ready: true, user: u ? { name: u.displayName || '', email: u.email || '' } : null, state: 'idle', msg: undefined });
                    if (u)
                        syncNow();
                });
            }
            catch {
                emit({ ready: true, state: 'error', msg: '同期の準備に失敗しました（通信を確認してください）' });
                return;
            }
            o.onLocalSaved(() => {
                if (!uid || pushTimer)
                    return;
                pushTimer = setTimeout(() => { pushTimer = undefined; syncNow(); }, o.pushDelayMs ?? 20000);
            });
            document.addEventListener('visibilitychange', () => { if (uid)
                syncNow(); });
        },
        async signIn() {
            if (!fb)
                return;
            const { authMod, auth } = fb;
            const provider = new authMod.GoogleAuthProvider();
            try {
                await authMod.signInWithPopup(auth, provider);
            }
            catch (e) {
                const code = e.code || '';
                if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
                    return authMod.signInWithRedirect(auth, provider);
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
                    return;
                emit({ state: 'error', msg: code === 'auth/unauthorized-domain' ? 'このURLはログインが許可されていません（Firebase の承認済みドメインに追加してください）' : 'ログインできませんでした' });
            }
        },
        async signOut() {
            if (!fb)
                return;
            if (uid)
                await syncNow();
            await fb.authMod.signOut(fb.auth);
        },
    };
}
