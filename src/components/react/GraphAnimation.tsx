import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  r: number;
  active?: boolean;
  label: string;
}

interface Edge {
  from: number;
  to: number;
}

const nodes: Node[] = [
  { x: 200, y: 150, r: 10, active: true, label: "Projects" },
  { x: 120, y: 80, r: 7, label: "Ideas" },
  { x: 310, y: 90, r: 8, label: "Research" },
  { x: 80, y: 180, r: 6, label: "Tasks" },
  { x: 160, y: 250, r: 9, label: "Notes" },
  { x: 300, y: 200, r: 7, label: "Reading" },
  { x: 350, y: 130, r: 5, label: "Links" },
  { x: 250, y: 280, r: 6, label: "Archive" },
  { x: 60, y: 260, r: 5, label: "Daily" },
  { x: 370, y: 250, r: 5, label: "Quotes" },
  { x: 140, y: 160, r: 4, label: "" },
  { x: 270, y: 160, r: 4, label: "" },
  { x: 220, y: 220, r: 4, label: "" },
  { x: 100, y: 120, r: 3, label: "" },
  { x: 330, y: 180, r: 3, label: "" },
];

const edges: Edge[] = [
  { from: 0, to: 1 },
  { from: 0, to: 2 },
  { from: 0, to: 4 },
  { from: 0, to: 5 },
  { from: 1, to: 3 },
  { from: 1, to: 10 },
  { from: 2, to: 6 },
  { from: 2, to: 5 },
  { from: 3, to: 8 },
  { from: 4, to: 7 },
  { from: 4, to: 12 },
  { from: 5, to: 9 },
  { from: 5, to: 14 },
  { from: 0, to: 11 },
  { from: 1, to: 13 },
  { from: 10, to: 4 },
  { from: 11, to: 2 },
  { from: 12, to: 8 },
];

export default function GraphAnimation() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Gentle floating animation
    const nodeEls = svg.querySelectorAll<SVGCircleElement>(".graph-node");
    const animations: number[] = [];

    nodeEls.forEach((el, i) => {
      const baseY = parseFloat(el.getAttribute("cy") || "0");
      const speed = 0.0005 + Math.random() * 0.0005;
      const amplitude = 2 + Math.random() * 3;
      const phase = Math.random() * Math.PI * 2;
      let running = true;

      function animate(time: number) {
        if (!running) return;
        const offset = Math.sin(time * speed + phase) * amplitude;
        el.setAttribute("cy", String(baseY + offset));
        animations[i] = requestAnimationFrame(animate);
      }
      animations[i] = requestAnimationFrame(animate);

      // Stash cleanup
      (el as unknown as Record<string, () => void>)._stop = () => {
        running = false;
        cancelAnimationFrame(animations[i]);
      };
    });

    return () => {
      nodeEls.forEach((el) => {
        (el as unknown as Record<string, () => void>)?._stop?.();
      });
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 430 330"
      className="w-full h-auto"
      style={{ maxWidth: 430 }}
    >
      {/* Edges */}
      {edges.map((edge, i) => (
        <line
          key={`e-${i}`}
          x1={nodes[edge.from].x}
          y1={nodes[edge.from].y}
          x2={nodes[edge.to].x}
          y2={nodes[edge.to].y}
          stroke="#3e3e3e"
          strokeWidth={1}
          opacity={0.6}
        />
      ))}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <circle
          key={`n-${i}`}
          className="graph-node"
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={node.active ? "#7f6df2" : "#dcddde"}
          stroke={node.active ? "#7f6df2" : "none"}
          strokeWidth={node.active ? 2 : 0}
          opacity={node.r < 4 ? 0.5 : 0.9}
        />
      ))}

      {/* Labels */}
      {nodes
        .filter((n) => n.label)
        .map((node, i) => (
          <text
            key={`l-${i}`}
            x={node.x + node.r + 4}
            y={node.y + 4}
            fontSize={10}
            fill="#999"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          >
            {node.label}
          </text>
        ))}

      {/* Active node glow */}
      <circle
        cx={nodes[0].x}
        cy={nodes[0].y}
        r={20}
        fill="none"
        stroke="#7f6df2"
        strokeWidth={1}
        opacity={0.2}
      >
        <animate
          attributeName="r"
          values="15;22;15"
          dur="3s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.3;0.1;0.3"
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
