import { api } from './api';

export interface CurrentUser {
  id: string;
  tenantId: string;
  roleCode: string;
}

interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const result = await api.post<LoginResponse>('/auth/login', { email, password });
  localStorage.setItem('accessToken', result.accessToken);
  localStorage.setItem('user', JSON.stringify(result.user));
  return result.user;
}

export function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('accessToken');
}
