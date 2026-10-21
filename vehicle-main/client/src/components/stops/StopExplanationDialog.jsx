import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  Chip
} from '@mui/material';
import { stopApi } from '../../services/api';

const PREDEFINED_REASONS = [
  { value: 'road accident', label: '💥 Road Accident' },
  { value: 'traffic jam', label: '🚦 Traffic Jam / Congestion' },
  { value: 'vehicle breakdown', label: '⚠️ Vehicle Breakdown / Mechanical Issue' },
  { value: 'emergency', label: '🚨 Emergency Situation' },
  { value: 'garbage collection', label: '♻️ Garbage Collection / Bin Emptying' },
  { value: 'fuel refill', label: '⛽ Fuel Refill' },
  { value: 'maintenance', label: '🔧 Vehicle Maintenance' },
  { value: 'other', label: '📋 Other Reason' }
];

export default function StopExplanationDialog({ open, onClose, stop, onSuccess }) {
  const [reason, setReason] = useState(stop?.explanation?.reason || '');
  const [details, setDetails] = useState(stop?.explanation?.details || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!stop) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setError('Please select a reason for the stop.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await stopApi.submitExplanation(stop._id, { reason, details });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit explanation.');
    } finally {
      setLoading(false);
    }
  };

  const durationMins = stop.durationMinutes || Math.round((Date.now() - new Date(stop.startTime).getTime()) / 60000);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <span>🛑</span> Submit Stop Explanation
        </DialogTitle>

        <DialogContent dividers>
          <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Vehicle & Stop Details
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mt: 1 }}>
              <Typography variant="body2"><strong>Vehicle:</strong> {stop.vehicleNumber}</Typography>
              <Typography variant="body2"><strong>Driver:</strong> {stop.driverName}</Typography>
              <Typography variant="body2">
                <strong>Stop Duration:</strong>{' '}
                <Chip
                  size="small"
                  color={durationMins >= 15 ? 'error' : 'warning'}
                  label={`${durationMins} minutes`}
                  sx={{ fontWeight: 600 }}
                />
              </Typography>
              <Typography variant="body2"><strong>Zone:</strong> {stop.cleaningZone || 'Zone 1'}</Typography>
              <Typography variant="body2" sx={{ gridColumn: 'span 2' }}>
                <strong>Started At:</strong> {new Date(stop.startTime).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <FormControl fullWidth required sx={{ mb: 2.5 }}>
            <InputLabel id="stop-reason-label">Reason for Stop</InputLabel>
            <Select
              labelId="stop-reason-label"
              value={reason}
              label="Reason for Stop"
              onChange={(e) => setReason(e.target.value)}
            >
              {PREDEFINED_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Additional Details / Comments"
            placeholder="Provide context (e.g. heavy traffic near bus stand, tire puncture, bin overflowed...)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            helperText="Provide specific context to help the municipal supervisor review and approve your stop."
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={loading} sx={{ fontWeight: 600 }}>
            {loading ? 'Submitting...' : 'Submit Explanation'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
