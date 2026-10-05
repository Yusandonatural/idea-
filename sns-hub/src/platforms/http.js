// SNSのAPIを呼ぶ共通処理。失敗したらSNS側のエラー文をそのまま投げる
export async function call(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error_description || data?.detail || data?.title ||
      (typeof data?.error === 'string' ? data.error : '') || data?.message ||
      data?.errors?.[0]?.message || data?.raw?.slice(0, 300) || res.statusText;
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function form(params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, String(v));
  return body;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
