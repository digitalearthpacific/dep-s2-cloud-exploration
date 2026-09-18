/** POST JSON and parse the reply, retrying transient network/5xx failures. */
export async function postJson(url, body, { signal, retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
      });
      if (res.ok) return res.json();
      if (res.status < 500 || attempt >= retries) throw new Error(`${url} → ${res.status}`);
    } catch (e) {
      if (e.name === 'AbortError' || attempt >= retries) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}
