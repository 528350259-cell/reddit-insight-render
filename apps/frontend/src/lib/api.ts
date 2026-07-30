import axios from 'axios';
import { toast } from 'sonner';
import { clearAccessPassword, ensureAccessPassword } from './access-password';
import { normalizeApiBaseUrl } from './api-base-url';

export const api = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.PUBLIC_API_BASE_URL as string | undefined),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const password = ensureAccessPassword();
  if (password) config.headers.set('x-app-password', password);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message;

    if (status === 401) {
      clearAccessPassword();
      toast.error(message || '访问口令不正确，请重新输入。');
    }

    if (status === 403) {
      toast.error(message || '你没有权限执行此操作。');
    }

    if (status === 429) {
      toast.error(message || '请求过于频繁，请稍后再试。');
    }

    if (status >= 500) {
      toast.error(message || '服务端出现异常，请稍后再试。');
    }

    return Promise.reject(error);
  },
);
