import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Shield, UserCheck, Users } from 'lucide-react';
import { AuthUser, defaultApiClient, OrgRole } from '../../services/apiClient';

interface LoginPageProps {
  onAuthenticated: (session: { token: string; user: AuthUser; projectId: string }) => void;
  onBackToHero: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated, onBackToHero }) => {
  const [directory, setDirectory] = useState<AuthUser[]>([]);
  const [email, setEmail] = useState('alice@minge.ai');
  const [password, setPassword] = useState('minge-demo');
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState<OrgRole>('employee');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void defaultApiClient.getAuthDirectory().then(setDirectory);
  }, []);

  const performLogin = async (input: {
    email: string;
    password?: string;
    name?: string;
    role?: OrgRole;
  }) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await defaultApiClient.login(input);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter a valid work email.');
      return;
    }
    void performLogin({
      email: email.trim(),
      password: password || undefined,
      name: customMode && customName.trim() ? customName.trim() : undefined,
      role: customMode ? customRole : undefined,
    });
  };

  const roleBadgeClass = (role: OrgRole) => {
    if (role === 'admin') return 'adobe-chip-dark';
    if (role === 'manager') return 'adobe-chip-red';
    return 'adobe-chip';
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.3fr)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      {/* Left Architectural Brand & Role Hierarchy Panel (#000000) */}
      <aside
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-tertiary)',
          padding: '40px 36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <button
            onClick={onBackToHero}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.72)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 40,
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Overview</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-secondary)',
                color: 'var(--color-tertiary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              M
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: '-0.03em',
              }}
            >
              Minge Organization Access
            </span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 900,
              lineHeight: '38px',
              letterSpacing: '-0.03em',
              marginBottom: 16,
            }}
          >
            Hierarchy-aware sign in for every team tier.
          </h2>
          <p style={{ fontSize: 14, lineHeight: '22px', color: '#B3B3B3', marginBottom: 32 }}>
            Every session issues a signed JWT scoped to your organization role,
            reporting chain, and project workspace.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-90)',
                border: '1px solid #333333',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
                <Shield size={14} color="#FFFFFF" />
                <span>Admin (VP / Executive)</span>
              </div>
              <p style={{ fontSize: 12, color: '#B3B3B3', marginTop: 4 }}>
                Full organization governance, role promotions, team provisioning, and Main Work authority.
              </p>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-90)',
                border: '1px solid var(--color-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
                <UserCheck size={14} color="var(--color-secondary)" />
                <span>Manager (Maximum Team Freedom)</span>
              </div>
              <p style={{ fontSize: 12, color: '#B3B3B3', marginTop: 4 }}>
                Control employee work, adjust permissions/quotas, reassign reports, edit ticket payloads, and approve changes into Main Work.
              </p>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-90)',
                border: '1px solid #333333',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
                <Users size={14} color="#999999" />
                <span>Employee (Contributor)</span>
              </div>
              <p style={{ fontSize: 12, color: '#B3B3B3', marginTop: 4 }}>
                Build prompts & AI Canvas workflows on branches and raise tickets for manager approval into Main Work.
              </p>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#808080', paddingTop: 24 }}>
          Workspace: proj-alpha-multiplayer · JWT Bearer Auth · PostgreSQL RLS Active
        </div>
      </aside>

      {/* Right Authentication & Quick Role Selector */}
      <main
        style={{
          padding: '44px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              marginBottom: 6,
            }}
          >
            Sign in to Minge
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-primary-70)' }}>
            Sign in with your organization email or pick a pre-configured hierarchy account below to test the Manager ↔ Employee ticket approval workflow.
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 18,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(235, 16, 0, 0.06)',
              border: '1px solid var(--color-secondary)',
              color: 'var(--color-secondary)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* Email / Password Form */}
        <form
          onSubmit={handleFormSubmit}
          className="adobe-card"
          style={{ padding: 24, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Work Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@minge.ai"
                className="adobe-input"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="adobe-input"
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary-70)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={customMode}
                onChange={(e) => setCustomMode(e.target.checked)}
                style={{ accentColor: 'var(--color-secondary)' }}
              />
              Sign in as a new custom member (choose role)
            </label>
          </div>

          {customMode && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Jordan Lee"
                  className="adobe-input"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Organization Role
                </label>
                <select
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value as OrgRole)}
                  className="adobe-input"
                >
                  <option value="employee">Employee (Raises Tickets)</option>
                  <option value="manager">Manager (Controls Team & Approves)</option>
                  <option value="admin">Admin (Full Org Control)</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="adobe-btn-red"
            style={{ width: '100%', height: 42, marginTop: 4 }}
          >
            <KeyRound size={15} />
            <span>{isSubmitting ? 'Authenticating...' : 'Sign In & Issue Workspace JWT'}</span>
            <ArrowRight size={15} />
          </button>
        </form>

        {/* Instant Organization Directory Sign-In */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: 'var(--color-primary-70)',
              marginBottom: 12,
            }}
          >
            QUICK SIGN-IN · ORGANIZATION HIERARCHY DIRECTORY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {directory.map((person) => {
              const manager = directory.find((m) => m.id === person.managerId);
              return (
                <button
                  key={person.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void performLogin({ email: person.email, password: 'minge-demo' })}
                  className="adobe-card-interactive"
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-on-surface)' }}>
                      {person.name}
                    </span>
                    <span className={roleBadgeClass(person.role)} style={{ fontSize: 10, padding: '2px 8px' }}>
                      {person.role.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                    {person.title} · {person.department}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-primary-40)' }}>
                    {manager ? `Reports to ${manager.name}` : 'Top of Hierarchy'} · {person.email}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};
