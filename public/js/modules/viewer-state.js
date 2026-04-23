
/**
 * Viewer State Management
 */
export const state = {
    siteType: 'narou',
    novelId: null,
    epNo: 1,
    fontSize: 18,
    lineHeight: 'normal',
    theme: 'light', // light, dark, sepia
    novelInfo: null,
    currentEpTitle: '',
    scrollTimer: null
};

const listeners = [];

export function subscribe(fn) {
    listeners.push(fn);
}

export function notify() {
    listeners.forEach(fn => fn(state));
}

export function setState(newState) {
    Object.assign(state, newState);
    notify();
}
