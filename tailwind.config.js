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
          navy: '#0b1329',
          card: '#131e3d',
          cardHover: '#18274f',
          cyan: '#00d2ff',
          blue: '#0077ff',
          border: '#1f2e5a',
        },
        sla: {
          critical: '#ef4444',
          high: '#f59e0b',
          normal: '#10b981',
        }
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
