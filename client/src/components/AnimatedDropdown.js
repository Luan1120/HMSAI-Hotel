import React, { useEffect, useRef, useState } from 'react';
/*
  AnimatedDropdown (skeleton)
  Props:
    options: Array<{ value:string, label:string }>
    value: string
    onChange: (val)=>void
    placeholder?: string
    width?: string|number
  Notes:
    - Accessible structure with role="listbox" / role="option"
    - Keyboard: ArrowUp/Down, Enter, Escape, Home, End
    - Click outside to close
    - Not yet integrated; provided for future replacement of native select when full open-panel animation is desired.
*/
export default function AnimatedDropdown({ options=[], value, onChange, placeholder='Chọn...', width='100%', className='', listClassName='', emptyLabel }){
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const wrapRef = useRef(null);

  const current = options.find(o=>o.value===value);

  // Build merged class
  const rootCls = 'adrop' + (className? ' '+className:'');

  useEffect(()=>{
    const handler = (e)=>{ if(!wrapRef.current) return; if(!wrapRef.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler);
    return ()=>{ window.removeEventListener('mousedown', handler); window.removeEventListener('touchstart', handler); };
  }, []);

  useEffect(()=>{ if(open){ // reset focus index each open
    const idx = options.findIndex(o=>o.value===value);
    setFocusIndex(idx>=0? idx: -1);
  }}, [open, value, options]);

  const commit = (val)=>{ onChange && onChange(val); setOpen(false); };

  const onKey = (e)=>{
    if(e.key==='ArrowDown'){
      e.preventDefault(); if(!open){ setOpen(true); return; }
      setFocusIndex(i=>{ const n=(i+1+options.length)%options.length; return n; });
    } else if(e.key==='ArrowUp'){
      e.preventDefault(); if(!open){ setOpen(true); return; }
      setFocusIndex(i=>{ const n=(i-1+options.length)%options.length; return n; });
    } else if(e.key==='Home'){ e.preventDefault(); if(options.length) setFocusIndex(0); }
    else if(e.key==='End'){ e.preventDefault(); if(options.length) setFocusIndex(options.length-1); }
    else if(e.key==='Enter'){ if(open && focusIndex>=0){ e.preventDefault(); commit(options[focusIndex].value); } else { setOpen(o=>!o); } }
    else if(e.key==='Escape'){ if(open){ e.preventDefault(); setOpen(false); } }
    else if(/^[a-z0-9]$/i.test(e.key)){
      const ch=e.key.toLowerCase(); const idx = options.findIndex(o=>o.label.toLowerCase().startsWith(ch)); if(idx>=0){ setFocusIndex(idx); }
    }
  };

  useEffect(()=>{ if(open && focusIndex>=0){ const el = wrapRef.current?.querySelector(`[data-idx="${focusIndex}"]`); if(el && el.scrollIntoView) el.scrollIntoView({ block:'nearest' }); } }, [focusIndex, open]);

  return (
    <div className={rootCls} data-open={open? 'true':'false'} ref={wrapRef} style={{ width }}>
      <button type="button" className="adrop-btn" aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(o=>!o)} onKeyDown={onKey}>
        <span style={{ flex:1, textAlign:'left', color: current? '#111':'#666' }}>{current? current.label : placeholder}</span>
        <span style={{ display:'inline-flex', transform:`rotate(${open? 180:0}deg)`, transition:'transform .25s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" stroke="#444" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      <div className={"adrop-list" + (listClassName? ' '+listClassName:'')} role="listbox" aria-hidden={!open}>
        {emptyLabel && (
          <div className="adrop-opt" role="option" aria-selected={value===''||value==null} onMouseDown={(e)=>{ e.preventDefault(); commit(''); }} style={{ fontStyle:'italic', opacity: value? .75:1 }}>
            {emptyLabel}
          </div>
        )}
        {options.length===0 && <div className="adrop-empty">Không có dữ liệu</div>}
        {options.map((o,i)=>{
          const sel = o.value===value; const foc = i===focusIndex;
          return (
            <div key={o.value} data-idx={i} role="option" aria-selected={sel} className="adrop-opt" onMouseDown={(e)=>{ e.preventDefault(); commit(o.value); }} style={foc? { background:'#e8f3ff' }: undefined}>
              {o.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
