const { useRef, useState, useEffect } = React;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function App() {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('select');
  const [stroke, setStroke] = useState('#1f2937');
  const [fill, setFill] = useState('#ffffff');
  const [width, setWidth] = useState(2);
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [redo, setRedo] = useState([]);
  const [dragging, setDragging] = useState(null);

  const drawElement = (ctx, element, temporary = false) => {
    ctx.save();
    ctx.strokeStyle = element.stroke;
    ctx.fillStyle = element.fill;
    ctx.lineWidth = element.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (element.type === 'freehand') {
      ctx.beginPath();
      ctx.moveTo(element.points[0].x, element.points[0].y);
      for (let i = 1; i < element.points.length; i += 1) ctx.lineTo(element.points[i].x, element.points[i].y);
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

    if (!temporary && selectedId === element.id) {
      const box = getBounds(ctx, element);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    }

    ctx.restore();
  };

  const getBounds = (ctx, element) => {
    if (element.type === 'freehand') {
      const xs = element.points.map((p) => p.x);
      const ys = element.points.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    if (element.type === 'text') {
      const size = Math.max(14, element.width * 7);
      ctx.font = `${size}px sans-serif`;
      return { x: element.x1, y: element.y1 - size, w: ctx.measureText(element.text).width, h: size + 4 };
    }
    return { x: Math.min(element.x1, element.x2), y: Math.min(element.y1, element.y2), w: Math.abs(element.x2 - element.x1), h: Math.abs(element.y2 - element.y1) };
  };

  const render = (list = elements, temp = draft) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    list.forEach((e) => drawElement(ctx, e));
    if (temp) drawElement(ctx, temp, true);
  };

  useEffect(() => {
    render(elements, draft);
  }, [elements, draft, selectedId]);

  const pushHistory = (snapshot) => {
    setHistory((prev) => [...prev, clone(snapshot)].slice(-100));
    setRedo([]);
  };

  const getPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitTest = (x, y) => {
    const ctx = canvasRef.current.getContext('2d');
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const box = getBounds(ctx, elements[i]);
      if (x >= box.x - 6 && x <= box.x + box.w + 6 && y >= box.y - 6 && y <= box.y + box.h + 6) return elements[i];
    }
    return null;
  };

  const onPointerDown = (event) => {
    const p = getPoint(event);

    if (tool === 'select') {
      const found = hitTest(p.x, p.y);
      setSelectedId(found?.id ?? null);
      if (found) setDragging({ id: found.id, startX: p.x, startY: p.y });
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Enter text');
      if (!text) return;
      pushHistory(elements);
      setElements((prev) => [...prev, { id: crypto.randomUUID(), type: 'text', x1: p.x, y1: p.y, text, stroke, fill, width }]);
      return;
    }

    setDraft({
      id: crypto.randomUUID(),
      type: tool,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      points: [{ x: p.x, y: p.y }],
      stroke,
      fill,
      width,
    });
  };

  const onPointerMove = (event) => {
    const p = getPoint(event);

    if (dragging) {
      const dx = p.x - dragging.startX;
      const dy = p.y - dragging.startY;
      setDragging({ ...dragging, startX: p.x, startY: p.y });
      setElements((prev) =>
        prev.map((element) => {
          if (element.id !== dragging.id) return element;
          if (element.type === 'freehand') return { ...element, points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
          if (element.type === 'text') return { ...element, x1: element.x1 + dx, y1: element.y1 + dy };
          return { ...element, x1: element.x1 + dx, y1: element.y1 + dy, x2: element.x2 + dx, y2: element.y2 + dy };
        }),
      );
      return;
    }

    if (!draft) return;
    setDraft((prev) => ({ ...prev, x2: p.x, y2: p.y, points: prev.type === 'freehand' ? [...prev.points, { x: p.x, y: p.y }] : prev.points }));
  };

  const onPointerUp = () => {
    if (dragging) {
      pushHistory(elements);
      setDragging(null);
      return;
    }

    if (!draft) return;
    pushHistory(elements);
    setElements((prev) => [...prev, draft]);
    setDraft(null);
  };

  return (
    <>
      <header className="topbar">
        <h1>SketchLite</h1>
        <p>Excalidraw-style MVP · React edition</p>
      </header>
      <main>
        <section className="toolbar">
          <div className="tool-group" role="group" aria-label="Drawing tools">
            {['select', 'freehand', 'line', 'rectangle', 'ellipse', 'text'].map((entry) => (
              <button key={entry} className={tool === entry ? 'active' : ''} onClick={() => setTool(entry)}>
                {entry[0].toUpperCase() + entry.slice(1)}
              </button>
            ))}
          </div>

          <label>Stroke<input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} /></label>
          <label>Fill<input type="color" value={fill} onChange={(e) => setFill(e.target.value)} /></label>
          <label>Width<input type="range" min="1" max="10" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>

          <div className="tool-group">
            <button onClick={() => { const prev = history[history.length - 1]; if (!prev) return; setHistory((h) => h.slice(0, -1)); setRedo((r) => [...r, clone(elements)]); setElements(prev); setSelectedId(null); }}>Undo</button>
            <button onClick={() => { const next = redo[redo.length - 1]; if (!next) return; setRedo((r) => r.slice(0, -1)); setHistory((h) => [...h, clone(elements)]); setElements(next); setSelectedId(null); }}>Redo</button>
            <button onClick={() => { if (!elements.length) return; pushHistory(elements); setElements([]); setSelectedId(null); }}>Clear</button>
            <button onClick={() => { const link = document.createElement('a'); link.download = 'sketchlite-react.png'; link.href = canvasRef.current.toDataURL('image/png'); link.click(); }}>Export PNG</button>
          </div>
        </section>

        <section className="canvas-wrap">
          <canvas
            id="board"
            ref={canvasRef}
            width={1200}
            height={700}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </section>
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
