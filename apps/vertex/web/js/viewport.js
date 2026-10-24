/**
 * VertexView — Hand-rolled Canvas 2D 3D Viewport
 * Per vertex-v2-spec.md §3
 * 
 * API:
 *   new VertexView(canvas)
 *   setMesh(mesh)           // vertex/mesh/v1
 *   setSim(simResult)       // vertex/sim/v1 - enables motion playback
 *   setOptions({grid,wireframe,showHoles,dims,crop})
 *   orbit(dx, dy)
 *   zoom(f)
 *   fit()
 *   reset()
 *   setTime(t)              // 0..1 - apply motion[t] transforms
 *   play() / pause()
 *   render()
 *   exportPNG() -> dataURL
 */
(function() {
  'use strict';

  /* === Constants === */
  var BG_COLOR = '#0B0C0E';
  var GRID_COLOR = '#1C1E22';
  var GEOMETRY_COLOR = '#C8CED8';
  var ACCENT_COLOR = '#7C9CFF';
  var HOLE_COLOR = '#6B7C99';
  
  var DEFAULT_OPTIONS = {
    grid: true,
    wireframe: true,
    showHoles: true,
    dims: true,
    crop: true
  };

  /* === Matrix Helpers (column-major 4x4) === */
  function mat4Identity() {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  }

  function mat4Multiply(a, b) {
    var out = new Array(16);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        out[i * 4 + j] = 0;
        for (var k = 0; k < 4; k++) {
          out[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k];
        }
      }
    }
    return out;
  }

  function mat4RotateX(angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return [
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1
    ];
  }

  function mat4RotateY(angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return [
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1
    ];
  }

  function mat4Scale(s) {
    return [
      s, 0, 0, 0,
      0, s, 0, 0,
      0, 0, s, 0,
      0, 0, 0, 1
    ];
  }

  function mat4Translate(x, y, z) {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1
    ];
  }

  function transformPoint(p, m) {
    var x = p[0], y = p[1], z = p[2];
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w === 0) w = 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    ];
  }

  /* === VertexView Constructor === */
  function VertexView(canvas) {
    if (!(this instanceof VertexView)) {
      return new VertexView(canvas);
    }
    
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    /* State */
    this.mesh = null;
    this.sim = null;
    this.options = Object.assign({}, DEFAULT_OPTIONS);
    
    /* Model bounds (auto-fit) */
    this.center = [0, 0, 0];
    this.radius = 1;
    this.modelScale = 1;
    
    /* Camera */
    this.rotationX = -0.3;
    this.rotationY = 0.5;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    
    /* Animation */
    this.currentTime = 0;
    this.isPlaying = false;
    this.animationId = null;
    
    /* Interaction */
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    /* Device pixel ratio */
    this.dpr = window.devicePixelRatio || 1;
    
    this._setupCanvas();
    this._setupInteraction();
    this.render();
  }

  /* === Canvas Setup === */
  VertexView.prototype._setupCanvas = function() {
    var rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  };

  VertexView.prototype._setupInteraction = function() {
    var self = this;
    
    this.canvas.addEventListener('mousedown', function(e) {
      self.isDragging = true;
      self.lastMouseX = e.clientX;
      self.lastMouseY = e.clientY;
    });
    
    window.addEventListener('mousemove', function(e) {
      if (!self.isDragging) return;
      var dx = e.clientX - self.lastMouseX;
      var dy = e.clientY - self.lastMouseY;
      self.orbit(dx, dy);
      self.lastMouseX = e.clientX;
      self.lastMouseY = e.clientY;
    });
    
    window.addEventListener('mouseup', function() {
      self.isDragging = false;
    });
    
    this.canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 0.9 : 1.1;
      self.zoom(delta);
    }, { passive: false });
    
    window.addEventListener('resize', function() {
      self._setupCanvas();
      self.render();
    });
  };

  /* === Public API === */
  VertexView.prototype._computeBounds = function(mesh) {
    var bounds = mesh.bounds;
    var min, max;
    
    if (bounds && bounds.min && bounds.max) {
      min = bounds.min;
      max = bounds.max;
    } else {
      var parts = mesh.parts || [];
      var allVerts = [];
      parts.forEach(function(part) {
        var verts = part.vertices || [];
        for (var i = 0; i < verts.length; i++) {
          allVerts.push(verts[i]);
        }
      });
      if (allVerts.length === 0) {
        return { center: [0, 0, 0], radius: 1 };
      }
      min = [Infinity, Infinity, Infinity];
      max = [-Infinity, -Infinity, -Infinity];
      allVerts.forEach(function(v) {
        if (v[0] < min[0]) min[0] = v[0];
        if (v[1] < min[1]) min[1] = v[1];
        if (v[2] < min[2]) min[2] = v[2];
        if (v[0] > max[0]) max[0] = v[0];
        if (v[1] > max[1]) max[1] = v[1];
        if (v[2] > max[2]) max[2] = v[2];
      });
    }
    
    var center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    var halfExtents = [
      (max[0] - min[0]) / 2,
      (max[1] - min[1]) / 2,
      (max[2] - min[2]) / 2
    ];
    var radius = Math.max(halfExtents[0], halfExtents[1], halfExtents[2]);
    if (radius <= 0) radius = 1;
    
    return { center: center, radius: radius };
  };
  
  VertexView.prototype.setMesh = function(mesh) {
    this.mesh = mesh;
    var boundsInfo = this._computeBounds(mesh);
    this.center = boundsInfo.center;
    this.radius = boundsInfo.radius;
    this.modelScale = 1 / this.radius;
    this.reset();
    this.render();
  };

  VertexView.prototype.setSim = function(simResult) {
    this.sim = simResult;
    this.render();
  };

  VertexView.prototype.setOptions = function(opts) {
    this.options = Object.assign({}, this.options, opts);
    this.render();
  };

  VertexView.prototype.orbit = function(dx, dy) {
    this.rotationY += dx * 0.01;
    this.rotationX += dy * 0.01;
    this.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotationX));
    this.render();
  };

  VertexView.prototype.zoom = function(factor) {
    this.zoom *= factor;
    this.zoom = Math.max(0.1, Math.min(5, this.zoom));
    this.render();
  };

  VertexView.prototype.fit = function() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.render();
  };

  VertexView.prototype.reset = function() {
    this.rotationX = -0.3;
    this.rotationY = 0.5;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.currentTime = 0;
    this.pause();
    this.render();
  };

  VertexView.prototype.setTime = function(t) {
    this.currentTime = Math.max(0, Math.min(1, t));
    this.render();
  };

  VertexView.prototype.play = function() {
    if (this.isPlaying) return;
    if (!this.sim || !this.sim.motion) return;
    
    this.isPlaying = true;
    var self = this;
    
    function animate() {
      if (!self.isPlaying) return;
      self.currentTime += 1 / 60;
      if (self.currentTime >= 1) {
        self.currentTime = 0;
      }
      self.render();
      self.animationId = requestAnimationFrame(animate);
    }
    
    animate();
  };

  VertexView.prototype.pause = function() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.render();
  };

  VertexView.prototype.exportPNG = function() {
    return this.canvas.toDataURL('image/png');
  };

  VertexView.prototype.render = function() {
    var ctx = this.ctx;
    var w = this.width;
    var h = this.height;
    
    /* Clear */
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    
    /* Build view matrix: translate to center, scale, rotate, then pan */
    var viewMatrix = mat4Identity();
    viewMatrix = mat4Multiply(viewMatrix, mat4Translate(this.panX, this.panY, 0));
    viewMatrix = mat4Multiply(viewMatrix, mat4RotateX(this.rotationX));
    viewMatrix = mat4Multiply(viewMatrix, mat4RotateY(this.rotationY));
    viewMatrix = mat4Multiply(viewMatrix, mat4Scale(this.zoom * this.modelScale));
    viewMatrix = mat4Multiply(viewMatrix, mat4Translate(-this.center[0], -this.center[1], -this.center[2]));
    
    /* Draw grid */
    if (this.options.grid) {
      this._drawGrid(ctx, w, h, viewMatrix);
    }
    
    /* Draw mesh */
    if (this.mesh && this.mesh.parts) {
      this._drawMesh(ctx, w, h, viewMatrix);
    }
    
    /* Draw crop marks */
    if (this.options.crop) {
      this._drawCropMarks(ctx, w, h);
    }
  };

  /* === Drawing Helpers === */
  VertexView.prototype._drawGrid = function(ctx, w, h, viewMatrix) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    var size = this.radius * 2;
    var step = size / 4.5;
    var y = this.center[1];
    var cx = this.center[0];
    var cz = this.center[2];
    
    for (var i = 0; i <= 9; i++) {
      var pos = -size + i * step;
      /* X lines */
      var p1 = this._project([cx + pos, y, cz - size], viewMatrix, w, h);
      var p2 = this._project([cx + pos, y, cz + size], viewMatrix, w, h);
      if (p1 && p2) {
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
      }
      
      /* Z lines */
      var p3 = this._project([cx - size, y, cz + pos], viewMatrix, w, h);
      var p4 = this._project([cx + size, y, cz + pos], viewMatrix, w, h);
      if (p3 && p4) {
        ctx.moveTo(p3[0], p3[1]);
        ctx.lineTo(p4[0], p4[1]);
      }
    }
    
    ctx.stroke();
  };

  VertexView.prototype._drawMesh = function(ctx, w, h, viewMatrix) {
    var self = this;
    var parts = this.mesh.parts || [];
    
    /* Get motion transform if sim is active */
    var motionTransforms = {};
    if (this.sim && this.sim.motion) {
      var sampleIndex = Math.floor(this.currentTime * (this.sim.motion.length - 1));
      var motionSample = this.sim.motion[sampleIndex];
      if (motionSample && motionSample.transform) {
        motionTransforms[motionSample.part] = motionSample.transform;
      }
    }
    
    parts.forEach(function(part) {
      var vertices = part.vertices || [];
      var triangles = part.triangles || [];
      
      if (vertices.length === 0) return;
      
      /* Apply motion transform if any */
      var partTransform = motionTransforms[part.id] ? motionTransforms[part.id] : mat4Identity();
      var fullTransform = mat4Multiply(viewMatrix, partTransform);
      
      ctx.strokeStyle = GEOMETRY_COLOR;
      ctx.lineWidth = 1.5;
      
      if (self.options.wireframe) {
        /* Draw wireframe */
        ctx.beginPath();
        triangles.forEach(function(tri) {
          var i0 = tri[0], i1 = tri[1], i2 = tri[2];
          if (i0 >= vertices.length || i1 >= vertices.length || i2 >= vertices.length) return;
          
          var p0 = self._project(vertices[i0], fullTransform, w, h);
          var p1 = self._project(vertices[i1], fullTransform, w, h);
          var p2 = self._project(vertices[i2], fullTransform, w, h);
          
          if (p0 && p1 && p2) {
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.closePath();
          }
        });
        ctx.stroke();
      } else {
        /* Draw filled */
        ctx.fillStyle = 'rgba(200, 206, 216, 0.1)';
        triangles.forEach(function(tri) {
          var i0 = tri[0], i1 = tri[1], i2 = tri[2];
          if (i0 >= vertices.length || i1 >= vertices.length || i2 >= vertices.length) return;
          
          var p0 = self._project(vertices[i0], fullTransform, w, h);
          var p1 = self._project(vertices[i1], fullTransform, w, h);
          var p2 = self._project(vertices[i2], fullTransform, w, h);
          
          if (p0 && p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.closePath();
            ctx.fill();
          }
        });
        ctx.stroke();
      }
      
      /* Draw dimension lines if enabled */
      if (self.options.dims) {
        self._drawDimensions(ctx, vertices, fullTransform, w, h);
      }
    });

    /* Draw holes (subtractive features) in a distinct muted-blue stroke */
    if (self.options.showHoles && self.mesh && self.mesh.holes) {
      self.mesh.holes.forEach(function(hole) {
        var hv = hole.vertices || [];
        var ht = hole.triangles || [];
        if (hv.length === 0) return;
        ctx.strokeStyle = HOLE_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ht.forEach(function(tri) {
          var i0 = tri[0], i1 = tri[1], i2 = tri[2];
          if (i0 >= hv.length || i1 >= hv.length || i2 >= hv.length) return;
          var q0 = self._project(hv[i0], viewMatrix, w, h);
          var q1 = self._project(hv[i1], viewMatrix, w, h);
          var q2 = self._project(hv[i2], viewMatrix, w, h);
          if (q0 && q1 && q2) {
            ctx.moveTo(q0[0], q0[1]);
            ctx.lineTo(q1[0], q1[1]);
            ctx.lineTo(q2[0], q2[1]);
            ctx.closePath();
          }
        });
        ctx.stroke();
      });
    }
  };

  VertexView.prototype._drawDimensions = function(ctx, vertices, transform, w, h) {
    if (vertices.length < 2) return;
    
    /* Find model-space bounding box (before transform) */
    var modelMinX = Infinity, modelMaxX = -Infinity;
    var modelMinY = Infinity, modelMaxY = -Infinity;
    var modelMinZ = Infinity, modelMaxZ = -Infinity;
    
    vertices.forEach(function(v) {
      if (v[0] < modelMinX) modelMinX = v[0];
      if (v[0] > modelMaxX) modelMaxX = v[0];
      if (v[1] < modelMinY) modelMinY = v[1];
      if (v[1] > modelMaxY) modelMaxY = v[1];
      if (v[2] < modelMinZ) modelMinZ = v[2];
      if (v[2] > modelMaxZ) modelMaxZ = v[2];
    });
    
    /* Project model-space corners to screen space */
    var p1 = this._project([modelMinX, modelMinY, modelMinZ], transform, w, h);
    var p2 = this._project([modelMaxX, modelMinY, modelMinZ], transform, w, h);
    
    if (!p1 || !p2) return;
    
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    
    /* Draw dimension line */
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1] + 10);
    ctx.lineTo(p2[0], p2[1] + 10);
    ctx.stroke();
    
    /* Arrowheads */
    this._drawArrowhead(ctx, p1[0], p1[1] + 10, 1, 0);
    this._drawArrowhead(ctx, p2[0], p2[1] + 10, -1, 0);
    
    /* Label - model space dimension in mm */
    var label = (modelMaxX - modelMinX).toFixed(1) + ' mm';
    ctx.font = '11px ' + ('SF Mono, Menlo, Consolas, monospace');
    ctx.fillText(label, (p1[0] + p2[0]) / 2 - 20, p1[1] + 25);
    
    ctx.setLineDash([]);
  };

  VertexView.prototype._drawArrowhead = function(ctx, x, y, dx, dy) {
    var size = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * size + dy * size * 0.5, y - dy * size + dx * size * 0.5);
    ctx.lineTo(x - dx * size - dy * size * 0.5, y - dy * size - dx * size * 0.5);
    ctx.closePath();
    ctx.fill();
  };

  VertexView.prototype._drawCropMarks = function(ctx, w, h) {
    var margin = 20;
    var length = 15;
    
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    /* Top-left */
    ctx.moveTo(margin, margin + length);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + length, margin);
    
    /* Top-right */
    ctx.moveTo(w - margin - length, margin);
    ctx.lineTo(w - margin, margin);
    ctx.lineTo(w - margin, margin + length);
    
    /* Bottom-left */
    ctx.moveTo(margin, h - margin - length);
    ctx.lineTo(margin, h - margin);
    ctx.lineTo(margin + length, h - margin);
    
    /* Bottom-right */
    ctx.moveTo(w - margin - length, h - margin);
    ctx.lineTo(w - margin, h - margin);
    ctx.lineTo(w - margin, h - margin - length);
    
    ctx.stroke();
  };

  VertexView.prototype._project = function(point, viewMatrix, w, h) {
    var transformed = transformPoint(point, viewMatrix);
    
    /* Orthographic projection */
    var P = Math.min(w, h) * 0.4;
    var x = w / 2 + transformed[0] * P;
    var y = h / 2 - transformed[1] * P;
    
    /* Return point even if out of bounds (let canvas clip) */
    if (!isFinite(x) || !isFinite(y)) {
      return null;
    }
    return [x, y];
  };

  /* === Export === */
  if (typeof window !== 'undefined') {
    window.VertexView = VertexView;
  }
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VertexView;
  }
})();
