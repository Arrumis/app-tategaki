
/**
 * State Management
 */
export const state = {
    userId: 'default',
    listId: 'default',
    userLists: [],
    novels: [], // カレントリストの小説データ
    targetNovel: null, // 操作対象
    isLoading: false
};

// 状態更新通知（簡易Observer）
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
