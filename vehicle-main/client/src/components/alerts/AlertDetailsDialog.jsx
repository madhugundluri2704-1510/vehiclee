import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  IconButton
} from '@mui/material';
import { getSeverityIcon, formatTimeAgo } from '../../utils/formatters';

export default function AlertDetailsDialog({ open, onClose, alert, onViewOnMap, onAcknowledge }) {
  if (!alert) return null;

  const lat = alert.location?.lat ?? alert.lat ?? alert.stopId?.location?.lat;
  const lng = alert.location?.lng ?? alert.lng ?? alert.stopId?.location?.lng;
  const hasValidLocation = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

  const vehicleReg = alert.vehicleNumber || alert.vehicleId?.vehicleNumber || (alert.message?.match(/AP24[A-Z0-9]+/)?.[0]) || 'Unknown Vehicle';
  const vehicleId = alert.vehicleId?._id || (typeof alert.vehicleId === 'string' ? alert.vehicleId : null) || 'N/A';
  const driverName = alert.driverName || alert.vehicleId?.driverName || (alert.message?.match(/Driver:\s*([^)]+)/)?.[1]) || 'Assigned Operator';
  const address = alert.address || alert.location?.address || alert.stopId?.location?.address || alert.cleaningZone || '';

  const alertType = (alert.type || 'alert').replace(/-/g, ' ').toUpperCase();
  const severity = alert.severity || 'medium';
  const alertDate = alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }) : 'Just now';

  const isStopAlert = alert.type === 'prolonged-stop' || Boolean(alert.stopId);
  const stopDuration = alert.stopDuration || alert.stopId?.durationMinutes;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: '1.4rem' }}>{getSeverityIcon(severity)}</span>
          <Box>
            <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>
              {alertType} ALERT
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Incident Details & Vehicle Location
            </Typography>
          </Box>
        </Box>
        <Chip
          label={severity.toUpperCase()}
          color={severity === 'critical' ? 'error' : severity === 'high' ? 'warning' : 'info'}
          size="small"
          sx={{ fontWeight: 800, fontSize: '0.72rem' }}
        />
      </DialogTitle>

      <DialogContent dividers sx={{ py: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Vehicle Information */}
          <Box sx={{ p: 1.5, background: 'rgba(15, 23, 42, 0.04)', borderRadius: 2, border: '1px solid rgba(148, 163, 184, 0.2)' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Vehicle & Operator Information
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1 }}>
              <div>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Registration Number</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{vehicleReg}</Typography>
              </div>
              <div>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Driver Name</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{driverName}</Typography>
              </div>
              <div>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Vehicle ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>{vehicleId}</Typography>
              </div>
              <div>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Cleaning Zone</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{alert.cleaningZone || 'Municipal Area'}</Typography>
              </div>
            </Box>
          </Box>

          {/* Alert Description & Timestamp */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Alert Description & Time
            </Typography>
            <Box sx={{ p: 1.5, mt: 0.8, borderRadius: 2, background: severity === 'critical' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)', borderLeft: '4px solid', borderLeftColor: severity === 'critical' ? '#ef4444' : '#f59e0b' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                {alert.message}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.8, color: 'text.secondary' }}>
                🕒 <strong>Triggered:</strong> {alertDate} ({formatTimeAgo(alert.createdAt)})
              </Typography>
            </Box>
          </Box>

          {/* Stop Incident Specifics (if prolonged stop) */}
          {isStopAlert && (
            <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(239, 68, 68, 0.05)', border: '1px dashed #ef4444' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
                🛑 Stop Incident Parameters
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stop Duration</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626' }}>
                    {stopDuration ? `${Math.round(stopDuration)} minutes` : '10+ minutes'}
                  </Typography>
                </div>
                {alert.stopStartTime && (
                  <div>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stop Started At</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {new Date(alert.stopStartTime).toLocaleTimeString('en-IN')}
                    </Typography>
                  </div>
                )}
              </Box>
            </Box>
          )}

          {/* GPS Location Details (Requirement 1, 2, 8) */}
          <Box sx={{ p: 1.5, borderRadius: 2, background: hasValidLocation ? 'rgba(16, 185, 129, 0.06)' : 'rgba(148, 163, 184, 0.1)', border: '1px solid', borderColor: hasValidLocation ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: hasValidLocation ? '#059669' : 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {hasValidLocation ? '📍 Captured GPS Location' : '📍 Vehicle GPS Location'}
              </Typography>
              {hasValidLocation ? (
                <Chip label="GPS Fix Valid" size="small" color="success" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }} />
              ) : (
                <Chip label="Location Unavailable" size="small" color="default" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }} />
              )}
            </Box>

            {hasValidLocation ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Latitude</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {Number(lat).toFixed(6)}° N
                  </Typography>
                </div>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Longitude</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {Number(lng).toFixed(6)}° E
                  </Typography>
                </div>
                <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Location Address / Landmark</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                    {address || 'Kurnool Municipal Area'}
                  </Typography>
                </div>
              </Box>
            ) : (
              <Box sx={{ py: 1 }}>
                <Typography variant="body2" sx={{ color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  ⚠️ Location unavailable
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  GPS coordinates were not available from vehicle sensors at the time this alert was generated.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
        <Box>
          {!alert.acknowledged && onAcknowledge && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={() => {
                onAcknowledge(alert._id);
                onClose();
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              ✓ Acknowledge
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} color="inherit" size="small" sx={{ textTransform: 'none' }}>
            Close
          </Button>

          {/* Requirement 2, 3, 8: View on Map Button */}
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={!hasValidLocation}
            onClick={() => {
              onClose();
              if (onViewOnMap) onViewOnMap(alert);
            }}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              px: 2,
              background: hasValidLocation ? '#059669' : undefined,
              '&:hover': { background: hasValidLocation ? '#047857' : undefined }
            }}
          >
            {hasValidLocation ? '📍 View on Map' : 'Location Unavailable'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
