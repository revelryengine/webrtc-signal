import console from './console.js';

export class SignalServer {
    constructor() {
        this.connections = new Map();
    }

    join(connection, uuid) {
        connection.addEventListener('close', () => {
            console.debug(`SIGNAL: Connection closed ${uuid}`);
            this.connections.delete(uuid);
        });

        connection.addEventListener('message', ({ data }) => {
            try {
                const message = JSON.parse(data);
                switch(message.type){
                    case 'offer':
                    case 'answer':
                    case 'candidate':
                        console.debug(`SIGNAL: sending ${message.type} to ${message.to} from ${uuid}`);
                        this.connections.get(message.to) && this.connections.get(message.to).send(JSON.stringify({ ...message, from: uuid  }));
                        break;
                }
            } catch(e) {
                console.warn('WRTC: Invalid message in signal channel', e);
            }
        });

        for(const [,connection] of this.connections) {
            connection.send(JSON.stringify({ type: 'join', from: uuid }));
        }

        this.connections.set(uuid, connection);

        connection.send(JSON.stringify({ type: 'welcome', uuid }));
        console.debug('SIGNAL: New connection', uuid);
        return uuid;
    }
}

export default SignalServer;
