// Friend rooms over peer-to-peer connections (PeerJS / WebRTC).
//
// The host's browser runs the match; friends connect straight to it using the
// room code. No game server is needed. PeerJS's free public broker is only
// used to introduce the browsers to each other.
//
// For local testing, ?peer=localhost:9000 points at a self-hosted PeerServer.

const PREFIX = 'thullaparty-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function cleanCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  const opts = {
    debug: 0,
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    },
  };
  if (q) {
    const [host, port] = q.split(':');
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return opts;
}

function newPeer(id) {
  if (typeof window.Peer === 'undefined') throw new Error('Online play could not load. Check your connection.');
  return new window.Peer(id, peerOptions());
}

/** Host a room. Resolves once the room code is live. */
export function hostRoom({ onJoin, onMessage, onLeave, onError }) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = makeCode();
      let peer;
      try {
        peer = newPeer(PREFIX + code);
      } catch (e) {
        reject(e);
        return;
      }
      const conns = new Set();
      const lastSeen = new Map();
      let opened = false;
      let beat = 0;
      peer.on('open', () => {
        opened = true;
        resolve({
          code,
          send(conn, msg) {
            if (conn && conn.open) conn.send(msg);
          },
          broadcast(msg) {
            for (const c of conns) if (c.open) c.send(msg);
          },
          close() {
            clearInterval(beat);
            for (const c of conns) {
              try {
                c.send({ t: 'closed' });
              } catch {
                /* ignore */
              }
            }
            setTimeout(() => peer.destroy(), 150);
          },
        });
      });
      // Heartbeat: phones that lose signal can take a long time to report a
      // closed connection, so the host pings and drops anyone silent for 10s.
      beat = setInterval(() => {
        const now = Date.now();
        for (const c of conns) {
          if (now - (lastSeen.get(c) || now) > 10000) {
            try {
              c.close();
            } catch {
              /* ignore */
            }
            conns.delete(c);
            onLeave(c);
          } else if (c.open) {
            try {
              c.send({ t: 'ping' });
            } catch {
              /* ignore */
            }
          }
        }
      }, 3000);
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          conns.add(conn);
          lastSeen.set(conn, Date.now());
        });
        conn.on('data', (msg) => {
          lastSeen.set(conn, Date.now());
          if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
          if (msg.t === 'pong') return;
          if (msg.t === 'hello') onJoin(conn, msg);
          else onMessage(conn, msg);
        });
        const gone = () => {
          lastSeen.delete(conn);
          if (!conns.has(conn)) return;
          conns.delete(conn);
          onLeave(conn);
        };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      peer.on('disconnected', () => {
        // Lost the broker; existing connections keep working. Try to reconnect.
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      });
      peer.on('error', (err) => {
        if (!opened && err.type === 'unavailable-id' && tries++ < 5) {
          clearInterval(beat);
          peer.destroy();
          attempt();
          return;
        }
        if (!opened) {
          clearInterval(beat);
          reject(new Error(friendly(err)));
        }
        else if (onError) onError(new Error(friendly(err)));
      });
    };
    attempt();
  });
}

/** Join a friend's room by code. Resolves with a connection handle. */
export function joinRoom(code, hello, { onMessage, onClose, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    let peer;
    try {
      peer = newPeer();
    } catch (e) {
      reject(e);
      return;
    }
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Could not reach that room. Check the code and try again.'), timeoutMs);
    let lastMsg = Date.now();
    let watch = 0;
    let closed = false;
    const lost = () => {
      if (closed || !settled) return;
      closed = true;
      clearInterval(watch);
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      if (onClose) onClose();
    };
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + cleanCode(code), { reliable: true });
      conn.on('open', () => {
        clearTimeout(timer);
        settled = true;
        lastMsg = Date.now();
        conn.send({ t: 'hello', ...hello });
        // If the host goes silent (no pings) for 10s, treat it as a lost connection.
        watch = setInterval(() => {
          if (Date.now() - lastMsg > 10000) lost();
        }, 2000);
        resolve({
          send(msg) {
            if (conn.open) conn.send(msg);
          },
          /** Testing aid: behave exactly as if the network dropped. */
          simulateDrop() {
            settled = true;
            lost();
          },
          close() {
            closed = true;
            clearInterval(watch);
            try {
              conn.close();
            } catch {
              /* ignore */
            }
            setTimeout(() => peer.destroy(), 150);
          },
        });
      });
      conn.on('data', (msg) => {
        lastMsg = Date.now();
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'ping') {
          if (conn.open) conn.send({ t: 'pong' });
          return;
        }
        onMessage(msg);
      });
      conn.on('close', lost);
      conn.on('error', lost);
    });
    peer.on('error', (err) => {
      if (!settled) {
        clearTimeout(timer);
        fail(friendly(err));
      } else if (err.type === 'peer-unavailable' || err.type === 'network') {
        lost();
      }
    });
  });
}

function friendly(err) {
  switch (err && err.type) {
    case 'peer-unavailable':
      return 'Room not found. Check the code — the host must keep the game open.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not connect to the online service. Check your internet and try again.';
    case 'browser-incompatible':
      return 'This browser does not support online play. Try Chrome, Safari or Firefox.';
    default:
      return 'Something went wrong with the connection. Please try again.';
  }
}
