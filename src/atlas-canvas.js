// Position each kind in its own stack. Rotating around two axes keeps depth visible
// even for stacks containing a single node. Rendering follows user input only.
export function graphCanvas(canvas, select) {
  const ctx = canvas.getContext("2d");
  let graph,
    selected,
    projected = [],
    angle = -0.16,
    tilt = 0.12,
    pointer;
  const palette = ["#ccedb4", "#eabe73", "#83d2c0", "#b9bcf3"];
  function draw() {
    if (!graph || !ctx) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const dpi = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpi);
    canvas.height = Math.round(h * dpi);
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    const byKind = new Map();
    for (const node of graph.nodes) {
      if (!byKind.has(node.kind)) byKind.set(node.kind, []);
      byKind.get(node.kind).push(node);
    }
    const groups = [...byKind.values()];
    const points = new Map();
    groups.forEach((nodes, column) => {
      nodes.forEach((node, row) => {
        const x =
          groups.length > 1 ? (column / (groups.length - 1) - 0.5) * 1.55 : 0;
        const y =
          nodes.length > 1 ? (row / (nodes.length - 1) - 0.5) * 1.35 : 0;
        const z = 0.18 * Math.cos(column * 1.8 + row * 1.4);
        const rotatedX = x * Math.cos(angle) + z * Math.sin(angle);
        const rotatedZ = z * Math.cos(angle) - x * Math.sin(angle);
        const depth = rotatedZ * Math.cos(tilt) + y * Math.sin(tilt);
        const perspective = 2.9 / (2.9 - depth);
        points.set(node.id, {
          node,
          depth,
          color: palette[column % palette.length],
          x: w * (0.5 + rotatedX * perspective * 0.46),
          y:
            h *
            (0.47 +
              (y * Math.cos(tilt) - rotatedZ * Math.sin(tilt)) *
                perspective *
                0.55),
        });
      });
    });
    for (const edge of graph.edges) {
      const a = points.get(edge.from),
        b = points.get(edge.to);
      const active = edge.from === selected || edge.to === selected;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? "#b2d5ae" : "#558173";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();
    }
    projected = [...points.values()].sort((a, b) => a.depth - b.depth);
    for (const point of projected) {
      const active = point.node.id === selected;
      ctx.beginPath();
      ctx.arc(point.x, point.y, active ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = point.color;
      ctx.fill();
      if (active) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      const label =
        graph.id === "architecture" ? point.node.name : point.node.id;
      const width = ctx.measureText(label).width;
      const labelX = Math.min(
        w - width / 2 - 2,
        Math.max(width / 2 + 2, point.x),
      );
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#183e33";
      ctx.strokeText(label, labelX, point.y + 22);
      ctx.fillStyle = "#ecf5eb";
      ctx.fillText(label, labelX, point.y + 22);
    }
  }
  function rotate(yaw, pitch = 0) {
    angle += yaw;
    tilt = Math.max(-0.8, Math.min(0.8, tilt + pitch));
    draw();
  }
  const reset = () => {
    angle = -0.16;
    tilt = 0.12;
    draw();
  };
  new ResizeObserver(draw).observe(canvas);
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      drag: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x,
      dy = event.clientY - pointer.y;
    if (!pointer.drag && Math.hypot(dx, dy) < 5) return;
    pointer.drag = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    rotate(dx * 0.009, dy * 0.006);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.drag) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      const closest = [...projected]
        .reverse()
        .find((point) => Math.hypot(point.x - x, point.y - y) < 17);
      if (closest) select(closest.node.id);
    }
    pointer = null;
  });
  canvas.addEventListener("pointercancel", () => {
    pointer = null;
  });
  return {
    rotate,
    reset,
    render(nextGraph, id) {
      graph = nextGraph;
      selected = id;
      draw();
    },
  };
}
