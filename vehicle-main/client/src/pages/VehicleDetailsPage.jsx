import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import L from 'leaflet';
import api from '../services/api';
import { getStatusColor, getVehicleIcon, formatDate, formatDistance, formatWeight, getWasteTypeIcon, getWasteTypeBadge } from '../utils/formatters';
import 'leaflet/dist/leaflet.css';
import './VehicleDetailsPage.css';

export default function VehicleDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [tracking, setTracking] = useState([]);
  const [waste, setWaste] = useState([]);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    Promise.all([
      api.get(`/vehicles/${id}`),
      api.get(`/tracking/${id}?limit=100`),
      api.get(`/waste?search=`),
      api.get(`/stops/vehicle/${id}?limit=50`)
    ]).then(([vRes, tRes, wRes, sRes]) => {
      setVehicle(vRes.data);
      setTracking(tRes.data);
      const vWaste = (wRes.data?.collections || wRes.data || []).filter(c => c.vehicleId?._id === id || c.vehicleId === id);
      setWaste(vWaste);
      setStops(sRes.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;
  if (!vehicle) return <div className="empty-state"><span className="empty-state-icon">🚫</span><span className="empty-state-text">Vehicle not found</span></div>;

  const trackingData = tracking.slice(0, 30).reverse().map((t, i) => ({ time: i, speed: t.speed, fuel: t.fuelLevel, waste: Math.round((t.wasteWeight||0)/100) }));
  const routePath = tracking.filter(t => t.latitude && t.longitude).map(t => [t.latitude, t.longitude]);
  const vIcon = L.divIcon({ className: 'vehicle-marker-icon', html: `<div style="width:40px;height:40px;border-radius:50%;background:#059669;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 12px rgba(0,0,0,0.3);">${getVehicleIcon(vehicle.vehicleType)}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  const tooltipStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' };
  const loadPercent = vehicle.loadCapacity ? Math.round((vehicle.currentLoadWeight / vehicle.loadCapacity) * 100) : 0;

  return (
    <div className="vehicle-details">
      <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      <div className="vd-header-card card">
        <div className="vd-header">
          <div className="vd-avatar">{getVehicleIcon(vehicle.vehicleType)}</div>
          <div className="vd-info">
            <h2>{vehicle.vehicleNumber}</h2>
            <p>👷 {vehicle.driverName} • {vehicle.driverPhone}</p>
            <span className={`badge ${getStatusColor(vehicle.status)} badge-pulse`}><span className="badge-dot"></span> {vehicle.status}</span>
            <span className="badge badge-in-progress" style={{marginLeft: 8}}>{vehicle.cleaningZone}</span>
          </div>
          <div className="vd-quick-stats">
            <div className="vd-qs"><span className="vd-qs-val">⚡ {vehicle.speed}</span><span className="vd-qs-label">km/h</span></div>
            <div className="vd-qs"><span className="vd-qs-val">⛽ {vehicle.fuelLevel}%</span><span className="vd-qs-label">Fuel</span></div>
            <div className="vd-qs"><span className="vd-qs-val">♻️ {formatWeight(vehicle.currentLoadWeight||0)}</span><span className="vd-qs-label">Load ({loadPercent}%)</span></div>
            <div className="vd-qs"><span className="vd-qs-val">📏 {formatDistance(vehicle.mileage)}</span><span className="vd-qs-label">Mileage</span></div>
          </div>
        </div>
      </div>

      <div className="tabs" style={{marginBottom:'var(--space-md)'}}>
        <button className={`tab ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}>Overview</button>
        <button className={`tab ${tab==='tracking'?'active':''}`} onClick={()=>setTab('tracking')}>Tracking</button>
        <button className={`tab ${tab==='waste'?'active':''}`} onClick={()=>setTab('waste')}>Waste Collection</button>
        <button className={`tab ${tab==='stops'?'active':''}`} onClick={()=>setTab('stops')}>🛑 Stops & Idle History ({stops.length})</button>
      </div>

      {tab === 'overview' && (
        <div className="vd-grid">
          <div className="card">
            <h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Vehicle Info</h3>
            <div className="info-grid">
              <div className="info-row"><span className="info-label">Type</span><span className="info-val">{vehicle.vehicleType}</span></div>
              <div className="info-row"><span className="info-label">Zone</span><span className="info-val">{vehicle.cleaningZone}</span></div>
              <div className="info-row"><span className="info-label">Ward</span><span className="info-val">Ward {vehicle.wardNumber}</span></div>
              <div className="info-row"><span className="info-label">Load Capacity</span><span className="info-val">{formatWeight(vehicle.loadCapacity)}</span></div>
              <div className="info-row"><span className="info-label">Waste Type</span><span className="info-val">{getWasteTypeIcon(vehicle.wasteType)} {vehicle.wasteType}</span></div>
              <div className="info-row"><span className="info-label">Container</span><span className="info-val">{vehicle.containerType}</span></div>
              <div className="info-row"><span className="info-label">Last Maintenance</span><span className="info-val">{formatDate(vehicle.lastMaintenance)}</span></div>
              <div className="info-row"><span className="info-label">Next Due</span><span className="info-val">{formatDate(vehicle.nextMaintenanceDue)}</span></div>
            </div>
          </div>
          <div className="card">
            <h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Speed, Fuel & Waste Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trackingData}><CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" /><XAxis dataKey="time" tick={{fill:'var(--text-tertiary)',fontSize:10}} /><YAxis tick={{fill:'var(--text-tertiary)',fontSize:10}} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="speed" stroke="#059669" strokeWidth={2} dot={false} name="Speed" /><Line type="monotone" dataKey="fuel" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Fuel" /><Line type="monotone" dataKey="waste" stroke="#f59e0b" strokeWidth={2} dot={false} name="Load (x100kg)" /></LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card map-card-small">
            <h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Current Location</h3>
            <div className="mini-map-container">
              <MapContainer center={[vehicle.currentLocation?.lat||15.83, vehicle.currentLocation?.lng||78.04]} zoom={14} className="mini-map" zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[vehicle.currentLocation?.lat||15.83, vehicle.currentLocation?.lng||78.04]} icon={vIcon} />
                {routePath.length > 1 && <Polyline positions={routePath} pathOptions={{color:'#059669',weight:3}} />}
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {tab === 'tracking' && (
        <div className="card"><h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Recent Tracking Points</h3>
          <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>#</th><th>Lat</th><th>Lng</th><th>Speed</th><th>Fuel</th><th>Waste Load</th><th>Event</th><th>Time</th></tr></thead><tbody>
            {tracking.slice(0,50).map((t,i)=>(<tr key={t._id||i}><td>{i+1}</td><td>{t.latitude?.toFixed(4)}</td><td>{t.longitude?.toFixed(4)}</td><td>{t.speed} km/h</td><td>{t.fuelLevel?.toFixed(1)}%</td><td>{formatWeight(t.wasteWeight||0)}</td><td><span className={`badge badge-${t.eventType==='collection'?'in-progress':'active'}`}>{t.eventType}</span></td><td style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>{new Date(t.timestamp).toLocaleString('en-IN')}</td></tr>))}
          </tbody></table></div>
        </div>
      )}

      {tab === 'waste' && (
        <div className="card"><h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Waste Collection History</h3>
          {waste.length===0 ? (<div className="empty-state"><span className="empty-state-icon">♻️</span><span className="empty-state-text">No collection records</span></div>) : (
          <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Type</th><th>Weight</th><th>Container</th><th>Zone</th><th>Status</th></tr></thead><tbody>
            {waste.map(c=>(<tr key={c._id}><td><strong>{c.collectionId}</strong></td><td>{getWasteTypeIcon(c.wasteType)} {c.wasteType}</td><td>{formatWeight(c.loadWeight)}</td><td>{c.containerType}</td><td>{c.cleaningZone}</td><td><span className={`badge ${getStatusColor(c.collectionStatus)}`}>{c.collectionStatus}</span></td></tr>))}
          </tbody></table></div>)}
        </div>
      )}

      {tab === 'stops' && (
        <div className="card">
          <h3 className="card-title" style={{marginBottom:'var(--space-md)'}}>Vehicle Stop & Idle Event History</h3>
          {stops.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">🛑</span>
              <span className="empty-state-text">No recorded stops for this vehicle</span>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Zone</th>
                    <th>Reason</th>
                    <th>Driver's Explanation</th>
                    <th>Supervisor Review</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.map((s) => (
                    <tr key={s._id}>
                      <td>{new Date(s.startTime).toLocaleString('en-IN')}</td>
                      <td>{s.endTime ? new Date(s.endTime).toLocaleTimeString('en-IN') : <span className="badge badge-warning">Currently Stopped</span>}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: s.durationMinutes >= 10 ? '#ef4444' : 'inherit' }}>
                          ⏱️ {s.durationMinutes} mins
                        </span>
                      </td>
                      <td>{s.cleaningZone || 'Zone 1'}</td>
                      <td>
                        {s.explanation?.reason ? (
                          <span className="badge badge-in-progress" style={{ textTransform: 'capitalize' }}>
                            {s.explanation.reason}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>None provided</span>
                        )}
                      </td>
                      <td style={{ maxWidth: '200px', fontSize: '0.82rem' }}>
                        {s.explanation?.details || '—'}
                      </td>
                      <td>
                        {s.review?.status === 'approved' ? (
                          <span className="badge badge-active">✓ Approved</span>
                        ) : s.review?.status === 'rejected' ? (
                          <div>
                            <span className="badge badge-offline">✕ Rejected</span>
                            {s.review.remarks && (
                              <span style={{ display: 'block', fontSize: '0.7rem', color: '#ef4444' }}>
                                "{s.review.remarks}"
                              </span>
                            )}
                          </div>
                        ) : s.explanation?.reason ? (
                          <span className="badge badge-warning">⏳ Pending</span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
