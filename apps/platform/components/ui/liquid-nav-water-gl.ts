/**
 * WebGL renderer for the sidebar's liquid drop.
 *
 * Adapted from Nimbus UI "Waterline" (guglielmogiannattasio.it): the same
 * signed-distance drop, lens normals, specular, caustics and ripple field,
 * turned vertical for a sidebar. The original's pill-edge lens is dropped:
 * the sidebar already draws its own panel, so only the drop, its shadow,
 * ripples and the cursor meniscus are rendered. A flat surface renders fully
 * transparent, so nothing shows outside the water.
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
float H(vec2 p){float da=areaD(p);return lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-da);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=areaD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.y*.0028+uTime*.035));
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*(.11+.07*uDark);
 vec3 c=vec3(0.,.14,.36)*sh;float a=sh;
 float pa=clamp(pm*(fres*.5+spec*.9+spec2),0.,1.);
 c=mix(vec3(1.),irid,.5*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 vec3 tint=mix(vec3(.80,.95,1.),vec3(.55,.82,1.),uDark);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.26+.14*body)*(1.-.35*uDark);vec3 dc=mix(tint,vec3(1.),body*.6);
 float la=rim*.22;vec3 lc=mix(vec3(0.,.42,.78),vec3(.1,.55,.95),uDark);dc=lc*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.35)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
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
