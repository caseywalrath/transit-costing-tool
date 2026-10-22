// Lets tests read fixture files as text through Vite's `?raw` import.
declare module '*?raw' {
  const text: string;
  export default text;
}
