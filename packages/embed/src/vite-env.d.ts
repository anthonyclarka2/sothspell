/// <reference types="vite/client" />

// The embed build inlines its shadow-DOM stylesheet into the bundle so a host
// page cannot restyle the player and the player cannot leak styles into the
// host document. The `?inline` suffix is what turns the CSS module into a
// string at build time.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
