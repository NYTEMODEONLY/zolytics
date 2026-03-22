import { useState, useEffect, useCallback } from 'react';

const PERIODS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
];

const COLORS = {
  bg: '#0a0a0a',
  surface: '#111111',
  border: '#1f1f1f',
  accent: '#7c3aed',
  accentLight: '#a78bfa',
  text: '#e5e7eb',
  muted: '#6b7280',
  green: '#10b981',
  bar: '#5b21b6',
};

function useAnalytics(period) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/analytics/query?period=' + period)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: '1px solid ' + COLORS.border,
      borderRadius: 10,
      padding: '20px 24px',
      minWidth: 0,
    }}>
      <div style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function BarChart({ daily }) {
  if (!daily || daily.length === 0) {
    return (
      <div style={{ color: COLORS.muted, textAlign: 'center', padding: 40, fontSize: 14 }}>
        No data for this period
      </div>
    );
  }

  const max = Math.max(...daily.map(d => d.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, padding: '0 4px' }}>
      {daily.map((d, i) => {
        const pct = (d.count / max) * 100;
        const short = d.date ? d.date.slice(5) : '';
        const showLabel = daily.length <= 14 || i % Math.ceil(daily.length / 10) === 0;
        return (
          <div key={d.date || i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div style={{
              width: '100%',
              height: pct + '%',
              minHeight: d.count > 0 ? 2 : 0,
              background: COLORS.bar,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.3s ease',
              cursor: 'default',
            }} title={d.date + ': ' + d.count + ' views'} />
            {showLabel && (
              <div style={{ color: COLORS.muted, fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {short}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TopList({ items, keyField, label }) {
  if (!items || items.length === 0) {
    return <div style={{ color: COLORS.muted, fontSize: 13, padding: '16px 0' }}>No data</div>;
  }
  const max = Math.max(...items.map(x => x.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const pct = (item.count / max) * 100;
        const key = item[keyField] || 'unknown';
        const displayKey = key.length > 40 ? key.slice(0, 38) + '…' : key;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: COLORS.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                {displayKey}
              </span>
              <span style={{ color: COLORS.accentLight, fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {item.count.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 3, background: COLORS.border, borderRadius: 2 }}>
              <div style={{ height: '100%', width: pct + '%', background: COLORS.bar, borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeviceChart({ devices }) {
  if (!devices || devices.length === 0) return null;
  const total = devices.reduce((s, d) => s + d.count, 0) || 1;
  const deviceColors = { mobile: '#7c3aed', tablet: '#2563eb', desktop: '#10b981' };
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {devices.map((d, i) => {
        const pct = Math.round((d.count / total) * 100);
        const color = deviceColors[d.device] || COLORS.accentLight;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ color: COLORS.text, fontSize: 13 }}>
              {d.device} <span style={{ color: COLORS.muted }}>({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState('30d');
  const { data, loading, error, reload } = useAnalytics(period);

  useEffect(() => {
    document.title = 'Zolytics';
  }, []);

  const containerStyle = {
    background: COLORS.bg,
    minHeight: '100vh',
    color: COLORS.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 14,
  };

  const innerStyle = {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 16px',
  };

  const sectionStyle = {
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 16,
    marginBottom: 20,
  };

  const twoColStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
    marginBottom: 20,
  };

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: COLORS.text }}>
              <span style={{ color: COLORS.accentLight }}>Zo</span> Analytics
            </h1>
            <p style={{ margin: '4px 0 0', color: COLORS.muted, fontSize: 13 }}>
              Privacy-first · No cookies · Self-hosted
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  background: period === p.value ? COLORS.accent : 'transparent',
                  color: period === p.value ? '#fff' : COLORS.muted,
                  border: '1px solid ' + (period === p.value ? COLORS.accent : COLORS.border),
                  borderRadius: 6,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: period === p.value ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={reload}
              style={{
                background: 'transparent',
                color: COLORS.muted,
                border: '1px solid ' + COLORS.border,
                borderRadius: 6,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 13,
              }}
              title="Refresh"
            >↻</button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{ background: '#1f0000', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#fca5a5', fontSize: 13 }}>
            Failed to load analytics: {error}
          </div>
        )}

        {/* Stats */}
        {loading ? (
          <div style={{ ...gridStyle }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: COLORS.surface, border: '1px solid ' + COLORS.border, borderRadius: 10, padding: '20px 24px', height: 80 }} />
            ))}
          </div>
        ) : data ? (
          <div style={gridStyle}>
            <StatCard label={'Total Views (' + period + ')'} value={(data.total || 0).toLocaleString()} />
            <StatCard label="Views (last 24h)" value={(data.todayTotal || 0).toLocaleString()} />
            <StatCard label="Top Pages" value={(data.topPages?.length || 0).toLocaleString()} sub={'unique paths'} />
          </div>
        ) : null}

        {/* Daily chart */}
        {data && (
          <div style={sectionStyle}>
            <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: COLORS.text }}>
              Page Views — {period}
            </h2>
            <BarChart daily={data.daily} />
          </div>
        )}

        {/* Top pages + referrers */}
        {data && (
          <div style={twoColStyle}>
            <div style={sectionStyle}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: COLORS.text }}>Top Pages</h2>
              <TopList items={data.topPages} keyField="path" label="path" />
            </div>
            <div style={sectionStyle}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: COLORS.text }}>Referrers</h2>
              <TopList items={data.referrers} keyField="referrer" label="referrer" />
            </div>
          </div>
        )}

        {/* Devices */}
        {data && data.devices && data.devices.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: COLORS.text }}>Devices</h2>
            <DeviceChart devices={data.devices} />
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', color: COLORS.muted, fontSize: 12, marginTop: 32 }}>
          Zolytics · Privacy-first web analytics for Zo Computers ·{' '}
          <a href="https://github.com/NYTEMODEONLY/zolytics" style={{ color: COLORS.accentLight, textDecoration: 'none' }}>
            GitHub
          </a>
        </div>
      </div>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 640px) {
          h1 { font-size: 18px !important; }
          button { padding: 5px 10px !important; font-size: 12px !important; }
        }
        @media (max-width: 480px) {
          div[style*="maxWidth: 960"] { padding: 16px 12px !important; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
