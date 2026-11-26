
/**
 * Viewer State Management
 */
export const fontSizes = { small: 18, medium: 22, large: 26, xlarge: 30 };

export const state = {
    siteType: 'narou',
    novelId: null,
    epNo: 1,
    fontSize: fontSizes.small,
    lineHeight: 'normal',
    theme: 'light', // 明色、暗色、セピア
    novelInfo: null,
    currentEpTitle: ''
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
