// Position each kind in its own stack. Rotating around two axes keeps depth visible
// even for stacks containing a single node. Rendering follows user input only.
export function graphCanvas(canvas, select) {
  const ctx = canvas.getContext("2d");
  let graph,
    selected,
    projected = [],
    angle = -0.31,
    tilt = -0.23,
    pointer;
  const style = getComputedStyle(canvas);
  const palette = [0, 1, 2, 3].map((i) =>
    style.getPropertyValue("--tone-" + i).trim(),
  );
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
    function project(x, y, z) {
      const rx = x * Math.cos(angle) + z * Math.sin(angle);
      const rz = z * Math.cos(angle) - x * Math.sin(angle);
      const depth = rz * Math.cos(tilt) + y * Math.sin(tilt);
      const scale = 2.9 / (2.9 - depth);
      return {
        depth,
        x: w * (0.5 + rx * scale * 0.46),
        y:
          h *
          (0.46 + (y * Math.cos(tilt) - rz * Math.sin(tilt)) * scale * 0.51),
      };
    }
    // A ground plane shares the nodes' projection so a camera tilt has a visible reference.
    function floorLine(ax, az, bx, bz) {
      const a = project(ax, 0.76, az),
        b = project(bx, 0.76, bz);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.beginPath();
    for (let step = -4; step <= 4; step++)
      floorLine(step * 0.19, -0.38, step * 0.19, 0.38);
    for (let step = -2; step <= 2; step++)
      floorLine(-0.76, step * 0.19, 0.76, step * 0.19);
    ctx.strokeStyle = "rgba(157,203,181,.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    groups.forEach((nodes, column) => {
      nodes.forEach((node, row) => {
        const x =
          groups.length > 1 ? (column / (groups.length - 1) - 0.5) * 1.55 : 0;
        const y =
          nodes.length > 1 ? (row / (nodes.length - 1) - 0.5) * 1.35 : 0;
        const z = 0.3 * Math.cos(column * 1.8 + row * 1.4);
        points.set(node.id, {
          node,
          color: palette[column % palette.length],
          ...project(x, y, z),
        });
      });
    });
    const related = new Set([selected]);
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
      if (active) {
        related.add(edge.from);
        related.add(edge.to);
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy);
        if (length > 45) {
          const tx = dx / length,
            ty = dy / length;
          const px = b.x - tx * 17,
            py = b.y - ty * 17;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - tx * 8 + ty * 3.5, py - ty * 8 - tx * 3.5);
          ctx.lineTo(px - tx * 8 - ty * 3.5, py - ty * 8 + tx * 3.5);
          ctx.closePath();
          ctx.fillStyle = "#cce6bc";
          ctx.fill();
        }
      }
    }
    projected = [...points.values()].sort((a, b) => a.depth - b.depth);
    for (const point of projected) {
      const active = point.node.id === selected;
      ctx.beginPath();
      ctx.arc(point.x, point.y, active ? 8 : 5, 0, Math.PI * 2);
      ctx.globalAlpha = related.has(point.node.id) ? 1 : 0.68;
      ctx.fillStyle = point.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (active) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Keep the selected label first when a rotation puts several records in
    // the same part of the drawing. The index always retains every name.
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    const occupied = [];
    const labels = [
      points.get(selected),
      ...projected.filter(
        (p) => p.node.id !== selected && related.has(p.node.id),
      ),
      ...projected.filter((p) => !related.has(p.node.id)),
    ];
    for (const point of labels) {
      const compact = w < 510;
      const node = point.node;
      if (
        compact &&
        graph.nodes.length > 9 &&
        node.kind === "Evidence" &&
        !related.has(node.id)
      )
        continue;
      let label = node.name;
      if (graph.id === "architecture" && compact)
        label = node.id[0].toUpperCase() + node.id.slice(1);
      if (
        graph.id !== "architecture" &&
        (node.kind === "Investigation" || node.kind === "Decision")
      ) {
        label = compact
          ? node.kind
          : node.kind === "Decision"
            ? "Decision"
            : node.name;
      }
      ctx.font = (node.id === selected ? "bold " : "") + "13px system-ui";
      const width = ctx.measureText(label).width;
      const x = Math.min(w - width / 2 - 3, Math.max(width / 2 + 3, point.x));
      const left = x - width / 2,
        right = x + width / 2;
      for (const y of [point.y + 22, point.y - 15]) {
        if (y < 13 || y > h - 2) continue;
        if (
          occupied.some(
            (box) =>
              Math.abs(box.y - y) < 15 &&
              left < box.right + 4 &&
              right > box.left - 4,
          )
        )
          continue;
        occupied.push({ left, right, y });
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#183e33";
        ctx.strokeText(label, x, y);
        ctx.fillStyle = related.has(node.id) ? "#f3faef" : "#b2c9bc";
        ctx.fillText(label, x, y);
        break;
      }
    }
  }
  function rotate(yaw, pitch = 0) {
    angle += yaw;
    tilt = Math.max(-0.8, Math.min(0.8, tilt + pitch));
    draw();
  }
  const reset = () => {
    angle = -0.31;
    tilt = -0.23;
    draw();
  };
  new ResizeObserver(draw).observe(canvas);
  // Prevent a horizontal orbit from starting browser momentum that consumes
  // the next control tap. Vertical scrolling and pinch gestures stay native.
  let touchOrigin;
  canvas.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      touchOrigin = touch && { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (!touchOrigin || event.touches.length !== 1 || !event.cancelable)
        return;
      const touch = event.touches[0];
      const horizontal = Math.abs(touch.clientX - touchOrigin.x);
      if (
        horizontal > 5 &&
        horizontal > Math.abs(touch.clientY - touchOrigin.y)
      )
        event.preventDefault();
    },
    { passive: false },
  );

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
