import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useVehicleStore from '../store/useVehicleStore';
import useAlertStore from '../store/useAlertStore';
import useWorkforceStore from '../store/useWorkforceStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const useSocket = () => {
  const socketRef = useRef(null);
  const updateVehiclePosition = useVehicleStore((s) => s.updateVehiclePosition);
  const addAlert = useAlertStore((s) => s.addAlert);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Connected to KMC SwachthTrack');
      socket.emit('join:dashboard');

      // If logged in as driver, join driver room
      const currentUser = JSON.parse(localStorage.getItem('kmc-user') || '{}');
      if (currentUser?.employeeId) {
        socket.emit('join:driver', currentUser.employeeId);
      }

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
    socket.on('vehicle:update', (data) => { updateVehiclePosition(data); });
    socket.on('alert:new', (alert) => { 
      addAlert(alert); 
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🚨 ${alert.severity?.toUpperCase() || 'HIGH'} Alert`, {
          body: alert.message,
          icon: '/vite.svg'
        });
      }
    });

    // Vehicle Stop Detection & Explanation Real-Time Events
    socket.on('vehicle:stop_started', (data) => {
      useVehicleStore.getState().updateOrAddActiveStop(data);
    });

    socket.on('vehicle:stop_update', (data) => {
      useVehicleStore.getState().updateOrAddActiveStop(data);
    });

    socket.on('vehicle:stop_alert', (data) => {
      useVehicleStore.getState().updateOrAddActiveStop({
        _id: data.stopId,
        vehicleId: data.vehicleId,
        vehicleNumber: data.vehicleNumber,
        driverName: data.driverName,
        durationMinutes: data.stopDuration,
        alertTriggered: true,
        location: data.location,
        cleaningZone: data.cleaningZone,
        startTime: data.stoppedAt
      });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🛑 Prolonged Vehicle Stop (${data.stopDuration} mins)`, {
          body: `${data.vehicleNumber} (${data.driverName}) stopped at ${data.cleaningZone}. Driver explanation required.`,
          icon: '/vite.svg'
        });
      }
    });

    socket.on('vehicle:stop_ended', (data) => {
      useVehicleStore.getState().removeActiveStop(data.stopId, data.vehicleId);
    });

    socket.on('stop:explanation_submitted', (data) => {
      useVehicleStore.getState().updateOrAddActiveStop({
        _id: data.stopId,
        vehicleId: data.vehicleId,
        explanation: data.explanation,
        review: { status: 'pending' }
      });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`📝 Stop Explanation Submitted`, {
          body: `Driver ${data.driverName} submitted explanation for ${data.vehicleNumber} (${data.explanation?.reason})`,
          icon: '/vite.svg'
        });
      }
    });

    socket.on('stop:explanation_reviewed', (data) => {
      useVehicleStore.getState().updateOrAddActiveStop({
        _id: data.stopId,
        vehicleId: data.vehicleId,
        review: { status: data.status, remarks: data.remarks }
      });
    });

    socket.on('driver:stop_explanation_required', (data) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⚠️ Prolonged Stop Explanation Required`, {
          body: `Your vehicle ${data.vehicleNumber} has stopped for ${data.stopDuration} mins. Please submit your reason.`,
          icon: '/vite.svg'
        });
      }
    });

    socket.on('driver:explanation_reviewed', (data) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`📋 Stop Explanation ${data.status.toUpperCase()}`, {
          body: `Your explanation for vehicle stop was ${data.status}. ${data.remarks ? 'Remarks: ' + data.remarks : ''}`,
          icon: '/vite.svg'
        });
      }
    });

    socket.on('new_complaint', (complaint) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`📢 New ${complaint.source} Complaint`, {
          body: `${complaint.zone} - Ward ${complaint.ward}: ${complaint.description}`,
          icon: '/vite.svg'
        });
      }
    });
    socket.on('workforce:stats', (data) => { useWorkforceStore.getState().setWorkforceStats(data); });
    socket.on('attendance:update', () => { useWorkforceStore.getState().fetchTodayAttendance(); });
    socket.on('disconnect', () => { console.log('❌ Socket disconnected'); });

    return () => { socket.disconnect(); };
  }, []);

  const trackVehicle = useCallback((vehicleId) => { socketRef.current?.emit('track:vehicle', vehicleId); }, []);
  const untrackVehicle = useCallback((vehicleId) => { socketRef.current?.emit('untrack:vehicle', vehicleId); }, []);

  return { socket: socketRef.current, trackVehicle, untrackVehicle };
};

export default useSocket;
