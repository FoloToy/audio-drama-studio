/**
 * Volumetric cloud background — adapted from IQ's Shadertoy shader.
 * Rewritten for standalone WebGL (no iChannel textures needed).
 * Uses hash-based value noise instead of texture lookups.
 */
import { useEffect, useRef } from 'react'

// ── Vertex shader ─────────────────────────────────────────────
const VERT = `
attribute vec2 a_p;
void main() { gl_Position = vec4(a_p, 0.0, 1.0); }
`

// ── Fragment shader ───────────────────────────────────────────
const FRAG = `
precision highp float;
uniform float T;
uniform vec2  R;

/* ── Value noise (replaces iChannel0 texture) ── */
float H(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float N(vec3 x) {
  vec3 ip = floor(x);
  vec3 f  = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  /* Two z-slices packed into 2D hash — mirrors iChannel0 layout */
  vec2 uA = ip.xy + vec2(37.0, 239.0) *  ip.z;
  vec2 uB = ip.xy + vec2(37.0, 239.0) * (ip.z + 1.0);

  float nA = mix(mix(H(uA),           H(uA+vec2(1,0)), f.x),
                 mix(H(uA+vec2(0,1)), H(uA+vec2(1,1)), f.x), f.y);
  float nB = mix(mix(H(uB),           H(uB+vec2(1,0)), f.x),
                 mix(H(uB+vec2(0,1)), H(uB+vec2(1,1)), f.x), f.y);

  return mix(nA, nB, f.z) * 2.0 - 1.0;
}

/* ── Cloud density fBM (LOD controls octave count) ── */
float map(vec3 p, float lod) {
  vec3 q = p - vec3(0.0, 0.1, 1.0) * T;
  float f = 0.5 * N(q);       q *= 2.02;
  if (lod > 1.5) { f += 0.250  * N(q); q *= 2.03; }
  if (lod > 2.5) { f += 0.125  * N(q); q *= 2.01; }
  if (lod > 3.5) { f += 0.0625 * N(q); }
  return clamp(1.5 - p.y - 2.0 + 1.75 * f, 0.0, 1.0);
}

/* ── Camera helper ── */
mat3 makeCam(vec3 ro, vec3 ta, float roll) {
  vec3 cw = normalize(ta - ro);
  vec3 cp = vec3(sin(roll), cos(roll), 0.0);
  vec3 cu = normalize(cross(cw, cp));
  return mat3(cu, normalize(cross(cu, cw)), cw);
}

const vec3 SUN = vec3(-0.7071, 0.0, -0.7071);

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p  = (2.0 * fc - R) / R.y;

  /* Slow auto-rotating camera — no mouse needed */
  float ang = T * 0.025;
  float vy  = 0.38 + 0.07 * sin(T * 0.06);
  vec3  ro  = 4.0 * normalize(vec3(sin(ang), vy, cos(ang))) - vec3(0.0, 0.1, 0.0);
  vec3  ta  = vec3(0.0, -1.0, 0.0);
  vec3  rd  = makeCam(ro, ta, 0.07 * cos(0.25 * T)) * normalize(vec3(p, 1.5));

  /* Sky background (LOOK = 1 palette) */
  float sun = clamp(dot(SUN, rd), 0.0, 1.0);
  vec3  bg  = vec3(0.60, 0.71, 0.75) - rd.y * 0.2 * vec3(1.0, 0.5, 1.0) + 0.075;
  bg += 0.2 * vec3(1.0, 0.6, 0.1) * pow(sun, 8.0);

  /* Raymarching — dithered start offset replaces iChannel1 */
  vec4  sum = vec4(0.0);
  float t   = 0.05 * H(fc * 0.137 + 7.53);

  for (int i = 0; i < 80; i++) {
    vec3 pos = ro + t * rd;
    if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;

    float lod = max(1.0, 4.0 - log2(1.0 + t * 0.5));
    float den = map(pos, lod);

    if (den > 0.01) {
      float dif = clamp((den - map(pos + 0.3 * SUN, lod)) / 0.6, 0.0, 1.0);
      vec3  lin = vec3(1.0, 0.6, 0.3) * dif + vec3(0.91, 0.98, 1.05);
      vec4  col = vec4(mix(vec3(1.0, 0.95, 0.8), vec3(0.25, 0.3, 0.35), den), den);
      col.xyz *= lin;
      col.xyz  = mix(col.xyz, bg, 1.0 - exp(-0.003 * t * t));
      col.w   *= 0.4;
      col.rgb *= col.a;
      sum += col * (1.0 - sum.a);
    }
    t += max(0.06, 0.05 * t);
  }
  sum = clamp(sum, 0.0, 1.0);

  /* Composite sky + clouds + sun glare */
  vec3 col = bg * (1.0 - sum.w) + sum.xyz;
  col += vec3(0.2, 0.08, 0.04) * pow(sun, 3.0);

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.warn('[CloudCanvas] shader error:', gl.getShaderInfoLog(s))
  return s
}

export default function CloudCanvas({ className, style }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    const gl = cv.getContext('webgl', {
      antialias: false, alpha: false, powerPreference: 'high-performance',
    })
    if (!gl) { console.warn('[CloudCanvas] WebGL not available'); return }

    /* ── Build program ── */
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER,   VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.warn('[CloudCanvas] link error:', gl.getProgramInfoLog(prog))
    gl.useProgram(prog)

    /* ── Full-screen quad ── */
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const aLoc = gl.getAttribLocation(prog, 'a_p')
    gl.enableVertexAttribArray(aLoc)
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)

    const uT = gl.getUniformLocation(prog, 'T')
    const uR = gl.getUniformLocation(prog, 'R')

    /* ── Resize at half resolution for performance ── */
    const SCALE = 0.5
    const resize = () => {
      const w = Math.max(1, Math.floor(cv.clientWidth  * SCALE))
      const h = Math.max(1, Math.floor(cv.clientHeight * SCALE))
      if (cv.width !== w || cv.height !== h) {
        cv.width = w; cv.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    /* ── Render loop (capped at 24 fps) ── */
    const t0 = performance.now()
    const MS  = 1000 / 24
    let last = 0, raf

    const frame = now => {
      raf = requestAnimationFrame(frame)
      if (now - last < MS) return
      last = now
      gl.uniform1f(uT, (now - t0) * 0.001)
      gl.uniform2f(uR, cv.width, cv.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
    />
  )
}
