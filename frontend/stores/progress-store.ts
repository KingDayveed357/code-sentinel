import { create } from 'zustand';

interface ProgressState {
  isAnimating: boolean;
  progress: number;
  start: () => void;
  done: () => void;
  
  // Internal timers
  _startTimeout?: NodeJS.Timeout;
  _trickleInterval?: NodeJS.Timeout;
  _resetTimeout?: NodeJS.Timeout;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  isAnimating: false,
  progress: 0,
  _startTimeout: undefined,
  _trickleInterval: undefined,
  _resetTimeout: undefined,

  start: () => {
    const { isAnimating, _startTimeout, _trickleInterval, _resetTimeout } = get();

    if (isAnimating) return; // Already running

    // Clear any cleanup timers
    if (_resetTimeout) clearTimeout(_resetTimeout);
    if (_startTimeout) clearTimeout(_startTimeout);
    if (_trickleInterval) clearInterval(_trickleInterval);

    // Debounce: Wait 150ms before showing bar to prevent flicker on fast loads
    const timeout = setTimeout(() => {
      set({ isAnimating: true, progress: 10 });

      // Trickle animation: slowly increment progress
      const interval = setInterval(() => {
        set((state) => {
           if (state.progress >= 90) return state;
           // Random increment 1-5%
           const diff = Math.random() * 5;
           // Slow down as it gets closer to 90%
           const speed = Math.max(0.1, 1 - state.progress / 100);
           return { progress: Math.min(state.progress + diff * speed, 90) };
        });
      }, 200);

      set({ _trickleInterval: interval });
    }, 150);

    set({ _startTimeout: timeout });
  },

  done: () => {
    const { isAnimating, _startTimeout, _trickleInterval } = get();
    
    // Clear start timeout - if done() called <150ms, bar never shows
    if (_startTimeout) clearTimeout(_startTimeout);
    if (_trickleInterval) clearInterval(_trickleInterval);

    if (isAnimating) {
        set({ progress: 100 });
        // Fade out
        const reset = setTimeout(() => {
            set({ isAnimating: false, progress: 0 });
        }, 500);
        set({ _resetTimeout: reset });
    } else {
        // We never started animating (detected fast load), just reset
        set({ isAnimating: false, progress: 0 });
    }
  },
}));
