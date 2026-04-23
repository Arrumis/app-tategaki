
/**
 * API Client Utility
 */

export async function get(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`GET ${url} failed: ${res.status}`);
    }
    return res.json();
}

export async function post(url, body, options = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...options
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `POST ${url} failed: ${res.status}`);
    }
    return res.json();
}

export async function del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `DELETE ${url} failed: ${res.status}`);
    }
    return res.json();
}
