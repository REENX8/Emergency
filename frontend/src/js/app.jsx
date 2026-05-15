/* Root app — routing between screens + Tweaks integration */
/* eslint-disable */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "control",
  "density": "comfy",
  "scenario": "classroom-fire",
  "formulaOverlay": false,
  "accent": "cyan"
}/*EDITMODE-END*/;

function App() {
  const [screen, setScreen] = React.useState('simulate');
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  /* Apply accent override */
  React.useEffect(() => {
    const map = {
      cyan:   ['oklch(0.78 0.13 215)', 'oklch(0.55 0.11 215)'],
      amber:  ['oklch(0.80 0.14 75)',  'oklch(0.55 0.12 75)'],
      violet: ['oklch(0.72 0.14 295)', 'oklch(0.50 0.12 295)'],
      lime:   ['oklch(0.78 0.16 140)', 'oklch(0.55 0.13 140)'],
    };
    const [c, cd] = map[tweaks.accent] || map.cyan;
    document.documentElement.style.setProperty('--accent-cyan', c);
    document.documentElement.style.setProperty('--accent-cyan-d', cd);
  }, [tweaks.accent]);

  /* Apply theme override */
  React.useEffect(() => {
    const r = document.documentElement.style;
    if (tweaks.theme === 'hi-contrast') {
      r.setProperty('--bg-0', '#000');
      r.setProperty('--bg-1', '#06080c');
      r.setProperty('--bg-2', '#0c1018');
      r.setProperty('--bg-3', '#161c26');
      r.setProperty('--line-1', '#2a3645');
      r.setProperty('--ink-0', '#ffffff');
    } else if (tweaks.theme === 'soft') {
      r.setProperty('--bg-0', '#0d131c');
      r.setProperty('--bg-1', '#131a25');
      r.setProperty('--bg-2', '#1a2230');
      r.setProperty('--bg-3', '#222d3e');
      r.setProperty('--line-1', '#1c2533');
      r.setProperty('--ink-0', '#f3f6fa');
    } else {
      r.setProperty('--bg-0', '#07090d');
      r.setProperty('--bg-1', '#0c1118');
      r.setProperty('--bg-2', '#121822');
      r.setProperty('--bg-3', '#1a2230');
      r.setProperty('--line-1', '#1c2533');
      r.setProperty('--ink-0', '#f3f6fa');
    }
  }, [tweaks.theme]);

  return (
    <>
      {screen === 'simulate'  && <SimulationScreen tweaks={tweaks} navigateTo={setScreen} />}
      {screen === 'manager'   && <ManagerScreen     navigateTo={setScreen} />}
      {screen === 'editor'    && <EditorScreen      navigateTo={setScreen} />}
      {screen === 'analysis'  && <SimulationScreen  tweaks={tweaks} navigateTo={setScreen} />}
      {screen === 'incidents' && <SimulationScreen  tweaks={tweaks} navigateTo={setScreen} />}
      {screen === 'login'     && <LoginScreen       navigateTo={setScreen} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="THEME">
          <TweakRadio label="Surface" value={tweaks.theme}
            options={[
              { value: 'control', label: 'Control' },
              { value: 'soft', label: 'Soft' },
              { value: 'hi-contrast', label: 'High' },
            ]}
            onChange={(v) => setTweak('theme', v)} />
          <TweakColor label="Accent" value={tweaks.accent}
            options={[
              { value: 'cyan',   color: 'oklch(0.78 0.13 215)' },
              { value: 'amber',  color: 'oklch(0.80 0.14 75)' },
              { value: 'lime',   color: 'oklch(0.78 0.16 140)' },
              { value: 'violet', color: 'oklch(0.72 0.14 295)' },
            ]}
            onChange={(v) => setTweak('accent', v)} />
        </TweakSection>

        <TweakSection label="LAYOUT">
          <TweakRadio label="Density" value={tweaks.density}
            options={[
              { value: 'comfy', label: 'Comfy' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(v) => setTweak('density', v)} />
          <TweakToggle label="Formula overlay" value={tweaks.formulaOverlay}
            onChange={(v) => setTweak('formulaOverlay', v)} />
        </TweakSection>

        <TweakSection label="SCENARIO">
          <TweakSelect label="Demo" value={tweaks.scenario}
            options={[
              { value: 'classroom-fire', label: 'Classroom fire @ r201' },
              { value: 'cascade', label: 'Cascade @ r302' },
              { value: 'collapse', label: 'Corridor collapse @ c1' },
            ]}
            onChange={(v) => setTweak('scenario', v)} />
        </TweakSection>

        <TweakSection label="JUMP TO SCREEN">
          <div className="tweak-shortcut-grid">
            {[
              ['login','Login'],
              ['manager','Manager'],
              ['editor','Editor'],
              ['simulate','Simulate'],
            ].map(([k, l]) => (
              <button key={k} className={`tweak-jump ${screen === k ? 'on' : ''}`}
                onClick={() => setScreen(k)}>{l}</button>
            ))}
          </div>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

/* Extra shortcut grid styling */
const extraCss = document.createElement('style');
extraCss.textContent = `
  .tweak-shortcut-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 0 10px 8px;
  }
  .tweak-jump {
    padding: 5px 8px; font-size: 11px; cursor: pointer;
    background: rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.08);
    border-radius: 4px; color: inherit; font-family: ui-sans-serif, system-ui;
  }
  .tweak-jump.on { background: rgba(56,189,248,0.15); border-color: rgba(56,189,248,0.5); font-weight: 600; }
  .tweak-jump:hover { background: rgba(0,0,0,0.1); }
`;
document.head.appendChild(extraCss);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
