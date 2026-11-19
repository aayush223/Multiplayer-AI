import React from 'react';
import { PeerCursor } from '../../hooks/useCrdtSync';

interface MultiplayerPresenceProps {
  peers: PeerCursor[];
  zoom: number;
  pan: { x: number; y: number };
}

export const MultiplayerPresence: React.FC<MultiplayerPresenceProps> = ({ peers, zoom, pan }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {peers.map((peer) => {
        // Transform coordinates with canvas zoom and pan
        const screenX = peer.x * zoom + pan.x;
        const screenY = peer.y * zoom + pan.y;

        return (
          <div
            key={peer.id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(0, 0)',
              transition: 'left 0.1s ease-out, top 0.1s ease-out',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            {/* SVG Cursor Pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                transform: 'rotate(-20deg)',
              }}
            >
              <polygon
                points="3 3 3 21 8.5 16.5 13 22 16 20 11.5 14.5 18 14.5 3 3"
                fill={peer.color}
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            </svg>

            {/* Peer Name Tag */}
            <div
              style={{
                marginLeft: 14,
                marginTop: -4,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: peer.color,
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.85)',
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{peer.name}</span>
              {peer.isTyping && (
                <span
                  style={{
                    display: 'inline-block',
                    fontWeight: 900,
                  }}
                >
                  •••
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
