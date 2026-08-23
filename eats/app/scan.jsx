// scan.jsx — full-height scan sheet (the primary action)

function ScanSheet({ open, onClose, onSave }) {
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [mode, setMode] = React.useState("paste");
  const [analyzing, setAnalyzing] = React.useState(false);
  const [ocrProgress, setOcrProgress] = React.useState(0);
  const [camError, setCamError] = React.useState("");
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setName(""); setText(""); setResult(null); setMode("paste");
      setOcrProgress(0); setCamError("");
    }
    return () => stopCamera();
  }, [open]);

  React.useEffect(() => {
    if (mode === "camera" && open) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [mode, open]);

  const startCamera = async () => {
    setCamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCamError(err && err.name === "NotAllowedError" ? "Camera permission denied. Use Paste text below." : "Camera unavailable: " + (err && err.message));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const capture = async () => {
    if (!videoRef.current || !streamRef.current) return;
    const v = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    stopCamera();
    setAnalyzing(true);
    setOcrProgress(5);
    try {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js";
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const { data: { text: ocrText } } = await window.Tesseract.recognize(dataUrl, "eng", {
        logger: (m) => { if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100)); }
      });
      setText(ocrText || "");
      setMode("paste");
      if ((ocrText || "").trim()) setResult(analyzeIngredients(ocrText));
    } catch (err) {
      setCamError("OCR failed: " + (err && err.message));
      setMode("paste");
    } finally {
      setAnalyzing(false);
      setOcrProgress(0);
    }
  };

  const onAnalyze = () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setTimeout(() => {
      setResult(analyzeIngredients(text));
      setAnalyzing(false);
    }, 650);
  };

  const useSample = () => {
    setName("Cheez-It Original");
    setText(SAMPLE_LABEL);
    setResult(null);
  };

  const save = () => {
    if (!result) return;
    const entry = {
      name: name || "Scanned product",
      brand: "",
      score: result.score,
      when: new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }),
      flag: result.score >= 70 ? "green" : result.score >= 50 ? "yellow" : "red",
      ts: Date.now()
    };
    try {
      const stored = JSON.parse(localStorage.getItem("ee.scans") || "[]");
      stored.unshift(entry);
      localStorage.setItem("ee.scans", JSON.stringify(stored.slice(0, 50)));
      window.dispatchEvent(new CustomEvent("ee:scan-saved", { detail: entry }));
    } catch (e) {}
    onSave(entry);
    onClose();
  };

  if (!open) return null;

  return (
    <div className={"ee-sheet-wrap" + (open ? " is-open" : "")} onClick={onClose}>
      <div className="ee-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ee-sheet-grab" />
        {/* Header */}
        <div className="ee-sheet-hd">
          <div>
            <Kicker>Decode label</Kicker>
            <h2 className="ee-h2" style={{ marginTop: 4 }}>What's in this?</h2>
          </div>
          <button className="ee-icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="ee-seg" role="tablist">
          <button className={"ee-seg-btn " + (mode === "camera" ? "is-active" : "")} onClick={() => setMode("camera")}>
            <Icon.scan size={14} /> Camera
          </button>
          <button className={"ee-seg-btn " + (mode === "paste" ? "is-active" : "")} onClick={() => setMode("paste")}>
            Paste text
          </button>
        </div>

        {/* Camera live capture */}
        {mode === "camera" && (
          <div className="ee-cam">
            <div className="ee-cam-frame" style={{ position: "relative", overflow: "hidden" }}>
              <video ref={videoRef} playsInline muted autoPlay
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
              <span className="ee-cam-corner tl" />
              <span className="ee-cam-corner tr" />
              <span className="ee-cam-corner bl" />
              <span className="ee-cam-corner br" />
              <div className="ee-cam-scanline" />
              <div className="ee-cam-hint">{analyzing ? `Reading label... ${ocrProgress}%` : "Align the ingredient panel"}</div>
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {camError && (
              <div className="ee-allergens" style={{ marginTop: 14 }}>
                <Icon.alert size={13} />
                <em>Camera</em>
                <span>{camError}</span>
              </div>
            )}
            <button className="ee-btn ee-btn-primary" style={{ marginTop: 16 }} onClick={capture} disabled={!!camError || analyzing}>
              {analyzing ? <><span className="ee-spinner" /> OCR {ocrProgress}%</> : <><Icon.bolt size={14} /> Capture + Decode</>}
            </button>
            <button className="ee-link" style={{ marginTop: 10 }} onClick={() => setMode("paste")}>
              or paste text instead
            </button>
          </div>
        )}

        {/* Paste mode */}
        {mode === "paste" && !result && (
          <div className="ee-form">
            <div className="ee-field">
              <label>Product name <span className="ee-opt">optional</span></label>
              <input
                type="text"
                placeholder="e.g. Cheez-It Original"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="ee-field">
              <div className="ee-field-h">
                <label>Ingredients</label>
                <button className="ee-link" onClick={useSample} title="Load an example label to try it">Try an example</button>
              </div>
              <textarea
                rows={6}
                placeholder="Paste the ingredient list from the back of the package…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <button
              className="ee-btn ee-btn-primary ee-btn-block"
              onClick={onAnalyze}
              disabled={!text.trim() || analyzing}
            >
              {analyzing ? <><span className="ee-spinner" /> Decoding…</> : <><Icon.bolt size={14} /> Analyze ingredients</>}
            </button>
          </div>
        )}

        {/* Result */}
        {mode === "paste" && result && (
          <ScanResult result={result} name={name} text={text} onSave={save} onRescan={() => { setResult(null); setText(""); setName(""); }} />
        )}
      </div>
    </div>
  );
}

function ScanResult({ result, name, text, onSave, onRescan }) {
  const perplexityHref = `https://www.perplexity.ai/?q=${encodeURIComponent(
    `Evaluate this ingredient list for health risk and chronic-illness concerns: ${text || result.flags.map(f => f.ingredient.name).join(", ")}. Rate each ingredient and list red flags.`
  )}`;
  const tone = result.score >= 70 ? "green" : result.score >= 50 ? "yellow" : "red";
  const verdict =
    tone === "green" ? "Clean enough." :
    tone === "yellow" ? "Mixed bag." : "Skip if you can.";
  return (
    <div className="ee-result">
      <div className="ee-result-hero">
        <div className="ee-result-meta">
          <Kicker>Clean score</Kicker>
          <div className="ee-result-name">{name || "Scanned product"}</div>
        </div>
        <ScoreRing score={result.score} size={108} stroke={7} />
      </div>
      <div className="ee-result-num">
        <ScoreBadge score={result.score} size="xl" />
      </div>
      <div className="ee-verdict">{verdict}</div>

      <div className="ee-result-bar">
        <span className="seg" style={{ flex: result.red, background: "var(--flag-red)" }} title="Red flags" />
        <span className="seg" style={{ flex: result.yellow, background: "var(--flag-yellow)" }} title="Yellow flags" />
        <span className="seg" style={{ flex: result.green || 0.4, background: "var(--flag-green)" }} title="Green ingredients" />
      </div>
      <div className="ee-result-counts">
        <span><FlagDot flag="red" /> {result.red} red</span>
        <span><FlagDot flag="yellow" /> {result.yellow} watch</span>
        <span><FlagDot flag="green" /> {result.green} clean</span>
      </div>

      {result.allergens.length > 0 && (
        <div className="ee-allergens">
          <Icon.alert size={13} />
          <span>Allergens:</span>
          <em>{result.allergens.join(" · ")}</em>
        </div>
      )}

      <div className="ee-result-list">
        <Kicker>Ingredient breakdown</Kicker>
        <ul>
          {result.flags.map((f) => (
            <li key={f.key}>
              <FlagDot flag={f.ingredient.flag} />
              <div className="ee-il-body">
                <div className="ee-il-name">{f.ingredient.name}</div>
                <div className="ee-il-reason">{f.ingredient.reason}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="ee-result-actions">
        <button className="ee-btn ee-btn-primary ee-btn-block" onClick={onSave}>
          <Icon.check size={14} /> Save & see swaps
        </button>
        <a className="ee-btn ee-btn-ghost ee-btn-block" href={perplexityHref} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <Icon.sparkle size={14} /> Verify with Perplexity
        </a>
        <button className="ee-btn ee-btn-ghost ee-btn-block" onClick={onRescan}>
          Decode another
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ScanSheet });
