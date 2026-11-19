import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  GitMerge,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Users,
} from 'lucide-react';

interface HeroPageProps {
  onGoToLogin: () => void;
  onQuickDemoLogin: (email: string) => void;
  isLoadingDemo?: boolean;
}

export const HeroPage: React.FC<HeroPageProps> = ({
  onGoToLogin,
  onQuickDemoLogin,
  isLoadingDemo = false,
}) => {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Adobe Clean Black Utility Header (56px) */}
      <header
        style={{
          height: 56,
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-tertiary)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--color-primary-90)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-secondary)',
                color: 'var(--color-tertiary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 16,
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
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '-0.03em',
              }}
            >
              Minge
            </span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 24, height: '100%' }}>
            <a
              href="#capabilities"
              className="adobe-nav-link"
              style={{ textDecoration: 'none' }}
            >
              Platform
            </a>
            <a
              href="#hierarchy"
              className="adobe-nav-link"
              style={{ textDecoration: 'none' }}
            >
              Team Hierarchy
            </a>
            <a
              href="#approval-flow"
              className="adobe-nav-link"
              style={{ textDecoration: 'none' }}
            >
              Ticket Approvals
            </a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onGoToLogin}
            className="adobe-btn-secondary"
            style={{ height: 34, padding: '0 18px', fontSize: 13 }}
          >
            Sign In
          </button>
          <button
            onClick={() => onQuickDemoLogin('alice@minge.ai')}
            disabled={isLoadingDemo}
            className="adobe-btn-red"
            style={{ height: 34, padding: '0 18px', fontSize: 13 }}
          >
            <span>{isLoadingDemo ? 'Launching...' : 'Launch Workspace'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Editorial Hero Section */}
      <section
        style={{
          maxWidth: 1240,
          width: '100%',
          margin: '0 auto',
          padding: '64px 32px 56px 32px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.95fr)',
          gap: 48,
          alignItems: 'center',
        }}
      >
        {/* Left Copy Column */}
        <div>
          <span
            className="adobe-chip"
            style={{
              marginBottom: 20,
              borderColor: 'var(--color-primary)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <Sparkles size={12} color="var(--color-secondary)" />
            <span>Multiplayer AI Workspace · Role-Based Team Governance</span>
          </span>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 52,
              fontWeight: 900,
              lineHeight: '58px',
              letterSpacing: '-0.04em',
              color: 'var(--color-on-surface)',
              marginBottom: 20,
            }}
          >
            Ship team AI work with{' '}
            <span style={{ color: 'var(--color-secondary)' }}>manager-grade</span>{' '}
            control.
          </h1>

          <p
            style={{
              fontSize: 17,
              lineHeight: '26px',
              color: 'var(--color-primary-70)',
              maxWidth: 560,
              marginBottom: 32,
            }}
          >
            Minge unites a real-time Prompt IDE and Spatial AI Canvas with an
            organization-wide role hierarchy. Employees collaborate on safe branches
            and raise approval tickets; managers steer employee work, manage
            permissions, and approve verified changes straight into Main Work.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
            <button
              onClick={onGoToLogin}
              className="adobe-btn-red"
              style={{ height: 44, padding: '0 24px', fontSize: 15 }}
            >
              <span>Sign In to Organization</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => onQuickDemoLogin('alice@minge.ai')}
              disabled={isLoadingDemo}
              className="adobe-btn-dark"
              style={{ height: 44, padding: '0 22px', fontSize: 14 }}
            >
              <span>Try as Manager (Alice)</span>
            </button>
            <button
              onClick={() => onQuickDemoLogin('bob@minge.ai')}
              disabled={isLoadingDemo}
              className="adobe-btn-outline"
              style={{ height: 44, padding: '0 22px', fontSize: 14 }}
            >
              <span>Try as Employee (Bob)</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-primary-70)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={15} color="var(--color-secondary)" /> PostgreSQL RLS Tenant Isolation
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GitMerge size={15} color="var(--color-primary)" /> Append-Only Main Work Lineage
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Lock size={15} color="var(--color-primary)" /> Fenced Yjs CRDT Multiplayer
            </span>
          </div>
        </div>

        {/* Right Interactive Preview Card: Team Hierarchy + Ticket Gate */}
        <div
          id="hierarchy"
          style={{
            backgroundColor: 'var(--color-surface-10)',
            border: '1px solid var(--color-neutral)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--color-primary-70)' }}>
              LIVE TEAM HIERARCHY & APPROVAL GATE
            </span>
            <span className="adobe-chip-dark">Role-Enforced</span>
          </div>

          {/* Tier 1: Executive Admin */}
          <div className="adobe-card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Victoria Vance</div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                  VP of AI Engineering · Full Org Authority
                </div>
              </div>
              <span className="adobe-chip-dark">ADMIN</span>
            </div>
          </div>

          {/* Tier 2: Manager with full freedom */}
          <div
            className="adobe-card"
            style={{
              marginLeft: 24,
              borderLeft: '4px solid var(--color-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Alice Chen</div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                  Engineering Manager · Controls Team, Permissions & Main Work
                </div>
              </div>
              <span className="adobe-chip-red">MANAGER</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="adobe-chip">Approve Tickets</span>
              <span className="adobe-chip">Edit Main Directly</span>
              <span className="adobe-chip">Reassign Reports</span>
            </div>
          </div>

          {/* Tier 3: Employee raising a ticket */}
          <div
            className="adobe-card"
            style={{
              marginLeft: 48,
              borderLeft: '4px solid var(--color-primary-40)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Bob Patel & Carol Lin</div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                  Prompt & Canvas Contributors · Draft & Raise Tickets
                </div>
              </div>
              <span className="adobe-chip">EMPLOYEE</span>
            </div>

            <div
              style={{
                padding: 12,
                backgroundColor: 'var(--color-surface-10)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  Ticket: Merge CoT Reasoning Guardrails
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-primary-70)' }}>
                  exp/chain-of-thought → main · Waiting for Alice Chen
                </div>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                <CheckCircle2 size={13} /> Manager Gate
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Column Platform Capabilities Section */}
      <section
        id="capabilities"
        style={{
          backgroundColor: 'var(--color-surface-10)',
          borderTop: '1px solid var(--color-neutral)',
          borderBottom: '1px solid var(--color-neutral)',
          padding: '56px 32px',
        }}
      >
        <div
          id="approval-flow"
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          <div className="adobe-card" style={{ borderTop: '3px solid var(--color-secondary)', padding: 24 }}>
            <Users size={22} color="var(--color-secondary)" style={{ marginBottom: 14 }} />
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 900,
                marginBottom: 8,
              }}
            >
              Manager-First Team Hierarchy
            </h3>
            <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--color-primary-70)' }}>
              Managers hold complete operational freedom over their reporting tree:
              reassign employees, adjust AI token caps, toggle Main Work privileges,
              pause accounts, and assign work tickets directly.
            </p>
          </div>

          <div className="adobe-card" style={{ borderTop: '3px solid var(--color-primary)', padding: 24 }}>
            <TicketCheck size={22} color="var(--color-primary)" style={{ marginBottom: 14 }} />
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 900,
                marginBottom: 8,
              }}
            >
              Ticket Raise → Main Work Merge
            </h3>
            <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--color-primary-70)' }}>
              Employees draft prompts in the IDE or Spatial Canvas and raise approval
              tickets routed automatically to their manager. Managers can edit payloads,
              request changes, or approve directly into versioned Main Work.
            </p>
          </div>

          <div className="adobe-card" style={{ borderTop: '3px solid var(--color-primary)', padding: 24 }}>
            <Layers size={22} color="var(--color-primary)" style={{ marginBottom: 14 }} />
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 900,
                marginBottom: 8,
              }}
            >
              Zero-Bleed CRDT Architecture
            </h3>
            <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--color-primary-70)' }}>
              Backed by PostgreSQL Row Level Security in private schema{' '}
              <code>minge</code>, append-only version lineage, 30-day soft-delete
              recovery, and Redis-fenced AI peer streaming over Yjs.
            </p>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer
        style={{
          maxWidth: 1240,
          width: '100%',
          margin: '0 auto',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--color-primary-70)',
        }}
      >
        <span>Minge Multiplayer AI Platform · Prompt IDE + AI Canvas + Team Governance</span>
        <span>Schema: minge (RLS Strict) · 30-Day Soft-Delete Recovery · JWT Authenticated</span>
      </footer>
    </div>
  );
};
