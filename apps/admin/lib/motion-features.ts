// The animation engine for the console's frame (sidebar, bell, search box).
// It loads after the page, through LazyMotion in AdminShell, so the first
// paint of every page does not wait for it.
export { domAnimation as default } from "framer-motion";
