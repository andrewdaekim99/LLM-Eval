// Test-only stub for the "server-only" package. The real module throws when
// imported outside an RSC bundle; we replace it with an empty module so
// server-component-shaped code can be exercised under jsdom.
export {};
