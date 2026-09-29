// Optional CrazyGames integration (SDK v3).
//
// The SDK is only loaded when the game is actually running on CrazyGames, so
// GitHub Pages, itch.io and local testing never make that network request.
// Every call is wrapped so a missing or failing SDK can never break the game.
// Force it on for testing with ?cg=1.

let sdk = null;
let playing = false;

function onCrazyGames() {
  if (new URLSearchParams(location.search).get('cg') === '1') return true;
  const hosts = [location.hostname, document.referrer];
  try {
    if (location.ancestorOrigins) hosts.push(...location.ancestorOrigins);
  } catch {
    /* ignore */
  }
  return hosts.some((h) => /crazygames\./i.test(String(h)));
}

function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    s.onload = () => (clearTimeout(t), resolve());
    s.onerror = () => (clearTimeout(t), reject(new Error('load failed')));
    document.head.appendChild(s);
  });
}

const call = (fn) => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/** Resolves quickly either way; the game never waits more than ~4s for it. */
export async function initPlatform({ onMute } = {}) {
  if (!onCrazyGames()) return false;
  try {
    await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js', 4000);
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return false;
    await Promise.race([S.init(), new Promise((_, r) => setTimeout(() => r(new Error('init timeout')), 4000))]);
    sdk = S;
    call(() => sdk.game.loadingStart());
    const settings = call(() => sdk.game.settings);
    if (onMute && settings) onMute(!!settings.muteAudio);
    call(() =>
      sdk.game.addSettingsChangeListener((s) => {
        if (onMute) onMute(!!s.muteAudio);
      }),
    );
    return true;
  } catch {
    sdk = null;
    return false;
  }
}

export const platform = {
  get active() {
    return !!sdk;
  },
  loadingStart: () => sdk && call(() => sdk.game.loadingStart()),
  loadingStop: () => sdk && call(() => sdk.game.loadingStop()),
  gameplayStart() {
    if (!sdk || playing) return;
    playing = true;
    call(() => sdk.game.gameplayStart());
  },
  gameplayStop() {
    if (!sdk || !playing) return;
    playing = false;
    call(() => sdk.game.gameplayStop());
  },
  happytime: () => sdk && call(() => sdk.game.happytime()),
  /** A shareable link to a room. On CrazyGames this is their own invite link. */
  inviteLink(code, fallback) {
    if (sdk) {
      const link = call(() => sdk.game.inviteLink({ roomId: code }));
      if (typeof link === 'string' && link) return link;
    }
    return fallback;
  },
  /** Room code from a CrazyGames invite link, if the player arrived through one. */
  inviteRoom() {
    return sdk ? call(() => sdk.game.getInviteParam('roomId')) || '' : '';
  },
};
