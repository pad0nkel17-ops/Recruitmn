@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Playfair Display", serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

:root {
  --bg: #0A0A0B;
  --surface: #141416;
  --border: #2D2D30;
  --accent: #D4AF37;
  --text-primary: #E1E1E6;
  --text-secondary: #94949E;
  --success: #4ADE80;
}

@layer base {
  body {
    @apply antialiased text-[#E1E1E6] bg-[#0A0A0B];
    font-family: var(--font-sans);
  }
}

.selection-accent *::selection {
  background-color: rgba(212, 175, 55, 0.3);
}

/* Custom scrollbar for sophisticated look */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: var(--bg);
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}
