import axios from 'axios';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const locale = document.documentElement.lang || 'sv';
      window.location.href = locale !== 'sv' ? `/${locale}/login` : '/login';
    }
    return Promise.reject(err);
  }
);
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};
export const publicApi = {
  articles: (lang = 'sv') => api.get(`/public/articles?lang=${lang}`),
  availability: (year, month) => api.get(`/public/availability?year=${year}&month=${month}`),
  seasons: (lang = 'sv') => api.get(`/public/seasons?lang=${lang}`),
};
export const bookingApi = {
  priceCheck: (data) => api.post('/bookings/price-check', data),
  request: (data) => api.post('/bookings/request', data),
};
export const adminApi = {
  listBookings: (status, showHidden) =>
    api.get(`/bookings/admin/list${status ? `?status=${status}` : ''}${showHidden ? (status ? '&show_hidden=true' : '?show_hidden=true') : ''}`),
  getBooking: (id) => api.get(`/bookings/admin/${id}`),
  confirmBooking: (id, data) => api.post(`/bookings/admin/${id}/confirm`, data),
  rejectBooking: (id) => api.post(`/bookings/admin/${id}/reject`),
  registerPayment: (id, data) => api.post(`/bookings/admin/${id}/payment`, data),
  listSeasons: () => api.get('/admin/seasons'),
  createSeason: (data) => api.post('/admin/seasons', data),
  updateSeason: (id, data) => api.put(`/admin/seasons/${id}`, data),
  toggleSeason: (id) => api.patch(`/admin/seasons/${id}/toggle`),
  deleteSeason: (id) => api.delete(`/admin/seasons/${id}`),
  copySeason: (id) => api.post(`/admin/seasons/${id}/copy`),
  listArticles: () => api.get('/admin/articles'),
  createArticle: (data) => api.post('/admin/articles', data),
  updateArticle: (id, data) => api.put(`/admin/articles/${id}`, data),
  toggleVisible: (id) => api.patch(`/admin/articles/${id}/toggle-visible`),
  toggleBookable: (id) => api.patch(`/admin/articles/${id}/toggle-bookable`),
  deleteArticle: (id) => api.delete(`/admin/articles/${id}`),
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}?value=${encodeURIComponent(value)}`),
  listUsers: () => api.get('/auth/admin/users'),
  createStaff: (data) => api.post('/auth/admin/create-staff', data),
  updateUserDiscount: (userId, data) => api.patch(`/auth/admin/users/${userId}/discount`, data),
  updateUserFull: (userId, data) => api.put(`/auth/admin/users/${userId}`, data),
  adminResetPassword: (userId, data) => api.post(`/auth/admin/users/${userId}/reset-password`, data),
  resendSetupEmail: (userId) => api.post(`/auth/admin/users/${userId}/resend-setup-email`),
  getEmailHealth: () => api.get('/admin/email-health'),
  resendBookingEmail: (bookingId, emailType) => api.post(`/admin/bookings/${bookingId}/resend-email`, { email_type: emailType }),
  updateUserRole: (userId, data) => api.patch(`/auth/admin/users/${userId}/role`, data),
  deleteEmailLog: (id) => api.delete(`/admin/email-logs/${id}`),
  createPaypalOrder: (bookingId, data) => api.post(`/bookings/admin/${bookingId}/paypal-create`, data),
  adjustBooking: (bookingId, data) => api.patch(`/bookings/admin/${bookingId}/adjust`, data),
  addArticle: (bookingId, data) => api.post(`/bookings/admin/${bookingId}/add-article`, data),
  deleteAllEmailLogs: () => api.delete('/admin/email-logs'),
};
export default api;
