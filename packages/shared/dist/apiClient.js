export class ApiClient {
    constructor(baseUrl) {
        if (baseUrl)
            this.baseUrl = baseUrl.replace(/\/$/, '');
        else if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_BASE)
            this.baseUrl = process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, '');
        else
            this.baseUrl = '';
    }
    async request(path, opts = {}) {
        const url = this.baseUrl ? `${this.baseUrl}${path}` : path;
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        const res = await fetch(url, {
            method: opts.method || 'GET',
            headers,
            body: opts.body != null ? JSON.stringify(opts.body) : undefined,
        });
        if (!res.ok)
            throw new Error(`Request failed ${res.status} ${res.statusText}`);
        return (await res.json());
    }
    get(path) {
        return this.request(path, { method: 'GET' });
    }
    post(path, body) {
        return this.request(path, { method: 'POST', body });
    }
    // Example helpers
    getProducts() {
        return this.get('/api/products');
    }
    getProduct(id) {
        return this.get(`/api/products/${id}`);
    }
}
