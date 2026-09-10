class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particles-canvas');
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.isVisible = false;
    this.accentColor = '#9f4ac6';
    this.isInitialized = false;
    this.animationFrame = null;
    
    this.init();
  }

  init() {
    this.resize();
    this.createParticles();
    this.setupEventListeners();
    
    this.updateAccentColor();
    
    document.addEventListener('loadingComplete', () => {
      this.isVisible = true;
      this.canvas.style.opacity = '1';
      // Update color again after loading
      setTimeout(() => this.updateAccentColor(), 100);
    });
    
    document.addEventListener('colorsApplied', (e) => {
      this.updateAccentColor();
    });
    
    // Start animation
    this.animate();
  }

  updateAccentColor() {
    // Try multiple sources to get the accent color
    let color = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-color').trim();
    
    // If not found in CSS variables, try the body's background or other elements
    if (!color || color === '' || color === 'undefined') {
      // Try to get from the main PFP border
      const pfp = document.getElementById('dc-pfp');
      if (pfp) {
        const borderColor = getComputedStyle(pfp).borderColor;
        if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
          color = borderColor;
        }
      }
    }
    
    // If still not found, try the accent from the loading screen
    if (!color || color === '' || color === 'undefined') {
      const loadingRing = document.querySelector('.loading-ring');
      if (loadingRing) {
        const ringColor = getComputedStyle(loadingRing).borderTopColor;
        if (ringColor && ringColor !== 'rgba(0, 0, 0, 0)') {
          color = ringColor;
        }
      }
    }
    
    // If we have a color, use it
    if (color && color !== '' && color !== 'undefined') {
      this.accentColor = color;
    } else {
      // Fallback to the CSS variable with a default
      this.accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim() || '#9f4ac6';
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createParticles() {
    const count = Math.min(50, Math.floor((window.innerWidth * window.innerHeight) / 20000));
    this.particles = [];
    
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 1.8 + 0.5,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.3 + 0.08,
        baseOpacity: Math.random() * 0.3 + 0.08,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());
    
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    
    // Listen for accent color changes
    const observer = new MutationObserver(() => {
      this.updateAccentColor();
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // Also observe the body for style changes
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // Check periodically for color changes (safety net)
    setInterval(() => {
      this.updateAccentColor();
    }, 3000);
  }

  animate() {
    if (!this.ctx) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (this.isVisible) {
      const time = Date.now() * 0.001;
      
      // Update color on each frame to ensure it's fresh
      // Only update every 30 frames for performance
      if (!this._frameCount) this._frameCount = 0;
      this._frameCount++;
      if (this._frameCount % 30 === 0) {
        this.updateAccentColor();
      }
      
      this.particles.forEach((p, i) => {
        // Update position
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.x < 0 || p.x > this.canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > this.canvas.height) p.speedY *= -1;
        
        // Pulse opacity
        const pulse = Math.sin(time * p.pulseSpeed + p.pulseOffset) * 0.3 + 0.7;
        const currentOpacity = p.baseOpacity * pulse;
        
        // Mouse interaction
        const dx = p.x - this.mouseX;
        const dy = p.y - this.mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 200 && distance > 0) {
          const force = (1 - distance / 200) * 0.5;
          p.x += (dx / distance) * force;
          p.y += (dy / distance) * force;
        }
        
        // Draw particle
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        
        // Use the current accent color
        this.ctx.fillStyle = this.accentColor;
        this.ctx.globalAlpha = currentOpacity;
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
        
        // Draw connections
        for (let j = i + 1; j < this.particles.length; j++) {
          const p2 = this.particles[j];
          const dx2 = p.x - p2.x;
          const dy2 = p.y - p2.y;
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          
          if (dist < 150) {
            const opacity = 0.06 * (1 - dist / 150);
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.strokeStyle = this.accentColor;
            this.ctx.globalAlpha = opacity;
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
          }
        }
      });
    }
    
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  // Cleanup
  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.canvas) {
      this.canvas.remove();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  
  // Wait for loading to complete
  const particleSystem = new ParticleSystem();
  
  // Expose for debugging
  window.particleSystem = particleSystem;
  
  // Also try to get the color after loadAssets runs
  setTimeout(() => {
    particleSystem.updateAccentColor();
  }, 2000);
});

// Also update when loadAssets applies colors
document.addEventListener('loadingComplete', () => {
  if (window.particleSystem) {
    setTimeout(() => {
      window.particleSystem.updateAccentColor();
    }, 200);
  }
});