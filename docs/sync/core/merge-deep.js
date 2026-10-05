// Generic merge for progress saved as plain JSON — portable core.
// Works without knowing the app's data shape:
//   numbers           → larger value (counters only grow: 正解数, XP, 秒数 …)
//   [n, n] tallies    → larger value per position
//   true / false      → true if either is true (done flags)
//   objects           → merged key by key (union of keys)
//   strings, others   → from the side saved more recently (non-empty first)
// Keys listed in `newer` (settings such as goal or current stage) always come from
// the side saved more recently. A newer `epoch` (set when progress is reset) wins outright.
// Both sides should carry `updatedAt` (ms) — set it on every save.
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export function mergeDeep(a, b, opts = {}) {
    const A = a, B = b;
    const ea = Number(A?.epoch || 0), eb = Number(B?.epoch || 0);
    if (ea !== eb)
        return ea > eb ? a : b;
    const aNewer = Number(A?.updatedAt || 0) >= Number(B?.updatedAt || 0);
    const newer = new Set(opts.newer || []);
    const rec = (x, y, key) => {
        if (x === undefined)
            return y;
        if (y === undefined)
            return x;
        const [n, o] = aNewer ? [x, y] : [y, x];
        if (opts.resolve && Object.prototype.hasOwnProperty.call(opts.resolve, key))
            return opts.resolve[key](x, y, aNewer);
        if (newer.has(key))
            return n;
        if (typeof x === 'number' && typeof y === 'number')
            return Math.max(x, y);
        if (typeof x === 'boolean' && typeof y === 'boolean')
            return x || y;
        if (Array.isArray(x) && Array.isArray(y)) {
            if (x.length === y.length && x.every(v => typeof v === 'number') && y.every(v => typeof v === 'number'))
                return x.map((v, i) => Math.max(v, y[i]));
            return n;
        }
        if (isObj(x) && isObj(y)) {
            const out = {};
            for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
                out[k] = rec(x[k], y[k], k);
            return out;
        }
        if (typeof n === 'string' && !n && o)
            return o;
        return n;
    };
    return rec(a, b, '');
}
/** JSON with sorted keys, so equal data gives equal text whatever the key order */
export function canon(x) {
    if (Array.isArray(x))
        return '[' + x.map(canon).join(',') + ']';
    if (isObj(x))
        return '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    return JSON.stringify(x);
}
/** same progress, ignoring updatedAt */
export const sameDeep = (a, b) => canon({ ...a, updatedAt: 0 }) === canon({ ...b, updatedAt: 0 });
