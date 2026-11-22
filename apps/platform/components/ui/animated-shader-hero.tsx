"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Animated shader hero, adapted from 21st.dev "animated-shader-hero"
 * (shader by Matthias Hurrle, @atzedent). Changes from the original:
 * - Fermi palette as uniforms (ink ground, lime light, pale cores) instead of
 *   orange-on-black, and half the original speed so the eye can rest on it.
 * - Sized to its own box (not the window), rendered at a capped resolution,
 *   paused when off screen or the tab is hidden, 30 fps on small screens.
 * - One still frame under prefers-reduced-motion; a CSS gradient when WebGL2
 *   is unavailable (the canvas is then never drawn).
 * - The original's unused pointer tracking is gone.
 */

export interface ShaderPalette {
    /** The ground the light sits on. */
    base: string;
    /** The glow colour. */
    glow: string;
    /** The thin bright cores of the strands. */
    core: string;
}

export const FERMI_INK_PALETTE: ShaderPalette = { base: "#1E1E1E", glow: "#EFFF00", core: "#FCFFE0" };

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform vec3 baseColor;
uniform vec3 glowColor;
uniform vec3 coreColor;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
float noise(in vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  float a=rnd(i),b=rnd(i+vec2(1,0)),c=rnd(i+vec2(0,1)),d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float t=.0,a=1.;mat2 m=mat2(1.,-.5,.2,1.2);
  for(int i=0;i<5;i++){t+=a*noise(p);p*=2.*m;a*=.5;}return t;}
float clouds(vec2 p){float d=1.,t=.0;
  for(float i=.0;i<3.;i++){float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);t=mix(t,d,a);d=a;p*=2./(i+1.);}
  return t;}
void main(void){
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for(float i=1.;i<12.;i++){
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  float g=dot(col,vec3(.4,.4,.2));
  vec3 ground=baseColor+glowColor*.05*clamp(bg,0.,1.);
  vec3 lit=mix(ground,glowColor,smoothstep(.1,1.,g)*.9);
  O=vec4(mix(lit,coreColor,smoothstep(.9,2.2,g)*.8),1);
}`;

function hexToRgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Program {
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    resolution: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
}

/** Compiles the shader and fills the screen quad. Null when WebGL2 or the shader is unavailable. */
function createProgram(canvas: HTMLCanvasElement, palette: ShaderPalette): Program | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return null;
    const compile = (type: number, src: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
        console.error("[shader-hero] compile failed:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[shader-hero] link failed:", gl.getProgramInfoLog(program));
        return null;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(gl.getUniformLocation(program, "baseColor"), hexToRgb(palette.base));
    gl.uniform3fv(gl.getUniformLocation(program, "glowColor"), hexToRgb(palette.glow));
    gl.uniform3fv(gl.getUniformLocation(program, "coreColor"), hexToRgb(palette.core));
    return {
        gl,
        program,
        resolution: gl.getUniformLocation(program, "resolution"),
        time: gl.getUniformLocation(program, "time"),
    };
}

/** Rendered pixels per CSS pixel: the shader is soft, so a low resolution looks the same and costs far less. */
const RENDER_SCALE = 0.5;
/** Shader seconds per real second: half the original speed. */
const SPEED = 0.5;
/** Where the still frame for reduced motion is taken. */
const STILL_TIME = 6;

/** A full-bleed canvas running the Fermi shader, sized to its parent. */
export function ShaderCanvas({ palette = FERMI_INK_PALETTE, className }: { palette?: ShaderPalette; className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = createProgram(canvas, palette);
        if (!ctx) {
            canvas.hidden = true; // the parent's gradient shows instead
            return;
        }
        const { gl } = ctx;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const frameMs = window.matchMedia("(max-width: 767px)").matches ? 1000 / 30 : 0;

        const draw = (seconds: number) => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(ctx.resolution, canvas.width, canvas.height);
            gl.uniform1f(ctx.time, seconds);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(rect.width * RENDER_SCALE));
            canvas.height = Math.max(1, Math.round(rect.height * RENDER_SCALE));
            if (still) draw(STILL_TIME);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        if (still) return () => observer.disconnect();

        let raf = 0;
        let visible = true;
        let last = 0;
        let clock = STILL_TIME;
        let prev = performance.now();
        const loop = (now: number) => {
            raf = requestAnimationFrame(loop);
            clock += ((now - prev) / 1000) * SPEED;
            prev = now;
            if (frameMs && now - last < frameMs) return;
            last = now;
            draw(clock);
        };
        const start = () => {
            if (raf || !visible || document.hidden) return;
            prev = performance.now();
            raf = requestAnimationFrame(loop);
        };
        const stop = () => {
            cancelAnimationFrame(raf);
            raf = 0;
        };
        const io = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) start();
            else stop();
        });
        io.observe(canvas);
        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener("visibilitychange", onVisibility);
        start();
        return () => {
            stop();
            io.disconnect();
            observer.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            gl.deleteProgram(ctx.program);
        };
    }, [palette]);

    return <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 h-full w-full", className)} />;
}

export interface AnimatedShaderHeroProps {
    /** Top row: brand mark, a small pill. */
    badge?: ReactNode;
    /** Headline, one entry per line; the last line sits on a lime block. */
    lines: string[];
    subtitle?: string;
    /** Anything under the subtitle: proof points, a call to action. */
    children?: ReactNode;
    /** Text direction for the copy (the page itself stays LTR). */
    dir?: "ltr" | "rtl";
    className?: string;
    /** Extra classes for the headline, e.g. a display font. */
    headlineClassName?: string;
    /** Extra classes for the subtitle, e.g. hiding it on phones. */
    subtitleClassName?: string;
}

/** The shader on ink with a staggered headline, subtitle and slot over it. */
export function AnimatedShaderHero({ badge, lines, subtitle, children, dir, className, headlineClassName, subtitleClassName }: AnimatedShaderHeroProps) {
    return (
        <section
            className={cn(
                "relative isolate overflow-hidden bg-[#1E1E1E] bg-[radial-gradient(70%_55%_at_20%_100%,rgba(239,255,0,0.28),transparent)]",
                className,
            )}
        >
            <ShaderCanvas />
            {/* An ink wash from the copy's side keeps the text on calm ground; the light plays on the far side. */}
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-0",
                    dir === "rtl"
                        ? "bg-[linear-gradient(to_left,rgba(30,30,30,0.92)_0%,rgba(30,30,30,0.7)_45%,rgba(30,30,30,0.15)_100%)]"
                        : "bg-[linear-gradient(to_right,rgba(30,30,30,0.92)_0%,rgba(30,30,30,0.7)_45%,rgba(30,30,30,0.15)_100%)]",
                )}
            />
            <div dir={dir} className="relative z-10 flex h-full flex-col px-6 py-6 sm:px-12 sm:py-10 lg:px-16 lg:py-14">
                {badge && <div className="shader-hero-rise [animation-delay:0ms]">{badge}</div>}
                <div className="flex flex-1 flex-col justify-center gap-4 pt-5 sm:gap-7 lg:pt-0">
                    <h2 className={cn("text-[#F4EFE9] font-extrabold leading-[1.25] tracking-tight", headlineClassName)}>
                        {lines.map((line, i) => (
                            <span
                                key={line}
                                className="shader-hero-rise me-[0.3em] inline-block lg:me-0 lg:block"
                                style={{ animationDelay: `${120 + i * 110}ms` }}
                            >
                                {i === lines.length - 1 ? (
                                    <span className="inline-block rounded-[0.18em] bg-[#EFFF00] px-[0.22em] text-[#1E1E1E]">{line}</span>
                                ) : (
                                    line
                                )}
                            </span>
                        ))}
                    </h2>
                    {subtitle && (
                        <p
                            className={cn("shader-hero-rise max-w-md text-[16px] leading-relaxed text-[#C9C4B8]", subtitleClassName)}
                            style={{ animationDelay: `${160 + lines.length * 110}ms` }}
                        >
                            {subtitle}
                        </p>
                    )}
                    {children && (
                        <div className="shader-hero-rise" style={{ animationDelay: `${260 + lines.length * 110}ms` }}>
                            {children}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
