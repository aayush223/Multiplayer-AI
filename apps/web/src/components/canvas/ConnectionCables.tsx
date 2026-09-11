import React from 'react';
import { CanvasNodeData, CanvasEdgeData } from '../../hooks/useCrdtSync';

interface ConnectionCablesProps {
  edges: CanvasEdgeData[];
  nodes: CanvasNodeData[];
  zoom: number;
}

export const ConnectionCables: React.FC<ConnectionCablesProps> = ({ edges, nodes }) => {
  const nodeMap = new Map<string, CanvasNodeData>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 5,
      }}
    >
      {edges.map((edge) => {
        const from = nodeMap.get(edge.fromNodeId);
        const to = nodeMap.get(edge.toNodeId);
        if (!from || !to) return null;

        // Calculate port coordinates
        const fromWidth = from.width || 360;
        const fromHeight = from.height || 220;
        const toHeight = to.height || 220;

        const x1 = from.x + fromWidth;
        const y1 = from.y + fromHeight / 2;
        const x2 = to.x;
        const y2 = to.y + toHeight / 2;

        const dx = Math.abs(x2 - x1) * 0.55;
        const cx1 = x1 + Math.max(dx, 60);
        const cy1 = y1;
        const cx2 = x2 - Math.max(dx, 60);
        const cy2 = y2;

        const pathData = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

        const isPromptFlow = from.type === 'prompt' || to.type === 'output';
        const strokeColor = isPromptFlow ? '#0284c7' : '#16a34a';

        return (
          <g key={edge.id}>
            {/* Background subtle cable line */}
            <path
              d={pathData}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={5}
              strokeLinecap="round"
            />
            {/* Core Solid Cable */}
            <path
              d={pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
              strokeLinecap="round"
              className={edge.isActive ? 'cable-flowing' : ''}
            />
            {/* Origin & Destination Port Dots */}
            <circle cx={x1} cy={y1} r={4} fill="#0284c7" />
            <circle cx={x2} cy={y2} r={4} fill={isPromptFlow ? '#7c3aed' : '#16a34a'} />
          </g>
        );
      })}
    </svg>
  );
};
