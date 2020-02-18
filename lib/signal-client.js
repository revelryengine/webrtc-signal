import console from './console.js';

export class SignalClient {
    constructor(signal) {
        this.peers = new Map();

        this.signal = signal;

        this.signal.addEventListener('message', async ({ data }) => {
            try {
                const message = JSON.parse(data);
                console.debug('SIGNAL:', message);
                switch(message.type) {
                    case 'welcome':
                        this.uuid = message.uuid;
                        break;
                    case 'join':
                    case 'offer':
                        await this.establishPeerConnection(message.from, message.sdp);
                        break;
                    case 'candidate':
                        this.peers.get(message.from) && message.candidate && this.peers.get(message.from).addIceCandidate(message.candidate);
                        break;
                    case 'answer':
                        this.peers.get(message.from) && this.peers.get(message.from).setRemoteDescription(message.sdp);
                        break;

                }
            } catch (e) {
                console.warn('WRTC: Invalid message over signal channel', data, e);
            }
        });
    }

    async establishPeerConnection(peerId, offer){
        const pc = this.createPeerConnection(peerId);
        const ready = new Promise((resolve) => {
            pc.mainDataChannel.addEventListener('close', async () => {
                this.peers.delete(peerId);
            });

            pc.mainDataChannel.addEventListener('open', async () => {
                resolve();
            });
        });

        let sdp;
        if(offer){
            try {
                pc.setRemoteDescription(offer);
                sdp = await pc.createAnswer(offer);
            } catch(e){
                console.warn('WRTC: Answer Failed', e);
                throw e;
            }
        } else {
            sdp = await pc.createOffer();
        }

        pc.setLocalDescription(sdp);
        this.signal.send(JSON.stringify({ to: peerId, type: sdp.type, sdp: sdp }));

        return ready;
    }

    createPeerConnection(peerId){
        const pc = new RTCPeerConnection();

        pc.onnegotiationneeded = () => console.debug('WRTC: onnegotiationneeded', peerId);
        pc.onsignalingstatechange = () => console.debug('WRTC: onsignalingstatechange', peerId, pc.signalingState);
        pc.onicegatheringstatechange = () => console.debug('WRTC: onicegatheringstatechange', peerId, pc.iceGatheringState);
        pc.oniceconnectionstatechange = () => console.debug('WRTC: oniceconnectionstatechange', peerId, pc.iceConnectionState);

        pc.onicecandidate = ({ candidate }) => {
            console.debug('WRTC: onicecandidate', peerId, candidate);
            this.signal.send(JSON.stringify({ type: 'candidate', candidate, to: peerId }));
        };

        pc.mainDataChannel = pc.createDataChannel('main', { negotiated: true, id: 1, ordered: true });
        pc.mainDataChannel.addEventListener('open', () => console.debug('WRTC: Data Channel connection established', peerId));
        pc.mainDataChannel.addEventListener('close', () => console.debug('WRTC: Data Channel connection closed', peerId));

        this.peers.set(peerId, pc);

        return pc;
    }
}

export default SignalClient;
