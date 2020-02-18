import console from './console.js';

function encodeFingerprint(fingerprint) {
    return btoa(String.fromCharCode.apply(String, fingerprint.slice(22).split(':').map(h => parseInt(h, 16))));
}

function decodeFingerprint(fingerprint) {
    const parts = atob(fingerprint).split('');

    return `a=fingerprint:sha-256 ${parts.map((c) => {
        const d = c.charCodeAt(0);
        const e = (d < 16 ? '0': '') + c.charCodeAt(0).toString(16).toUpperCase();
        return e;
    }).join(':')}`;
}

function compressSDP(desc) {
    const lines       = desc.sdp.split('\r\n');
    const type        = desc.type.substring(0, 1);
    const ufrag       = lines.find(line => line.startsWith('a=ice-ufrag:')).slice(12);
    const pwd         = lines.find(line => line.startsWith('a=ice-pwd:')).slice(10);
    const fingerprint = encodeFingerprint(lines.find(line => line.startsWith('a=fingerprint:')));

    const candidates = lines.filter(line => {
        return line.startsWith('a=candidate:') && !line.includes('127.0.0.1') && !line.includes('::1');
    }).map(candidate => {
        const [, proto, host, port] = candidate.slice(12).match(/\d+\s\d+\s(udp|tcp)\s\d+\s([0-9A-z.:-]+)\s(\d+)/);
        return [proto, host, port].join('|');
    });
    return [type, ufrag, pwd, fingerprint, candidates].join(',');
}

let session = Math.round(Number.MAX_SAFE_INTEGER / 2);

function decompressSDP(desc) {
    const [type, ufrag, pwd, fingerprint, ...candidates] = desc.split(',');

    let priority = 0;
    return {
        type: type === 'o' ? 'offer' : 'answer',
        sdp: ['v=0',
            `o=- ${session++} 2 IN IP4 127.0.0.1`,
            's=-', 't=0 0', 'a=msid-semantic: WMS',
            'm=application 47496 UDP/DTLS/SCTP webrtc-datachannel',
            'c=IN IP4 0.0.0.0',
            type === 'o' ? 'a=setup:actpass' : 'a=setup:active',
            `a=ice-ufrag:${ufrag}`,
            `a=ice-pwd:${pwd}`,
            decodeFingerprint(fingerprint),
            ...candidates.map(candidate => {
                const [proto, host, port] = candidate.split('|');
                return `a=candidate:0 1 ${proto} ${priority++} ${host} ${port} typ host`;
            }),
            'a=mid:0',
            'a=sctp-port:5000',
            'a=max-message-size:262144'
        ].join('\r\n') + '\r\n'
    };
}

export class LocalConnection {
    /**
     * @param {String} offer - compressed offer sdp
     */
    constructor(offer) {
        this.pc = new RTCPeerConnection();

        this.signalChannel = this.pc.createDataChannel('signal', { negotiated: true, id: 0, ordered: true });

        this.signalChannel.addEventListener('open', () => console.debug('WRTC: Data Channel connection established'));
        this.signalChannel.addEventListener('close', () => console.debug('WRTC: Data Channel connection closed'));

        this.pc.onnegotiationneeded = () => console.debug('WRTC: onnegotiationneeded');
        this.pc.onsignalingstatechange = () => console.debug('WRTC: onsignalingstatechange', this.pc.signalingState);
        this.pc.oniceconnectionstatechange = () => console.debug('WRTC: oniceconnectionstatechange', this.pc.iceConnectionState);

        this.ready = new Promise((resolve, reject) => {
            this.pc.onicegatheringstatechange = () => {
                if(this.pc.iceGatheringState === 'complete') {
                    resolve();
                } else if(this.pc.iceGatheringState === 'error') {
                    reject(new Error('ICE Gathering Error'));
                }
            }
        });

        (async() => {
            let desc;
            if(offer){
                try {
                    this.setRemoteDescription(offer);
                    desc = await this.pc.createAnswer();
                } catch(e){
                    console.debug('WRTC: Answer Failed', e);
                    throw e;
                }
            } else {
                desc = await this.pc.createOffer();
            }
            this.pc.setLocalDescription(desc);
        })();
    }

    /**
     * Returns a compressed version of the standard local description sdp.
     * Assumes only a basic data channel connection over the same local network.
     */
    get localDescription() {
        return compressSDP(this.pc.localDescription);
    }

    setRemoteDescription(desc) {
        this.pc.setRemoteDescription(decompressSDP(desc));
    }
}

export default LocalConnection;
