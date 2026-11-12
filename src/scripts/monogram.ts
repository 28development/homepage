/**
 * The object on the poster: the initials U and T and a red full stop, as
 * one soft clay form floating over the butter ground, inside a red orbit.
 *
 * Drawn by ray marching a signed distance field in a single fragment
 * shader, so there is no 3D library and no model to download. The canvas
 * is transparent: the form is opaque, the ground only receives its shadow.
 */

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_turn;   // yaw, pitch
uniform float u_in;    // 0..1 entrance
uniform float u_away;  // 0..1 scrolled away
uniform float u_shadow; // 0 or 1: draw the shadow on the ground
uniform vec3 u_butter;
uniform vec3 u_ink;
uniform vec3 u_red;
out vec4 color;

const float GROUND = -1.34;
const vec3 CENTRE = vec3(0.0, -0.15, 0.0);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float box2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// A flat outline pushed into depth, with soft edges.
float extrude(float d2, float z, float h, float r) {
  vec2 w = vec2(d2, abs(z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}

float letterU(vec2 p) {
  const float R = 0.55, H = 0.75;
  float d = p.y > 0.0 ? length(vec2(abs(p.x) - R, max(p.y - H, 0.0))) : abs(length(p) - R);
  return d - 0.15;
}

float letterT(vec2 p) {
  return min(box2(p - vec2(0.0, 0.5), vec2(0.58, 0.15)), box2(p - vec2(0.0, -0.2), vec2(0.15, 0.75)));
}

// Into the turning frame of the object.
vec3 toObject(vec3 p) {
  p -= CENTRE;
  p.y -= 0.05 * sin(u_time * 0.9) - (1.0 - u_in) * 0.9 + u_away * 0.5;
  p.xz *= rot(u_turn.x + (1.0 - u_in) * 1.9);
  p.yz *= rot(u_turn.y);
  return p + CENTRE;
}

// x: distance, y: material (1 butter, 2 ink, 3 red, 4 orbit)
vec2 form(vec3 q) {
  vec2 pu = q.xy - vec2(-0.97, -0.25);
  float u = extrude(letterU(pu), q.z, 0.2, 0.05);
  // The two ends of the U are dipped in ink.
  float matU = pu.y > 0.52 ? 2.0 : 1.0;
  float t = extrude(letterT(q.xy - vec2(0.58, 0.0)), q.z, 0.2, 0.05);
  float stop = length(q - vec3(1.5, -0.81, 0.0)) - 0.19;
  vec2 res = vec2(u, matU);
  if (t < res.x) res = vec2(t, 2.0);
  if (stop < res.x) res = vec2(stop, 3.0);
  return res;
}

// Two orbits, each with something travelling on it.
// 3 red satellite, 4 red orbit, 5 ink orbit, 2 ink satellite
vec2 orbits(vec3 p) {
  p -= CENTRE;

  vec3 a = p;
  a.xy *= rot(-0.2);
  a.yz *= rot(1.24);
  float ring = length(vec2(length(a.xy) - 2.22, a.z)) - 0.012;
  float ta = u_time * 0.55 + 0.6;
  float moon = length(a - vec3(2.22 * cos(ta), 2.22 * sin(ta), 0.0)) - 0.085;
  vec2 res = vec2(ring, 4.0);
  if (moon < res.x) res = vec2(moon, 3.0);

  vec3 b = p;
  b.xy *= rot(0.5);
  b.yz *= rot(1.02);
  float thin = length(vec2(length(b.xy) - 1.78, b.z)) - 0.006;
  float tb = -u_time * 0.8 + 2.4;
  float bead = length(b - vec3(1.78 * cos(tb), 1.78 * sin(tb), 0.0)) - 0.05;
  if (thin < res.x) res = vec2(thin, 5.0);
  if (bead < res.x) res = vec2(bead, 2.0);
  return res;
}

vec2 scene(vec3 p) {
  vec2 res = form(toObject(p));
  vec2 o = orbits(p);
  if (o.x < res.x) res = o;
  return res;
}

float solid(vec3 p) { return form(toObject(p)).x; }

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    scene(p + e.xyy).x - scene(p - e.xyy).x,
    scene(p + e.yxy).x - scene(p - e.yxy).x,
    scene(p + e.yyx).x - scene(p - e.yyx).x));
}

float shadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 30; i++) {
    float h = solid(ro + rd * t);
    res = min(res, k * h / t);
    t += clamp(h, 0.03, 0.4);
    if (res < 0.005 || t > 7.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float occlusion(vec3 p, vec3 n) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.06 * float(i);
    occ += (h - solid(p + n * h)) * scale;
    scale *= 0.72;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_res) / u_res.y;
  vec3 ro = vec3(0.0, 0.2, 7.4);
  vec3 target = vec3(0.0, -0.32, 0.0);
  vec3 f = normalize(target - ro);
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, f);
  vec3 rd = normalize(f * 3.9 + r * uv.x + u * uv.y);
  vec3 light = normalize(vec3(-0.45, 0.95, 0.5));

  float t = 0.0;
  vec2 hit = vec2(0.0);
  bool found = false;
  for (int i = 0; i < 80; i++) {
    hit = scene(ro + rd * t);
    if (hit.x < 0.0015) { found = true; break; }
    t += hit.x * 0.92;
    if (t > 14.0) break;
  }

  float ground = rd.y < 0.0 ? (GROUND - ro.y) / rd.y : 1e9;

  if (found && t < ground) {
    vec3 p = ro + rd * t;
    if (hit.y > 4.5) {
      color = vec4(pow(u_ink, vec3(1.0 / 2.2)), 1.0);
      return;
    }
    if (hit.y > 3.5) {
      // The red orbit glows; it is the only thing that does.
      color = vec4(pow(u_red, vec3(1.0 / 2.2)) * 1.02, 1.0);
      return;
    }
    vec3 n = normalAt(p);
    vec3 albedo = hit.y < 1.5 ? u_butter : hit.y < 2.5 ? u_ink : u_red;
    float lit = clamp(dot(n, light), 0.0, 1.0) * shadow(p + n * 0.01, light, 9.0);
    float ao = occlusion(p, n);
    float sky = 0.5 + 0.5 * n.y;
    vec3 col = albedo * (lit * 0.56 + (0.5 + 0.26 * sky) * ao);
    // Light bounced up from the butter ground.
    col += albedo * u_butter * 0.16 * clamp(-n.y, 0.0, 1.0);
    vec3 h = normalize(light - rd);
    float sheen = pow(clamp(dot(n, h), 0.0, 1.0), 26.0) * lit;
    float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    float gloss = hit.y > 1.5 && hit.y < 2.5 ? 1.0 : 0.35;
    col += vec3(1.0, 0.97, 0.9) * (sheen * 0.22 + rim * 0.09 * ao) * gloss;
    color = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  if (ground < 1e8) {
    // The ground is the page itself: only the shadow is drawn.
    vec3 p = ro + rd * ground;
    float sh = shadow(p + vec3(0.0, 0.01, 0.0), light, 5.0);
    float near = clamp(solid(p) / 0.9, 0.0, 1.0);
    float dark = (1.0 - sh) * 0.26 + (1.0 - near) * (1.0 - near) * 0.22;
    float fade = smoothstep(4.6, 1.2, length(p.xz - vec2(0.0, 0.4)));
    float a = dark * fade * u_in * u_shadow;
    color = vec4(vec3(0.3, 0.2, 0.02) * a, a);
    return;
  }
  color = vec4(0.0);
}`;

function srgbToLinear(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '');
  const n = parseInt(value.length === 3 ? value.replace(/./g, (c) => c + c) : value, 16);
  const channel = (v: number) => Math.pow(v / 255, 2.2);
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}

function start(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
  });
  const stage = canvas.parentElement;
  if (!gl || !stage) {
    canvas.dataset.state = 'unsupported';
    return;
  }

  let program: WebGLProgram | null = null;
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const build = (): boolean => {
    const make = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    program = gl.createProgram()!;
    gl.attachShader(program, make(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, make(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    for (const name of ['u_res', 'u_time', 'u_turn', 'u_in', 'u_away', 'u_shadow', 'u_butter', 'u_ink', 'u_red']) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    const style = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    // The form is a shade lighter than the ground so it reads against it.
    gl.uniform3fv(uniforms.u_butter, srgbToLinear('#fdf1b4'));
    gl.uniform3fv(uniforms.u_ink, srgbToLinear(token('--ink', '#17171b')).map((v) => v + 0.012));
    gl.uniform3fv(uniforms.u_red, srgbToLinear(token('--accent', '#e8173a')));
    // Over type the shadow would smear the letters, so it can be switched off.
    gl.uniform1f(uniforms.u_shadow, canvas.dataset.shadow === 'off' ? 0 : 1);
    gl.bindVertexArray(gl.createVertexArray());
    return true;
  };
  if (!build()) {
    canvas.dataset.state = 'unsupported';
    return;
  }

  const root = document.documentElement;
  const reduced = () => root.dataset.motion !== 'full';

  // Resolution: sharp where the device allows, eased off if frames run long.
  let quality = 1;
  let width = 0;
  let height = 0;
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(2, dpr < 1.5 ? 1.5 : dpr) * quality;
    width = Math.max(2, Math.round(bounds.width * scale));
    height = Math.max(2, Math.round(bounds.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  // Pointer: the form turns a little towards it, and can be grabbed and spun.
  const aim = { x: 0, y: 0 };
  const turn = { x: -0.32, y: 0.06 };
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0, lastT: 0 };
  const hero = canvas.closest<HTMLElement>('[data-hero]') ?? stage;
  window.addEventListener(
    'pointermove',
    (event) => {
      if (spin.dragging) {
        const now = performance.now();
        const dx = event.clientX - spin.lastX;
        const dt = Math.max(1, now - spin.lastT);
        spin.angle += dx * 0.009;
        spin.velocity = (dx * 0.009) / dt;
        spin.lastX = event.clientX;
        spin.lastT = now;
        return;
      }
      if (event.pointerType === 'touch') return;
      aim.x = (event.clientX / window.innerWidth - 0.5) * 0.95;
      aim.y = (event.clientY / window.innerHeight - 0.5) * 0.3;
    },
    { passive: true },
  );
  hero.addEventListener('pointerdown', (event) => {
    if (reduced()) return;
    if ((event.target as Element).closest('a, button, input, nav')) return;
    spin.dragging = true;
    spin.velocity = 0;
    spin.lastX = event.clientX;
    spin.lastT = performance.now();
    hero.classList.add('is-grabbing');
  });
  const release = () => {
    if (!spin.dragging) return;
    spin.dragging = false;
    hero.classList.remove('is-grabbing');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  let frame = 0;
  let visible = true;
  let born = 0;
  let last = 0;
  let slow = 0;

  const draw = (now: number) => {
    frame = 0;
    if (!program) return;
    if (!born) born = now;
    const still = reduced();
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;

    // Ease the resolution down on devices that cannot keep up.
    if (!still && now - born > 1500) {
      slow = dt > 26 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 20 && quality > 0.5) {
        quality *= 0.82;
        slow = 0;
        resize();
      }
    }

    const time = still ? 0 : (now - born) / 1000;
    const entrance = still ? 1 : 1 - Math.pow(1 - Math.min(1, time / 1.5), 3);
    const sway = still ? 0 : Math.sin(time * 0.45) * 0.3;
    const ease = Math.min(1, dt * 0.004);
    turn.x += (-0.18 + aim.x + sway - turn.x) * (still ? 1 : ease);
    turn.y += (0.06 + aim.y - turn.y) * (still ? 1 : ease);
    // A spin keeps going after the hand lets go, then settles on the nearest front view.
    if (!spin.dragging) {
      spin.angle += spin.velocity * dt;
      spin.velocity *= Math.pow(0.996, dt);
      if (Math.abs(spin.velocity) < 0.0006) {
        const rest = Math.round(spin.angle / (Math.PI * 2)) * Math.PI * 2;
        spin.angle += (rest - spin.angle) * Math.min(1, dt * 0.0022);
      }
    }
    const away = still ? 0 : Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight)));
    if (still) {
      turn.x = -0.36;
      turn.y = 0.07;
      spin.angle = 0;
    }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.u_res, width, height);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform2f(uniforms.u_turn, turn.x + spin.angle + away * 1.5, turn.y);
    gl.uniform1f(uniforms.u_away, away);
    gl.uniform1f(uniforms.u_in, entrance);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.state = 'running';

    if (!still && visible) frame = requestAnimationFrame(draw);
  };

  const schedule = () => {
    if (!frame && visible) {
      last = 0;
      frame = requestAnimationFrame(draw);
    }
  };

  new ResizeObserver(() => {
    resize();
    schedule();
  }).observe(stage);
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) schedule();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }).observe(canvas);
  document.addEventListener('motionchange', schedule);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    program = null;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (build()) schedule();
  });

  resize();
  schedule();
}

const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-monogram]');
if (canvas) {
  const go = () => start(canvas);
  if (document.documentElement.classList.contains('is-ready')) go();
  else document.addEventListener('site:ready', go, { once: true });
}
