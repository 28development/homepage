/**
 * Draws the ink. WebGL2.
 *
 * Every particle leaves a short stroke each frame. The strokes are written
 * into an offscreen "ink" texture with MAX blending (crossing lines keep one
 * tone instead of piling up), the whole texture loses a fixed amount each
 * frame (so old ink reaches exactly zero, no ghosting), and a last pass
 * tints it with the page's ink colour on a transparent canvas.
 */

const SEGMENT_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec3 a_data; // side (-1..1), value, half width in css px
uniform vec2 u_size;
out vec3 v_data;
void main() {
  v_data = a_data;
  vec2 clip = a_pos / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SEGMENT_FS = `#version 300 es
precision mediump float;
in vec3 v_data;
uniform float u_dpr;
out vec4 color;
void main() {
  // One device pixel of soft edge on each side of the stroke.
  float edge = clamp((1.0 - abs(v_data.x)) * v_data.z * u_dpr, 0.0, 1.0);
  color = vec4(v_data.y * edge);
}`;

const SCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FILL_FS = `#version 300 es
precision mediump float;
uniform float u_value;
out vec4 color;
void main() { color = vec4(u_value); }`;

const PRESENT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_ink;
uniform vec3 u_colour;
uniform float u_alpha;
out vec4 color;
void main() {
  float a = texture(u_ink, v_uv).r * u_alpha;
  color = vec4(u_colour * a, a);
}`;

/** Floats per vertex: x, y, side, value, half width. */
export const VERTEX_FLOATS = 5;
/** Vertices per stroke (a quad). */
export const STROKE_VERTICES = 4;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export class Trails {
  readonly gl: WebGL2RenderingContext;
  private segment!: WebGLProgram;
  private fill!: WebGLProgram;
  private presentProgram!: WebGLProgram;
  private strokes!: WebGLVertexArrayObject;
  private screen!: WebGLVertexArrayObject;
  private vertexBuffer!: WebGLBuffer;
  private indexBuffer!: WebGLBuffer;
  private target: WebGLFramebuffer | null = null;
  private ink: WebGLTexture | null = null;
  private capacity = 0;
  private width = 1;
  private height = 1;
  private pixelWidth = 1;
  private pixelHeight = 1;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.setup();
  }

  /** (Re)creates every GL object. Also called after a restored context. */
  setup(): void {
    const gl = this.gl;
    this.segment = link(gl, SEGMENT_VS, SEGMENT_FS);
    this.fill = link(gl, SCREEN_VS, FILL_FS);
    this.presentProgram = link(gl, SCREEN_VS, PRESENT_FS);

    this.strokes = gl.createVertexArray()!;
    gl.bindVertexArray(this.strokes);
    this.vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 8);
    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);

    this.screen = gl.createVertexArray()!;
    this.capacity = 0;
    this.target = null;
    this.ink = null;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /** Room for `count` strokes per draw call. */
  reserve(count: number): void {
    if (count <= this.capacity) return;
    const gl = this.gl;
    this.capacity = count;
    gl.bindVertexArray(this.strokes);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, count * STROKE_VERTICES * VERTEX_FLOATS * 4, gl.DYNAMIC_DRAW);
    const indices = new Uint32Array(count * 6);
    for (let q = 0; q < count; q++) {
      const v = q * 4;
      const o = q * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v + 2;
      indices[o + 4] = v + 1;
      indices[o + 5] = v + 3;
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number, dpr: number): void {
    const gl = this.gl;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.pixelWidth = Math.max(1, Math.round(width * dpr));
    this.pixelHeight = Math.max(1, Math.round(height * dpr));
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;

    if (this.ink) gl.deleteTexture(this.ink);
    if (this.target) gl.deleteFramebuffer(this.target);
    this.ink = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ink);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.pixelWidth,
      this.pixelHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.target = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ink, 0);
    this.clear();
  }

  /** Empties the ink texture. */
  clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Removes `levels`/255 of ink everywhere. */
  fade(levels: number): void {
    if (levels <= 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.fill);
    gl.uniform1f(gl.getUniformLocation(this.fill, 'u_value'), levels / 255);
    gl.bindVertexArray(this.screen);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Writes `count` strokes from `vertices` into the ink texture. */
  strokesFrom(vertices: Float32Array, count: number): void {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.segment);
    gl.uniform2f(gl.getUniformLocation(this.segment, 'u_size'), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this.segment, 'u_dpr'), this.dpr);
    gl.bindVertexArray(this.strokes);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      vertices,
      0,
      count * STROKE_VERTICES * VERTEX_FLOATS,
    );
    gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_INT, 0);
  }

  /** Tints the ink and puts it on the canvas. */
  present(colour: [number, number, number], alpha: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.presentProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ink);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'u_ink'), 0);
    gl.uniform3f(
      gl.getUniformLocation(this.presentProgram, 'u_colour'),
      colour[0],
      colour[1],
      colour[2],
    );
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, 'u_alpha'), alpha);
    gl.bindVertexArray(this.screen);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
