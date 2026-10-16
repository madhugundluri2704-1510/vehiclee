import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import useVehicleStore from '../store/useVehicleStore';
import { getStatusColor, formatDistance, formatDuration, getVehicleIcon, formatWeight, formatFuel, formatSpeed } from '../utils/formatters';
import 'leaflet/dist/leaflet.css';
import './RouteMonitoringPage.css';

const srcIcon = L.divIcon({ className: 'custom-marker', html: '<div style="width:28px;height:28px;border-radius:50%;background:#10b981;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">📍</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
const dstIcon = L.divIcon({ className: 'custom-marker', html: '<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏭</div>', iconSize: [28, 28], iconAnchor: [14, 14] });

const createVehicleIcon = (type, status) => {
  const colors = { active: '#10b981', idle: '#f59e0b', maintenance: '#0ea5e9', offline: '#ef4444', returning: '#8b5cf6' };
  const color = colors[status] || '#94a3b8';
  return L.divIcon({
    className: 'vehicle-marker-icon',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${getVehicleIcon(type)}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
};

export default function RouteMonitoringPage() {
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  
  const { vehicles, fetchVehicles } = useVehicleStore();

  useEffect(() => { 
    api.get('/routes').then(r => { setRoutes(r.data); setLoading(false); }).catch(() => setLoading(false)); 
    fetchVehicles();
  }, []);

  const filtered = routes.filter(r => (!filter || r.status === filter));

  return (
    <div className="route-page">
      <div className="route-map-section">
        <MapContainer center={[15.83, 78.04]} zoom={13} className="route-map">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
          {selectedRoute && (<>
            <Marker position={[selectedRoute.source.lat, selectedRoute.source.lng]} icon={srcIcon}><Popup>📍 {selectedRoute.source.name} (Start)</Popup></Marker>
            <Marker position={[selectedRoute.destination.lat, selectedRoute.destination.lng]} icon={dstIcon}><Popup>🏭 {selectedRoute.destination.name} (Dump Yard)</Popup></Marker>
            {selectedRoute.waypoints?.length > 0 && (<Polyline positions={selectedRoute.waypoints} pathOptions={{ color: '#059669', weight: 4, opacity: 0.8 }} />)}
          </>)}
          {!selectedRoute && filtered.map(r => (<Marker key={r._id} position={[r.source.lat, r.source.lng]} icon={srcIcon}><Popup>{r.routeName}</Popup></Marker>))}
          {vehicles.map(v => (
            v.currentLocation?.lat && v.currentLocation?.lng && (!selectedRoute || v.cleaningZone === selectedRoute.cleaningZone) && (
              <Marker key={v._id} position={[v.currentLocation.lat, v.currentLocation.lng]} icon={createVehicleIcon(v.vehicleType, v.status)}>
                <Popup className="vehicle-popup"><div className="popup-content"><h4>{v.vehicleNumber}</h4><p>👷 {v.driverName}</p><p>⚡ {formatSpeed(v.speed)} | ⛽ {formatFuel(v.fuelLevel)}</p><span className={`badge ${getStatusColor(v.status)}`}>{v.status}</span></div></Popup>
              </Marker>
            )
          ))}
        </MapContainer>
      </div>
      <div className="route-list-section">
        <div className="route-list-header">
          <h3>Cleaning Routes ({filtered.length})</h3>
          <div className="tabs">
            <button className={`tab ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>All</button>
            <button className={`tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Active</button>
            <button className={`tab ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Done</button>
            <button className={`tab ${filter === 'planned' ? 'active' : ''}`} onClick={() => setFilter('planned')}>Planned</button>
          </div>
        </div>
        <div className="route-list">
          {loading ? (<div className="loading-overlay"><div className="spinner"></div></div>) : filtered.map(r => (
            <div key={r._id} className={`route-card ${selectedRoute?._id === r._id ? 'selected' : ''}`} onClick={() => setSelectedRoute(r)}>
              <div className="rc-header"><span className="rc-name">{r.routeName}</span><span className={`badge ${getStatusColor(r.status)}`}>{r.status}</span></div>
              <div className="rc-path">
                <span className="rc-point src">📍 {r.source?.name}</span><span className="rc-arrow">→</span><span className="rc-point dst">🏭 {r.destination?.name}</span>
              </div>
              <div className="rc-meta">
                <span>📏 {formatDistance(r.distance)}</span><span>⏱️ {formatDuration(r.estimatedDuration)}</span>
                <span className="badge badge-in-progress">{r.cleaningZone}</span>
                <span className={`traffic-badge ${r.trafficCondition}`}>{r.trafficCondition}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
