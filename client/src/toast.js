import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import './HomePage.css';

let root = null;
function ensureRoot() {
  if (!root) {
    root = document.createElement('div');
    root.id = 'app-toast-root';
    document.body.appendChild(root);
  }
  return root;
}

export function showToast(message, { duration = 1800, type = 'info' } = {}) {
  const container = ensureRoot();
  const id = 't_' + Date.now() + Math.random().toString(36).slice(2,7);
  const el = document.createElement('div');
  el.id = id;
  container.appendChild(el);
  function Toast() {
    const [visible, setVisible] = useState(true);
    useEffect(() => {
      const t = setTimeout(() => setVisible(false), duration - 300);
      const t2 = setTimeout(() => {
        const node = document.getElementById(id);
        if (node) node.remove();
      }, duration);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }, []);
    return (
      <div className={"hms-toast " + (type || 'info') + (visible? ' show':'') }>
        <div className="hms-toast-body">{message}</div>
      </div>
    );
  }
  ReactDOM.render(React.createElement(Toast), el);
}

export default showToast;
