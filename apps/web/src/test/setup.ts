import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// maplibre needs webgl, which jsdom doesn't have
vi.mock('maplibre-gl', () => {
  class FakeMap {
    on() {}
    once() {}
    addControl() {}
    remove() {}
    isStyleLoaded() {
      return false;
    }
    getSource() {
      return undefined;
    }
  }
  return { Map: FakeMap, NavigationControl: class {} };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

// jsdom doesn't do layout, so nothing ever intersects
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'cs_csrf=test-csrf-token-1234567890';
});
document.cookie = 'cs_csrf=test-csrf-token-1234567890';
