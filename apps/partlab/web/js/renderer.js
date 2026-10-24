/**
 * PartLabView — Canvas 2D 3D Renderer
 * Hand-rolled painter's algorithm renderer with flat shading
 * No WebGL, no dependencies
 */

(function() {
  'use strict';

  /**
   * PartLabView constructor
   * @param {HTMLCanvasElement} canvas - The canvas element to render into
   */
  function PartLabView(canvas) {
    if (!(this instanceof PartLabView)) {
      return new PartLabView(canvas);
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // View state
    this.yaw = Math.PI / 6;    // 30 degrees
    this.pitch = Math.PI / 8;  // 22.5 degrees
    this.zoom = 1.0;
    this.minZoom = 0.2;
    this.maxZoom = 6.0;

    // Options
    this.options = {
      showHoles: true,
      wireframe: false,
      grid: true
    };

    this.partColor = '#3b82f6';

    // Mesh data
    this.mesh = null;

    // Transform matrices
    this.rotationMatrix = null;
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;

    // Light direction (fixed, in view space)
    this.lightDir = normalize([0.5, 0.8, -1.0]);

    // Interaction state
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this._setupCanvas();
    this._setupEvents();
  }

  /**
   * Set up canvas sizing with device pixel ratio
   */
  PartLabView.prototype._setupCanvas = function() {
    this._resizeCanvas();
  };

  PartLabView.prototype._resizeCanvas = function() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);

    this.ctx.scale(dpr, dpr);

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;

    if (this.mesh) {
      this.render();
    }
  };

  /**
   * Set up mouse/touch events for orbit and zoom
   */
  PartLabView.prototype._setupEvents = function() {
    const self = this;

    // Mouse events
    this.canvas.addEventListener('mousedown', function(e) {
      self.isDragging = true;
      self.lastMouseX = e.clientX;
      self.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', function(e) {
      if (!self.isDragging) return;

      const dx = e.clientX - self.lastMouseX;
      const dy = e.clientY - self.lastMouseY;

      self.orbit(dx, dy);

      self.lastMouseX = e.clientX;
      self.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', function() {
      self.isDragging = false;
    });

    // Wheel zoom
    this.canvas.addEventListener('wheel', function(e) {
      e.preventDefault();

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      self.zoom(delta);
    }, { passive: false });

    // Resize
    window.addEventListener('resize', function() {
      self._resizeCanvas();
    });
  };

  /**
   * Set the mesh to render
   * @param {Object} mesh - Mesh object per spec §3.2
   */
  PartLabView.prototype.setMesh = function(mesh) {
    this.mesh = mesh || null;

    if (this.mesh) {
      this._computeTransform();
      this.fit();
    }

    this.render();
  };

  /**
   * Set rendering options
   * @param {Object} opts - { showHoles, wireframe, grid }
   */
  PartLabView.prototype.setOptions = function(opts) {
    if (typeof opts.showHoles === 'boolean') {
      this.options.showHoles = opts.showHoles;
    }
    if (typeof opts.wireframe === 'boolean') {
      this.options.wireframe = opts.wireframe;
    }
    if (typeof opts.grid === 'boolean') {
      this.options.grid = opts.grid;
    }

    this.render();
  };

  /**
   * Set part color
   * @param {string} css - CSS color string
   */
  PartLabView.prototype.setPartColor = function(css) {
    this.partColor = css;
    this.render();
  };

  /**
   * Orbit the view
   * @param {number} dx - Delta X in pixels
   * @param {number} dy - Delta Y in pixels
   */
  PartLabView.prototype.orbit = function(dx, dy) {
    const sensitivity = 0.005;

    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;

    // Clamp pitch to avoid gimbal lock
    const maxPitch = Math.PI / 2 - 0.1;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this._computeTransform();
    this.render();
  };

  /**
   * Zoom the view
   * @param {number} factor - Zoom multiplier
   */
  PartLabView.prototype.zoom = function(factor) {
    this.zoom *= factor;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.render();
  };

  /**
   * Reset view to default
   */
  PartLabView.prototype.reset = function() {
    this.yaw = Math.PI / 6;
    this.pitch = Math.PI / 8;
    this.zoom = 1.0;

    if (this.mesh) {
      this._computeTransform();
    }

    this.render();
  };

  /**
   * Fit mesh to canvas
   */
  PartLabView.prototype.fit = function() {
    if (!this.mesh || !this.mesh.bounds) {
      return;
    }

    const bounds = this.mesh.bounds;
    const minX = bounds.min[0], minY = bounds.min[1], minZ = bounds.min[2];
    const maxX = bounds.max[0], maxY = bounds.max[1], maxZ = bounds.max[2];

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;

    const maxSize = Math.max(sizeX, sizeY, sizeZ, 1);

    // Calculate scale to fit canvas (with padding)
    const padding = 0.7;
    const canvasMin = Math.min(this.canvasWidth, this.canvasHeight);
    this.scale = (canvasMin * padding) / maxSize;

    // Center offset
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    this.offsetX = -centerX * this.scale + this.canvasWidth / 2;
    this.offsetY = centerY * this.scale + this.canvasHeight / 2;

    this.render();
  };

  /**
   * Compute rotation matrix from yaw/pitch
   */
  PartLabView.prototype._computeTransform = function() {
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    // Rotation matrix: yaw then pitch
    // R = Ry * Rx
    this.rotationMatrix = [
      [cosYaw, sinYaw * sinPitch, sinYaw * cosPitch],
      [0, cosPitch, -sinPitch],
      [-sinYaw, cosYaw * sinPitch, cosYaw * cosPitch]
    ];
  };

  /**
   * Render the scene
   */
  PartLabView.prototype.render = function() {
    const ctx = this.ctx;
    const width = this.canvasWidth;
    const height = this.canvasHeight;

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (this.options.grid) {
      this._drawGrid();
    }

    if (!this.mesh) {
      return;
    }

    // Collect all triangles with depth info
    const triangles = [];

    // Add solid triangles
    if (this.mesh.solids) {
      for (let i = 0; i < this.mesh.solids.length; i++) {
        const solid = this.mesh.solids[i];
        const tris = this._meshToTriangles(solid);
        for (let j = 0; j < tris.length; j++) {
          triangles.push({ tri: tris[j], isHole: false, color: this.partColor });
        }
      }
    }

    // Add hole triangles
    if (this.options.showHoles && this.mesh.holes) {
      for (let i = 0; i < this.mesh.holes.length; i++) {
        const hole = this.mesh.holes[i];
        const tris = this._meshToTriangles(hole);
        for (let j = 0; j < tris.length; j++) {
          triangles.push({ tri: tris[j], isHole: true, color: '#f85149' });
        }
      }
    }

    // Sort by depth (painter's algorithm)
    triangles.sort((a, b) => b.depth - a.depth);

    // Draw triangles
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      this._drawTriangle(t.tri, t.isHole, t.color);
    }
  };

  /**
   * Convert mesh solid/hole to triangle list with depths
   */
  PartLabView.prototype._meshToTriangles = function(meshPart) {
    const result = [];
    const vertices = meshPart.vertices;
    const triangles = meshPart.triangles;

    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      const v0 = vertices[tri[0]];
      const v1 = vertices[tri[1]];
      const v2 = vertices[tri[2]];

      // Transform to view space
      const p0 = this._project(v0);
      const p1 = this._project(v1);
      const p2 = this._project(v2);

      // Skip if behind camera
      if (p0[2] <= 0 || p1[2] <= 0 || p2[2] <= 0) continue;

      // Back-face culling
      if (!this._isFrontFacing(p0, p1, p2)) continue;

      // Average depth for sorting
      const depth = (p0[2] + p1[2] + p2[2]) / 3;

      result.push({
        p0: p0,
        p1: p1,
        p2: p2,
        depth: depth,
        normal: this._computeNormal(v0, v1, v2)
      });
    }

    return result;
  };

  /**
   * Project 3D point to 2D screen space
   * Returns [x, y, z] in screen coordinates
   */
  PartLabView.prototype._project = function(vertex) {
    const R = this.rotationMatrix;
    const x = vertex[0], y = vertex[1], z = vertex[2];

    // Rotate
    const rx = R[0][0] * x + R[0][1] * y + R[0][2] * z;
    const ry = R[1][0] * x + R[1][1] * y + R[1][2] * z;
    const rz = R[2][0] * x + R[2][1] * y + R[2][2] * z;

    // Scale and translate
    const sx = rx * this.scale + this.offsetX;
    const sy = -ry * this.scale + this.offsetY; // Flip Y for screen coords
    const sz = rz; // Depth for sorting

    return [sx, sy, sz];
  };

  /**
   * Check if triangle is front-facing
   */
  PartLabView.prototype._isFrontFacing = function(p0, p1, p2) {
    // Cross product in screen space
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];

    return (ax * by - ay * bx) < 0; // CCW winding
  };

  /**
   * Compute normal from 3 vertices
   */
  PartLabView.prototype._computeNormal = function(v0, v1, v2) {
    const ax = v1[0] - v0[0];
    const ay = v1[1] - v0[1];
    const az = v1[2] - v0[2];
    const bx = v2[0] - v0[0];
    const by = v2[1] - v0[1];
    const bz = v2[2] - v0[2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    return normalize([nx, ny, nz]);
  };

  /**
   * Draw a single triangle
   */
  PartLabView.prototype._drawTriangle = function(triData, isHole, baseColor) {
    const ctx = this.ctx;
    const p0 = triData.p0;
    const p1 = triData.p1;
    const p2 = triData.p2;

    if (this.options.wireframe) {
      ctx.strokeStyle = isHole ? '#f85149' : baseColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.stroke();
      return;
    }

    // Flat shading
    const normal = triData.normal;
    const dot = normal[0] * this.lightDir[0] +
                normal[1] * this.lightDir[1] +
                normal[2] * this.lightDir[2];

    const ambient = 0.2;
    const diffuse = Math.max(0, dot) * 0.8;
    const intensity = ambient + diffuse;

    // Parse and apply color with intensity
    const fillColor = this._applyLighting(baseColor, intensity);

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fill();

    // Optional edge
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  };

  /**
   * Apply lighting to a color
   */
  PartLabView.prototype._applyLighting = function(color, intensity) {
    // Parse hex color
    let r, g, b;

    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else {
      // Fallback for named colors
      r = g = b = 128;
    }

    // Apply intensity
    r = Math.min(255, Math.floor(r * intensity));
    g = Math.min(255, Math.floor(g * intensity));
    b = Math.min(255, Math.floor(b * intensity));

    return `rgb(${r}, ${g}, ${b})`;
  };

  /**
   * Draw the ground grid
   */
  PartLabView.prototype._drawGrid = function() {
    const ctx = this.ctx;
    const size = 200;
    const divisions = 20;
    const step = size / divisions;

    ctx.strokeStyle = 'rgba(139, 148, 158, 0.3)';
    ctx.lineWidth = 1;

    // Draw grid lines
    for (let i = 0; i <= divisions; i++) {
      const pos = -size / 2 + i * step;

      // Line along X
      const p1 = this._project([pos, 0, -size / 2]);
      const p2 = this._project([pos, 0, size / 2]);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();

      // Line along Z
      const p3 = this._project([-size / 2, 0, pos]);
      const p4 = this._project([size / 2, 0, pos]);
      ctx.beginPath();
      ctx.moveTo(p3[0], p3[1]);
      ctx.lineTo(p4[0], p4[1]);
      ctx.stroke();
    }

    // Draw axes
    const origin = this._project([0, 0, 0]);
    const xEnd = this._project([50, 0, 0]);
    const yEnd = this._project([0, 50, 0]);
    const zEnd = this._project([0, 0, 50]);

    // X axis (red)
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(xEnd[0], xEnd[1]);
    ctx.stroke();

    // Y axis (green)
    ctx.strokeStyle = '#3fb950';
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(yEnd[0], yEnd[1]);
    ctx.stroke();

    // Z axis (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(zEnd[0], zEnd[1]);
    ctx.stroke();
  };

  /**
   * Export canvas as PNG data URL
   * @returns {string} PNG data URL
   */
  PartLabView.prototype.exportPNG = function() {
    return this.canvas.toDataURL('image/png');
  };

  // Utility: vector normalization
  function normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  // Expose globally
  window.PartLabView = PartLabView;

})();
