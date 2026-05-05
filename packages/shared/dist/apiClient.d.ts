type RequestOptions = {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
};
export declare class ApiClient {
    baseUrl: string;
    constructor(baseUrl?: string);
    request<T>(path: string, opts?: RequestOptions): Promise<T>;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: any): Promise<T>;
    getProducts(): Promise<Product[]>;
    getProduct(id: number): Promise<Product>;
}
import type { Product } from './types';
export type { Product };
