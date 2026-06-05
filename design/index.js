import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Report Core Web Vitals (CLS, FCP, INP, LCP, TTFB) to the backend.
// Uses navigator.sendBeacon so reports survive page unload.
function reportVital(metric) {
  try {
    const body = JSON.stringify({
      name:    metric.name,
      value:   metric.value,
      rating:  metric.rating,
      id:      metric.id,
      navType: metric.navigationType,
    });
    const url = `${API}/metrics/web-vitals`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }
  } catch {
    /* never block the app on metrics */
  }
}

onCLS(reportVital);
onFCP(reportVital);
onINP(reportVital);
onLCP(reportVital);
onTTFB(reportVital);
