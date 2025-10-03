import React, { useEffect, useRef } from "react";
import "./UniverseBg.css";

const PLANETS = [
  { size: 60, color: "#6cf", orbit: 180, speed: 22, glow: "#6cf6" },
  { size: 38, color: "#f6c", orbit: 120, speed: 14, glow: "#f6c7" },
  { size: 24, color: "#ffb347", orbit: 80, speed: 9, glow: "#ffb34788" },
  { size: 16, color: "#fff", orbit: 40, speed: 6, glow: "#fff7" }
];
const STAR_COUNT = 80;
const MOVING_STAR_COUNT = 8;

function random(min, max) {
  return Math.random() * (max - min) + min;
}


export default function UniverseBg() {
  const bgRef = useRef();
  // Parallax mouse
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    let mouseX = 0.5, mouseY = 0.5;
    function onMove(e) {
      const rect = bg.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width;
      mouseY = (e.clientY - rect.top) / rect.height;
      bg.style.setProperty('--mx', mouseX);
      bg.style.setProperty('--my', mouseY);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Sinh sao tĩnh, sao động, hành tinh, nebula
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.innerHTML = '';
    // Nebula động
    const nebula = document.createElement('div');
    nebula.className = 'universe-nebula';
    bg.appendChild(nebula);
    // Sao tĩnh
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = document.createElement('div');
      let className = 'universe-star';
      // Sao lớn động
      if (i < 4) className += ' big';
      star.className = className;
      const size = i < 4 ? random(3.5, 6) : random(1, 2.5);
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.top = `${random(0, 100)}%`;
      star.style.left = `${random(0, 100)}%`;
      star.style.opacity = random(0.5, 1).toFixed(2);
      star.style.animationDuration = `${random(2, 5)}s`;
      bg.appendChild(star);
    }
    // Sao di chuyển chậm
    for (let i = 0; i < MOVING_STAR_COUNT; i++) {
      const star = document.createElement('div');
      star.className = 'universe-star moving';
      const size = random(1.5, 3.5);
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.top = `${random(0, 100)}%`;
      star.style.left = `${random(0, 100)}%`;
      star.style.opacity = random(0.5, 1).toFixed(2);
      star.style.setProperty('--move-x', `${random(-30, 30)}vw`);
      star.style.setProperty('--move-y', `${random(-20, 20)}vh`);
      star.style.animationDuration = `${random(12, 22)}s`;
      bg.appendChild(star);
    }
    // Hành tinh/quỹ đạo
    PLANETS.forEach((p, idx) => {
      const orbit = document.createElement('div');
      orbit.className = 'universe-orbit';
      orbit.style.width = orbit.style.height = `${p.orbit * 2}px`;
      orbit.style.left = `calc(50% - ${p.orbit}px)`;
      orbit.style.top = `calc(50% - ${p.orbit}px)`;
      orbit.style.animationDuration = `${p.speed}s`;
      // Hành tinh
      const planet = document.createElement('div');
      planet.className = 'universe-planet' + (idx % 2 === 1 ? ' reverse' : '');
      planet.style.width = planet.style.height = `${p.size}px`;
      planet.style.background = p.color;
      planet.style.boxShadow = `0 0 24px 6px ${p.glow}`;
      planet.style.filter = 'blur(0.5px)';
      orbit.appendChild(planet);
      bg.appendChild(orbit);
    });
  }, []);

  return <div className="universe-bg" ref={bgRef} aria-hidden="true" />;
}
