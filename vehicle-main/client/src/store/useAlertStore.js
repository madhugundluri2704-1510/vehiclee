import { create } from 'zustand';
import api from '../services/api';

const useAlertStore = create((set) => ({
  alerts: [],
  unacknowledgedCount: 0,
  loading: false,

  fetchAlerts: async (params = {}) => {
    set({ loading: true });
    try {
      const queryStr = Object.entries(params).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join('&');
      const { data } = await api.get(`/alerts?${queryStr}`);
      set({ alerts: data.alerts, unacknowledgedCount: data.unacknowledgedCount, loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  addAlert: (alert) => set((state) => {
    const exists = state.alerts.some(a => a._id === alert._id);
    if (exists) {
      return {
        alerts: state.alerts.map(a => a._id === alert._id ? alert : a)
      };
    }
    return {
      alerts: [alert, ...state.alerts].slice(0, 100),
      unacknowledgedCount: state.unacknowledgedCount + 1
    };
  }),

  acknowledgeAlert: async (id) => {
    try {
      await api.put(`/alerts/${id}/acknowledge`);
      set((state) => ({
        alerts: state.alerts.map(a => a._id === id ? { ...a, acknowledged: true } : a),
        unacknowledgedCount: Math.max(0, state.unacknowledgedCount - 1)
      }));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }
}));

export default useAlertStore;
