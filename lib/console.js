const NOOP = () => {};

const LEVELS = [
    'debug',
    'info',
    'log',
    'warn',
    'error',
    'silent',
];

export function proxyConsole(level = 'info') {
    const silenced = [];

    const proxy = new Proxy(console, {
        get: (obj, prop) => {
            if (prop === 'level') return level;
            if(prop in LEVELS && prop in silenced) {
                return NOOP;
            }
            return obj[prop];
        },
        set: (obj, prop, value) => {
            if (prop === 'level') {
                const index = LEVELS.findIndex(level => level === value);
                if(index === -1) throw new Error('Invalid log level');
                silenced.length = 0;
                for(let i = 0; i < index; i++){
                    silenced.push(LEVELS[i]);
                }
                level = value;
            }
        }
    });
    proxy.level = level;
    return proxy;
}

export default proxyConsole();
