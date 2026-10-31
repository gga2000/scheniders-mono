/**
 * WebGL renderer for the sidebar's liquid drop.
 *
 * Adapted from Nimbus UI "Waterline" (guglielmogiannattasio.it): the same
 * signed-distance drop, lens normals and ripple field, turned vertical for a
 * sidebar and shaded far more quietly: a frosted fill, a hairline rim and one
 * soft highlight. No pill-edge lens, iridescence or caustics. A flat surface
 * renders fully transparent, so nothing shows outside the water.
 */

import { MAX_BLOBS, MAX_RIPPLES } from "./liquid-nav-water-physics";

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uArea;
uniform vec4 uBlob[${MAX_BLOBS}];uniform float uSy[${MAX_BLOBS}];uniform vec4 uRip[${MAX_RIPPLES}];
uniform vec3 uMouse;uniform float uDark;uniform float uAmb;
float sdBox(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<${MAX_BLOBS};i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float areaD(vec2 p){vec2 h=uArea.zw*.5;return sdBox(p-uArea.xy-h,h);}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<${MAX_RIPPLES};i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.*exp(-dot(m,m)/1000.);
 w+=uAmb*.6*(sin(p.y*.05+uTime*1.2)*.45+sin(p.y*.13-uTime*.85+p.x*.2)*.25);return w;}
float H(vec2 p){float da=areaD(p);return lens(dropD(p),11.)*4.+waves(p)*smoothstep(0.,7.,-da);}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=areaD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),vec3(0.,0.,1.)),0.),60.);
 float fres=clamp((1.-n.z)*4.,0.,1.);
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 vec3 tone=mix(vec3(.05,.08,.15),vec3(1.),uDark);
 // faint contact shadow under the drop
 float a=smoothstep(6.,-6.,dropD(p-vec2(0.,3.)))*(1.-dm)*pm*.05;vec3 c=vec3(0.);
 // ripples and the cursor meniscus: a barely-there sheen
 float l=clamp(pm*(fres*.12+spec*.2),0.,1.);c=tone*l+c*(1.-l);a=l+a*(1.-l);
 // the drop: frosted fill, a little brighter toward the top, hairline rim, one soft highlight
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 l=dm*(.06+.03*body);c=tone*l+c*(1.-l);a=l+a*(1.-l);
 l=dm*smoothstep(-1.5,0.,dd)*.14;c=tone*l+c*(1.-l);a=l+a*(1.-l);
 l=clamp(dm*spec*.3,0.,1.);c=tone*l+c*(1.-l);a=l+a*(1.-l);
 gl_FragColor=vec4(c,a);
}`;

const UNIFORMS = ["uRes", "uDpr", "uTime", "uArea", "uBlob", "uSy", "uRip", "uMouse", "uDark", "uAmb"] as const;
type UniformName = (typeof UNIFORMS)[number];

export type WaterGL = {
    gl: WebGLRenderingContext;
    u: Record<UniformName, WebGLUniformLocation | null>;
};

export type WaterFrame = {
    /** Canvas size in CSS pixels (nav area plus padding on each side). */
    width: number;
    height: number;
    dpr: number;
    time: number;
    /** Nav area inside the canvas: x, y, width, height. */
    area: [number, number, number, number];
    blobs: Float32Array;
    stretch: Float32Array;
    ripples: Float32Array;
    mouse: [number, number, number];
    dark: boolean;
    ambient: number;
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
}

/**
 * Returns null when WebGL is missing or the shader is rejected; the caller then
 * shows the CSS drop instead. That is the designed fallback, not an error.
 */
export function createWaterGL(canvas: HTMLCanvasElement): WaterGL | null {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One oversized triangle covers the whole canvas.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<UniformName, WebGLUniformLocation | null>;
    return { gl, u };
}

export function drawWater({ gl, u }: WaterGL, f: WaterFrame): void {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(u.uRes, f.width, f.height);
    gl.uniform1f(u.uDpr, f.dpr);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform4f(u.uArea, ...f.area);
    gl.uniform4fv(u.uBlob, f.blobs);
    gl.uniform1fv(u.uSy, f.stretch);
    gl.uniform4fv(u.uRip, f.ripples);
    gl.uniform3f(u.uMouse, ...f.mouse);
    gl.uniform1f(u.uDark, f.dark ? 1 : 0);
    gl.uniform1f(u.uAmb, f.ambient);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}
