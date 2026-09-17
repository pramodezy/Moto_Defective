/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fc',
          400: '#36abf8',
          500: '#0c8fe9',
          600: '#0070c7',
          700: '#0159a2',
          800: '#064b85',
          900: '#0a3f6e',
          950: '#072849',
        },
        moto: {
          navy: '#001489',
          card: '#FFFFFF',
          cardHover: '#F8FAFC',
          cyan: '#0057B8',
          blue: '#0057B8',
          border: '#E2E8F0',
        },
        swiss: {
          canvas: '#F8FAFC',
          card: '#FFFFFF',
          subsurface: '#F1F5F9',
          border: '#E2E8F0',
          borderStrong: '#CBD5E1',
          navy: '#001489',
          blue: '#0057B8',
          blueHover: '#00438F',
          textMain: '#0F172A',
          textMuted: '#64748B',
          textSub: '#475569',
        },
        sla: {
          critical: '#DC2626',
          high: '#D97706',
          normal: '#059669',
        }
      },
      fontFamily: {
        outfit: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
