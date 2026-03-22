import { useEffect, useState } from 'react';

const PERIODS = [
  { label: '7d', value: '7d', description: 'Last 7 days' },
  { label: '30d', value: '30d', description: 'Last 30 days' },
  { label: '90d', value: '90d', description: 'Last 90 days' },
];

const META = {
  title: 'Zolytics Dashboard',
  description: 'Private analytics dashboard for Zo Space routes.',
  url: 'https://nytemode.zo.space/analytics',
  color: '#0c0c0e',
};

function getToken() {
  const match = document.cookie.match(/zolytics_token=([^;]+)/);
  return match ? match[1] : null;
}

function setToken(token) {
  document.cookie = 'zolytics_token=' + token + '; path=/; max-age=31536000; SameSite=Strict';
}

function clearToken() {
  document.cookie = 'zolytics_token=; path=/; max-age=0; SameSite=Strict';
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function useAnalytics(period) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const token = getToken();
      const tokenParam = token ? '&token=' + encodeURIComponent(token) : '';
      const response = await fetch('/api/analytics/query?period=' + period + tokenParam);

      if (response.status === 401) {
        throw new Error('unauthorized');
      }

      const payload = await response.json();
      setData(payload);
      setLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [period]);

  return { data, loading, error, reload: loadData };
}

function LoginGate({ onAuth }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setChecking(true);
    setError(false);

    try {
      const response = await fetch('/api/analytics/query?period=7d&token=' + encodeURIComponent(input.trim()));
      if (response.status === 401) {
        setError(true);
        setChecking(false);
        return;
      }

      setToken(input.trim());
      onAuth(input.trim());
    } catch {
      setError(true);
      setChecking(false);
    }
  }

  return (
    <div className="zolytics-root">
      <style>{dashboardStyles}</style>
      <div className="zolytics-grain" />
      <div className="zolytics-auth-shell">
        <form onSubmit={handleSubmit} className="zolytics-auth-card zolytics-card">
          <div className="zolytics-eyebrow">private route</div>
          <h1>Zolytics</h1>
          <p>Privacy-first traffic telemetry for Zo Computer routes. Authenticate with the owner token to continue.</p>
          <label className="zolytics-label" htmlFor="zolytics-token">Access token</label>
          <input
            id="zolytics-token"
            type="password"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Enter token"
            className="zolytics-input"
            autoFocus
          />
          {error ? <div className="zolytics-error">Invalid token</div> : null}
          <button type="submit" disabled={checking || !input.trim()} className="zolytics-button">
            {checking ? 'Checking…' : 'Open dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext }) {
  return (
    <section className="zolytics-card zolytics-stat-card">
      <div className="zolytics-card-label">{label}</div>
      <div className="zolytics-stat-value">{value}</div>
      {subtext ? <p className="zolytics-card-subtext">{subtext}</p> : null}
    </section>
  );
}

function LoadingCard({ height = 112 }) {
  return <div className="zolytics-card zolytics-loading-card" style={{ height }} />;
}

function EmptyState({ message }) {
  return <div className="zolytics-empty">{message}</div>;
}

function BarChart({ daily }) {
  if (!daily || daily.length === 0) {
    return <EmptyState message="No page view data for this period." />;
  }

  const max = Math.max(...daily.map(item => item.count), 1);

  return (
    <div className="zolytics-chart-wrap">
      <div className="zolytics-chart">
        {daily.map((item, index) => {
          const height = Math.max((item.count / max) * 100, item.count > 0 ? 4 : 0);
          const showLabel = daily.length <= 14 || index % Math.ceil(daily.length / 8) === 0 || index === daily.length - 1;
          return (
            <div key={item.date || index} className="zolytics-chart-column">
              <div className="zolytics-chart-bar-shell" title={item.date + ': ' + item.count + ' views'}>
                <div className="zolytics-chart-bar" style={{ height: height + '%' }} />
              </div>
              <div className="zolytics-chart-value">{formatNumber(item.count)}</div>
              <div className="zolytics-chart-label">{showLabel ? item.date.slice(5) : '·'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopList({ items, keyField, emptyMessage, getHref }) {
  if (!items || items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const max = Math.max(...items.map(item => item.count), 1);

  return (
    <div className="zolytics-list">
      {items.map((item, index) => {
        const key = item[keyField] || 'Unknown';
        const width = Math.max((item.count / max) * 100, 4);
        const href = getHref ? getHref(item) : null;
        const labelNode = href ? (
          <a className="zolytics-list-link" href={href}>{key}</a>
        ) : (
          <span className="zolytics-list-key">{key}</span>
        );
        return (
          <div key={index} className="zolytics-list-row">
            <div className="zolytics-list-meta">
              {labelNode}
              <strong>{formatNumber(item.count)}</strong>
            </div>
            <div className="zolytics-list-bar-shell">
              <div className="zolytics-list-bar" style={{ width: width + '%' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeviceBreakdown({ devices }) {
  if (!devices || devices.length === 0) {
    return <EmptyState message="No device data for this period." />;
  }

  const total = devices.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div className="zolytics-device-grid">
      {devices.map((item, index) => {
        const percentage = Math.round((item.count / total) * 100);
        return (
          <div key={index} className="zolytics-card zolytics-device-card">
            <div className="zolytics-card-label">{item.device || 'unknown'}</div>
            <div className="zolytics-device-value">{percentage}%</div>
            <p className="zolytics-card-subtext">{formatNumber(item.count)} visits</p>
          </div>
        );
      })}
    </div>
  );
}

function DashboardInner() {
  const [period, setPeriod] = useState('30d');
  const { data, loading, error, reload } = useAnalytics(period);
  const selectedPeriod = PERIODS.find(option => option.value === period) || PERIODS[1];

  function handleLogout() {
    clearToken();
    window.location.reload();
  }

  useEffect(() => {
    document.title = META.title;
    document.documentElement.style.background = META.color;
    document.body.style.background = META.color;

    let fontLink = document.querySelector('link[data-zolytics-fonts]');
    if (!fontLink) {
      fontLink = document.createElement('link');
      fontLink.setAttribute('data-zolytics-fonts', 'true');
      fontLink.setAttribute('rel', 'stylesheet');
      fontLink.setAttribute(
        'href',
        'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
      );
      document.head.appendChild(fontLink);
    }

    const tags = [
      ['description', META.description],
      ['og:title', META.title],
      ['og:description', META.description],
      ['og:url', META.url],
      ['og:type', 'website'],
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', META.title],
      ['twitter:description', META.description],
      ['theme-color', META.color],
    ];

    document.querySelectorAll('meta[data-zolytics-meta]').forEach(node => node.remove());
    tags.forEach(([key, value]) => {
      const tag = document.createElement('meta');
      tag.setAttribute('data-zolytics-meta', 'true');
      if (key.startsWith('og:') || key.startsWith('twitter:')) {
        tag.setAttribute('property', key);
      } else {
        tag.setAttribute('name', key);
      }
      tag.setAttribute('content', value);
      document.head.appendChild(tag);
    });
  }, []);

  return (
    <div className="zolytics-root">
      <style>{dashboardStyles}</style>
      <div className="zolytics-grain" />
      <div className="zolytics-shell">
        <header className="zolytics-hero">
          <div className="zolytics-hero-copy zolytics-card">
            <div className="zolytics-eyebrow">// zolytics</div>
            <h1>Zolytics Dashboard</h1>
            <p>
              Private, self-hosted web analytics for Zo Space. No cookies. No third-party scripts. Just a clean
              view of traffic moving through the machine.
            </p>
            <div className="zolytics-badge-row">
              <span className="zolytics-badge">Route: /analytics</span>
              <span className="zolytics-badge">API: /api/analytics/query</span>
              <span className="zolytics-badge">Scope: {selectedPeriod.description}</span>
            </div>
          </div>
          <div className="zolytics-hero-side zolytics-card">
            <div className="zolytics-card-label">Time range</div>
            <div className="zolytics-toggle-row">
              {PERIODS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={'zolytics-toggle' + (option.value === period ? ' is-active' : '')}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="zolytics-hero-actions">
              <button type="button" className="zolytics-secondary-button" onClick={reload}>
                Refresh
              </button>
              <button type="button" className="zolytics-secondary-button" onClick={handleLogout}>
                Logout
              </button>
            </div>
            <p className="zolytics-card-subtext">Authenticated via owner token cookie. This route is intended to remain private.</p>
          </div>
        </header>

        {error ? (
          <div className="zolytics-error-banner">
            {error === 'unauthorized' ? 'Session expired. Reload and re-enter the access token.' : 'Failed to load analytics.'}
          </div>
        ) : null}

        {loading ? (
          <div className="zolytics-stat-grid">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : data ? (
          <div className="zolytics-stat-grid">
            <StatCard label={'Views · ' + period} value={formatNumber(data.total)} subtext="Total tracked page views in the selected range" />
            <StatCard label="Last 24 hours" value={formatNumber(data.todayTotal)} subtext="Recent movement through the route set" />
            <StatCard label="Active pages" value={formatNumber(data.topPages?.length || 0)} subtext="Unique high-traffic paths in the response" />
          </div>
        ) : null}

        <div className="zolytics-main-grid">
          <section className="zolytics-card zolytics-panel zolytics-panel-wide">
            <div className="zolytics-panel-head">
              <div>
                <div className="zolytics-card-label">Traffic trend</div>
                <h2>Page views over time</h2>
              </div>
            </div>
            {loading ? <LoadingCard height={280} /> : <BarChart daily={data?.daily || []} />}
          </section>

          <section className="zolytics-card zolytics-panel">
            <div className="zolytics-panel-head">
              <div>
                <div className="zolytics-card-label">Pages</div>
                <h2>Top routes</h2>
              </div>
            </div>
            {loading ? <LoadingCard height={260} /> : <TopList items={data?.topPages || []} keyField="path" emptyMessage="No page data for this period." getHref={item => item?.path || null} />}
          </section>

          <section className="zolytics-card zolytics-panel">
            <div className="zolytics-panel-head">
              <div>
                <div className="zolytics-card-label">Referrers</div>
                <h2>Traffic sources</h2>
              </div>
            </div>
            {loading ? <LoadingCard height={260} /> : <TopList items={data?.referrers || []} keyField="referrer" emptyMessage="No referrer data for this period." />}
          </section>

          <section className="zolytics-card zolytics-panel zolytics-panel-wide">
            <div className="zolytics-panel-head">
              <div>
                <div className="zolytics-card-label">Devices</div>
                <h2>Device mix</h2>
              </div>
            </div>
            {loading ? <LoadingCard height={160} /> : <DeviceBreakdown devices={data?.devices || []} />}
          </section>
        </div>

        <footer className="zolytics-footer">
          <a href="https://nytemode.zo.space/zoey">Built by Zoey</a>
          <div className="zolytics-footer-subline">
            <a href="https://nytemode.com">a nytemode project</a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [authed, setAuthed] = useState(() => !!getToken());

  if (!authed) {
    return <LoginGate onAuth={() => setAuthed(true)} />;
  }

  return <DashboardInner />;
}

const dashboardStyles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0c0c0e; color: #e4e4e7; }
  body { overflow-x: hidden; }
  ::selection { background: #c2410c; color: #fff; }

  .zolytics-root {
    min-height: 100vh;
    background: #0c0c0e;
    color: #e4e4e7;
    font-family: 'Outfit', sans-serif;
    position: relative;
    overflow-x: hidden;
  }

  .zolytics-grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.03;
    z-index: 1;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 220px;
  }

  .zolytics-shell,
  .zolytics-auth-shell {
    max-width: 1120px;
    margin: 0 auto;
    padding: 40px 32px 80px;
    position: relative;
    z-index: 2;
  }

  .zolytics-auth-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 24px;
    padding-bottom: 24px;
  }

  .zolytics-card {
    background: rgba(24, 24, 27, 0.82);
    border: 1px solid #27272a;
    border-radius: 18px;
    box-shadow: 0 16px 60px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(10px);
  }

  .zolytics-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
    gap: 24px;
    padding-top: 28px;
    margin-bottom: 24px;
  }

  .zolytics-hero-copy,
  .zolytics-hero-side,
  .zolytics-auth-card,
  .zolytics-panel,
  .zolytics-stat-card {
    padding: 28px;
  }

  .zolytics-eyebrow,
  .zolytics-card-label,
  .zolytics-chart-value,
  .zolytics-chart-label,
  .zolytics-footer,
  .zolytics-badge,
  .zolytics-card-subtext,
  .zolytics-list-meta strong,
  .zolytics-device-value,
  .zolytics-input,
  .zolytics-label,
  .zolytics-button,
  .zolytics-secondary-button,
  .zolytics-toggle {
    font-family: 'JetBrains Mono', monospace;
  }

  .zolytics-eyebrow,
  .zolytics-card-label {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #c2410c;
  }

  .zolytics-hero h1,
  .zolytics-auth-card h1,
  .zolytics-panel h2 {
    font-family: 'Instrument Serif', Georgia, serif;
    font-weight: 400;
    letter-spacing: -0.02em;
    color: #f4f4f5;
    margin: 0;
  }

  .zolytics-hero h1,
  .zolytics-auth-card h1 {
    font-size: clamp(2.8rem, 7vw, 4.6rem);
    line-height: 0.95;
    margin: 18px 0 18px;
  }

  .zolytics-panel h2 {
    font-size: 2rem;
    line-height: 1.05;
    margin-top: 8px;
  }

  .zolytics-hero p,
  .zolytics-auth-card p {
    margin: 0;
    color: #a1a1aa;
    font-size: 1.02rem;
    line-height: 1.7;
    max-width: 58ch;
  }

  .zolytics-badge-row,
  .zolytics-toggle-row,
  .zolytics-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .zolytics-badge,
  .zolytics-toggle,
  .zolytics-secondary-button,
  .zolytics-button {
    border-radius: 999px;
    border: 1px solid #27272a;
    background: rgba(39, 39, 42, 0.6);
    color: #d4d4d8;
    padding: 11px 16px;
    font-size: 0.76rem;
    letter-spacing: 0.03em;
  }

  .zolytics-badge-row {
    margin-top: 26px;
  }

  .zolytics-toggle,
  .zolytics-secondary-button,
  .zolytics-button {
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
  }

  .zolytics-toggle:hover,
  .zolytics-secondary-button:hover,
  .zolytics-button:hover {
    border-color: rgba(212, 165, 116, 0.5);
    color: #d4a574;
  }

  .zolytics-toggle.is-active,
  .zolytics-button {
    background: #c2410c;
    border-color: #c2410c;
    color: #fff;
  }

  .zolytics-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .zolytics-hero-side {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .zolytics-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .zolytics-stat-value,
  .zolytics-device-value {
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1;
    color: #f4f4f5;
    margin-top: 16px;
  }

  .zolytics-card-subtext {
    margin: 12px 0 0;
    color: #52525b;
    font-size: 0.72rem;
    line-height: 1.7;
    letter-spacing: 0.03em;
  }

  .zolytics-main-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }

  .zolytics-panel {
    min-width: 0;
  }

  .zolytics-panel-wide {
    grid-column: span 2;
  }

  .zolytics-panel-head {
    margin-bottom: 20px;
  }

  .zolytics-chart-wrap {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .zolytics-chart {
    min-width: 640px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
    gap: 8px;
    align-items: end;
  }

  .zolytics-chart-column {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .zolytics-chart-bar-shell {
    height: 220px;
    border-radius: 14px;
    background: #111114;
    border: 1px solid rgba(39, 39, 42, 0.8);
    padding: 8px;
    display: flex;
    align-items: flex-end;
  }

  .zolytics-chart-bar {
    width: 100%;
    min-height: 2px;
    border-radius: 10px;
    background: linear-gradient(180deg, #d4a574 0%, #c2410c 100%);
  }

  .zolytics-chart-value {
    font-size: 0.68rem;
    color: #a1a1aa;
  }

  .zolytics-chart-label {
    font-size: 0.64rem;
    color: #52525b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .zolytics-list {
    display: grid;
    gap: 14px;
  }

  .zolytics-list-row {
    display: grid;
    gap: 8px;
  }

  .zolytics-list-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .zolytics-list-key {
    color: #e4e4e7;
    font-size: 0.94rem;
    line-height: 1.5;
    word-break: break-word;
  }

  .zolytics-list-link {
    color: #e4e4e7;
    font-size: 0.94rem;
    line-height: 1.5;
    word-break: break-word;
    text-decoration: none;
    border-bottom: 1px solid rgba(194, 65, 12, 0.22);
  }

  .zolytics-list-link:hover {
    color: #d4a574;
    border-bottom-color: rgba(212, 165, 116, 0.4);
  }

  .zolytics-list-meta strong {
    color: #d4a574;
    font-size: 0.78rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .zolytics-list-bar-shell {
    height: 10px;
    border-radius: 999px;
    background: #111114;
    overflow: hidden;
  }

  .zolytics-list-bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #c2410c 0%, #d4a574 100%);
  }

  .zolytics-device-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .zolytics-device-card {
    padding: 22px;
  }

  .zolytics-empty,
  .zolytics-loading-card {
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: rgba(17, 17, 20, 0.72);
    border: 1px dashed rgba(39, 39, 42, 0.85);
    color: #52525b;
  }

  .zolytics-empty {
    min-height: 180px;
    padding: 24px;
    text-align: center;
    line-height: 1.7;
  }

  .zolytics-loading-card {
    position: relative;
    overflow: hidden;
  }

  .zolytics-loading-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(212, 165, 116, 0.08), transparent);
    transform: translateX(-100%);
    animation: zolyticsShimmer 1.6s infinite;
  }

  .zolytics-auth-card {
    width: min(100%, 460px);
  }

  .zolytics-label {
    display: block;
    margin: 28px 0 12px;
    color: #a1a1aa;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .zolytics-input {
    width: 100%;
    padding: 15px 18px;
    border-radius: 14px;
    border: 1px solid #27272a;
    background: #111114;
    color: #e4e4e7;
    font-size: 0.82rem;
    outline: none;
  }

  .zolytics-input:focus {
    border-color: rgba(194, 65, 12, 0.75);
  }

  .zolytics-error,
  .zolytics-error-banner {
    border: 1px solid rgba(127, 29, 29, 0.72);
    background: rgba(69, 10, 10, 0.5);
    color: #fca5a5;
  }

  .zolytics-error {
    margin: 12px 0 0;
    padding: 12px 14px;
    border-radius: 14px;
    font-size: 0.86rem;
  }

  .zolytics-error-banner {
    padding: 14px 16px;
    border-radius: 16px;
    margin-bottom: 24px;
  }

  .zolytics-footer {
    margin-top: 28px;
    padding: 16px 4px 0;
    color: #52525b;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-align: center;
  }

  .zolytics-footer a {
    color: #a1a1aa;
    text-decoration: none;
    border-bottom: 1px solid #27272a;
  }

  .zolytics-footer a:hover {
    color: #d4a574;
  }

  .zolytics-footer-subline {
    margin-top: 10px;
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
  }

  .zolytics-footer-subline a {
    color: #a78bfa;
    text-decoration: none;
    border-bottom: 1px solid rgba(167, 139, 250, 0.25);
  }

  .zolytics-footer-subline a:hover {
    color: #c4b5fd;
    border-bottom-color: rgba(196, 181, 253, 0.45);
  }

  @keyframes zolyticsShimmer {
    to { transform: translateX(100%); }
  }

  @media (max-width: 1024px) {
    .zolytics-hero,
    .zolytics-main-grid,
    .zolytics-device-grid {
      grid-template-columns: 1fr;
    }

    .zolytics-panel-wide {
      grid-column: span 1;
    }
  }

  @media (max-width: 768px) {
    .zolytics-shell,
    .zolytics-auth-shell {
      padding: 24px 16px 56px;
    }

    .zolytics-stat-grid {
      grid-template-columns: 1fr;
    }

    .zolytics-hero-copy,
    .zolytics-hero-side,
    .zolytics-auth-card,
    .zolytics-panel,
    .zolytics-stat-card {
      padding: 22px;
    }
  }

  @media (max-width: 640px) {
    .zolytics-hero h1,
    .zolytics-auth-card h1 {
      font-size: clamp(2.4rem, 15vw, 3.2rem);
    }

    .zolytics-panel h2 {
      font-size: 1.7rem;
    }

    .zolytics-badge,
    .zolytics-toggle,
    .zolytics-secondary-button,
    .zolytics-button {
      width: 100%;
      justify-content: center;
      text-align: center;
    }

    .zolytics-chart {
      min-width: 560px;
    }
  }

  @media (max-width: 480px) {
    .zolytics-list-meta {
      flex-direction: column;
      align-items: flex-start;
    }

    .zolytics-hero p,
    .zolytics-auth-card p {
      font-size: 1rem;
    }

    .zolytics-input {
      font-size: 16px;
    }
  }

  @media (max-width: 320px) {
    .zolytics-shell,
    .zolytics-auth-shell {
      padding-inline: 12px;
    }

    .zolytics-hero-copy,
    .zolytics-hero-side,
    .zolytics-auth-card,
    .zolytics-panel,
    .zolytics-stat-card {
      padding: 18px;
    }
  }
`;
