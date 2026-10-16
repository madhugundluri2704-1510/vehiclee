import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kmc-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('kmc-refresh-token');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const { data } = await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`, { refreshToken });
          localStorage.setItem('kmc-token', data.token);
          error.config.headers.Authorization = `Bearer ${data.token}`;
          return api(error.config);
        } catch {
          localStorage.removeItem('kmc-token');
          localStorage.removeItem('kmc-refresh-token');
          localStorage.removeItem('kmc-user');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const stopApi = {
  getActiveStops: () => api.get('/stops/active'),
  getStopHistory: (params) => api.get('/stops/history', { params }),
  getStopById: (id) => api.get(`/stops/${id}`),
  getVehicleStops: (vehicleId, limit = 30) => api.get(`/stops/vehicle/${vehicleId}?limit=${limit}`),
  getDriverPendingStops: () => api.get('/stops/driver/pending'),
  submitExplanation: (id, payload) => api.post(`/stops/${id}/explanation`, payload),
  reviewExplanation: (id, payload) => api.put(`/stops/${id}/review`, payload),
  getConfig: () => api.get('/stops/config'),
  updateConfig: (config) => api.put('/stops/config', config),
  simulateStop: (payload) => api.post('/stops/simulate', payload)
};

export default api;
