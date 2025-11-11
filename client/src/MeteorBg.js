// Nền sao băng động cho form Đăng ký
import React, { useRef, useEffect } from 'react';
import './MeteorBg.css';

const colors = ['#fff', '#6cf', '#ffe066', '#a0e9ff', '#ffd6e0'];

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function MeteorBg() {
  const canvasRef = useRef(null);
  const meteors = useRef([]);
  const stars = useRef([]);
  const animationRef = useRef();
  const width = window.innerWidth;
  const height = window.innerHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Tạo sao tĩnh
    stars.current = Array.from({length: 120}, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.2 + 0.3,
      o: Math.random() * 0.5 + 0.5
    }));

    function spawnMeteor() {
      const angle = randomBetween(Math.PI * 0.7, Math.PI * 0.95); // từ trên trái xuống dưới phải
      const speed = randomBetween(7, 13);
      const len = randomBetween(120, 220);
      const x = randomBetween(-100, width * 0.8);
      const y = randomBetween(-40, height * 0.3);
      meteors.current.push({
        x, y, angle, speed, len,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0
      });
    }

    let lastMeteor = 0;
    function draw() {
      ctx.clearRect(0, 0, width, height);
      // Vẽ sao tĩnh
      for (const s of stars.current) {
        ctx.save();
        ctx.globalAlpha = s.o;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
      }
      // Vẽ sao băng
      for (const m of meteors.current) {
        ctx.save();
        ctx.globalAlpha = m.alpha;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - Math.cos(m.angle) * m.len, m.y - Math.sin(m.angle) * m.len);
        ctx.stroke();
        ctx.restore();
      }
    }
    function update() {
      // Di chuyển sao băng
      for (const m of meteors.current) {
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.life += 1;
        if (m.life > 10) m.alpha -= 0.025;
      }
      meteors.current = meteors.current.filter(m => m.alpha > 0 && m.x < width + 100 && m.y < height + 100);
    }
    function loop(ts) {
      if (!lastMeteor || ts - lastMeteor > randomBetween(350, 900)) {
        spawnMeteor();
        lastMeteor = ts;
      }
      update();
      draw();
      animationRef.current = requestAnimationFrame(loop);
    }
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [width, height]);

  return <canvas ref={canvasRef} className="meteor-bg-canvas" style={{position:'fixed',zIndex:0,top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none'}} />;
}

export default MeteorBg;
