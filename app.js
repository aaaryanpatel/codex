const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const state = {
  tool: 'select',
  elements: [],
  selectedId: null,
  draft: null,
  history: [],
  redo: [],
  dragging: null,
};

const strokeColorInput = document.getElementById('strokeColor');
const fillColorInput = document.getElementById('fillColor');
const strokeWidthInput = document.getElementById('strokeWidth');

const toolButtons = [...document.querySelectorAll('[data-tool]')];
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');

function cloneElements(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushHistory() {
  state.history.push(cloneElements(state.elements));
  if (state.history.length > 100) {
    state.history.shift();
  }
  state.redo = [];
}

function fromCanvasEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function drawElement(element, temporary = false) {
  ctx.save();
  ctx.strokeStyle = element.stroke;
  ctx.fillStyle = element.fill;
  ctx.lineWidth = element.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (element.type === 'freehand') {
    const pts = element.points;
    if (!pts?.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }

  if (element.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(element.x1, element.y1);
    ctx.lineTo(element.x2, element.y2);
    ctx.stroke();
  }

  if (element.type === 'rectangle') {
    const x = Math.min(element.x1, element.x2);
    const y = Math.min(element.y1, element.y2);
    const w = Math.abs(element.x2 - element.x1);
    const h = Math.abs(element.y2 - element.y1);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
  }

  if (element.type === 'ellipse') {
    const cx = (element.x1 + element.x2) / 2;
    const cy = (element.y1 + element.y2) / 2;
    const rx = Math.abs(element.x2 - element.x1) / 2;
    const ry = Math.abs(element.y2 - element.y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (element.type === 'text') {
    ctx.font = `${Math.max(14, element.width * 7)}px sans-serif`;
    ctx.fillStyle = element.stroke;
    ctx.fillText(element.text, element.x1, element.y1);
  }

  if (!temporary && state.selectedId === element.id) {
    const box = getBounds(element);
    if (box) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    }
  }

  ctx.restore();
}

function getBounds(element) {
  if (element.type === 'freehand') {
    const xs = element.points.map((p) => p.x);
    const ys = element.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (element.type === 'text') {
    const size = Math.max(14, element.width * 7);
    const width = ctx.measureText(element.text).width;
    return { x: element.x1, y: element.y1 - size, w: width, h: size + 4 };
  }
  return {
    x: Math.min(element.x1, element.x2),
    y: Math.min(element.y1, element.y2),
    w: Math.abs(element.x2 - element.x1),
    h: Math.abs(element.y2 - element.y1),
  };
}

function hitTest(x, y) {
  for (let i = state.elements.length - 1; i >= 0; i -= 1) {
    const box = getBounds(state.elements[i]);
    if (!box) continue;
    if (x >= box.x - 6 && x <= box.x + box.w + 6 && y >= box.y - 6 && y <= box.y + box.h + 6) {
      return state.elements[i];
    }
  }
  return null;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.elements.forEach((item) => drawElement(item));
  if (state.draft) {
    drawElement(state.draft, true);
  }
}

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
}

function addElement(element) {
  pushHistory();
  state.elements.push(element);
  draw();
}

canvas.addEventListener('pointerdown', (event) => {
  const p = fromCanvasEvent(event);
  const color = strokeColorInput.value;
  const fill = fillColorInput.value;
  const width = Number(strokeWidthInput.value);

  if (state.tool === 'select') {
    const found = hitTest(p.x, p.y);
    state.selectedId = found?.id ?? null;
    if (found) {
      state.dragging = {
        id: found.id,
        startX: p.x,
        startY: p.y,
      };
    }
    draw();
    return;
  }

  if (state.tool === 'text') {
    const text = window.prompt('Enter text');
    if (!text) return;
    addElement({ id: crypto.randomUUID(), type: 'text', x1: p.x, y1: p.y, text, stroke: color, fill, width });
    return;
  }

  state.draft = {
    id: crypto.randomUUID(),
    type: state.tool,
    x1: p.x,
    y1: p.y,
    x2: p.x,
    y2: p.y,
    points: [{ x: p.x, y: p.y }],
    stroke: color,
    fill,
    width,
  };
  draw();
});

canvas.addEventListener('pointermove', (event) => {
  const p = fromCanvasEvent(event);

  if (state.dragging) {
    const selected = state.elements.find((item) => item.id === state.dragging.id);
    if (!selected) return;
    const dx = p.x - state.dragging.startX;
    const dy = p.y - state.dragging.startY;

    state.dragging.startX = p.x;
    state.dragging.startY = p.y;

    if (selected.type === 'freehand') {
      selected.points = selected.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    } else if (selected.type === 'text') {
      selected.x1 += dx;
      selected.y1 += dy;
    } else {
      selected.x1 += dx;
      selected.y1 += dy;
      selected.x2 += dx;
      selected.y2 += dy;
    }
    draw();
    return;
  }

  if (!state.draft) return;
  state.draft.x2 = p.x;
  state.draft.y2 = p.y;
  if (state.draft.type === 'freehand') {
    state.draft.points.push({ x: p.x, y: p.y });
  }
  draw();
});

canvas.addEventListener('pointerup', () => {
  if (state.dragging) {
    pushHistory();
    state.dragging = null;
    return;
  }

  if (!state.draft) return;

  const draft = state.draft;
  state.draft = null;
  addElement(draft);
});

undoBtn.addEventListener('click', () => {
  const previous = state.history.pop();
  if (!previous) return;
  state.redo.push(cloneElements(state.elements));
  state.elements = previous;
  state.selectedId = null;
  draw();
});

redoBtn.addEventListener('click', () => {
  const next = state.redo.pop();
  if (!next) return;
  state.history.push(cloneElements(state.elements));
  state.elements = next;
  state.selectedId = null;
  draw();
});

clearBtn.addEventListener('click', () => {
  if (!state.elements.length) return;
  pushHistory();
  state.elements = [];
  state.selectedId = null;
  draw();
});

exportBtn.addEventListener('click', () => {
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'sketchlite.png';
  link.href = url;
  link.click();
});

toolButtons.forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

setTool('select');
draw();
