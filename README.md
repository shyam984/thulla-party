# Thulla Party

A colourful online version of the classic South Asian card game **Bhabhi / Thulla**. Play against the computer, or invite 2–4 friends with a room code.

Plain HTML, CSS and JavaScript. There is no build step and no server to run: upload the files to GitHub Pages (or any static host) and it works.

## Rules

- 3–5 players, one 52-card deck, all cards dealt.
- Whoever has the **Ace of Spades** starts with it.
- Everyone must **follow the suit** that was led if they can.
- If everyone follows suit, the trick is discarded and the **highest card** leads next.
- Can't follow suit? Play any other card: a **thulla**. The trick stops, and whoever played the highest card of the led suit **picks up the whole pile**, then leads.
- **No thulla on the first trick.** A player with no spades plays any card, and the trick is simply discarded.
- Run out of cards and you're **SAFE**. The **last player holding cards is the Bhabhi**.

## Coins

- Everyone starts with **2,500 coins**. Coins are saved in the player's browser.
- Bets are 100 / 250 / 500 / 1,000 / 2,500 / 10,000. Big bets (2,500+, or more than half your coins) need a second tap to confirm.
- Everyone who gets out safe and stays to the end wins **2× their bet** back. The Bhabhi loses their bet.
- A SAFE player can **leave early** and gets exactly their bet back (no win, no loss). The others keep playing.
- Leaving before you're safe loses your bet; a computer player finishes your cards.
- **Free coins:** +100 every minute, stored for up to an hour, collected from the home screen.
- No ads and no real-money purchases.

## Friend rooms

The host taps **Create Room** and shares the 5-letter code or invite link. Friends tap **Join Room**, then **I'm in** to accept the bet. The host can add computer players, set the bet and start once everyone is ready. Changing the bet asks everyone to confirm again.

- **Dropped connection:** a computer player covers the seat and the friend's game reconnects automatically for up to 30 seconds. Refreshing the page also offers to rejoin.
- **Host leaves:** the room closes and everyone still in a game gets their bet back.

Rooms use direct browser-to-browser connections (WebRTC via [PeerJS](https://peerjs.com), MIT licence). The free PeerJS service only introduces the browsers to each other, and the host's browser runs the game. The host needs to keep the game open while playing. A few very strict networks, such as some school or office Wi-Fi, block these direct connections.

Coins live in each player's own browser. There is no server, so a determined player could edit their own coin balance; this only affects their own numbers.

## CrazyGames

`src/platform.js` loads the CrazyGames SDK (v3) **only** when the game is running on crazygames.com, so GitHub Pages and local testing never contact it. On CrazyGames it reports loading and gameplay start/stop, celebrates wins (`happytime`), follows their mute setting and uses their invite links for rooms. No ads are requested. Add `?cg=1` to the URL to force it on for testing.

## Controls

- **Phone/tablet:** tap a card to pick it up, tap again to play (turn on *One-tap play* in Settings to skip the second tap). Best played sideways; in portrait the game asks you to rotate.
- **Computer:** click a card, or use Tab / arrow keys and Enter.

## Files

```
index.html          App page (loading screen and rotate prompt)
styles/main.css     All styles and animations
src/engine.js       Rules (shared by host, bots and tests)
src/bot.js          Computer players
src/match.js        Runs a game, seat status (away / left / left safe), reconnect snapshots
src/net.js          Room codes, connections, heartbeat (PeerJS)
src/store.js        Profile, coins, settings and free coins
src/audio.js        Synthesised sound effects and music, with volume controls
src/platform.js     Optional CrazyGames SDK integration
src/ui/table.js     Game table and animations
src/ui/cards.js     Card artwork (SVG)
src/ui/fx.js        Confetti, sparks and coin showers
src/main.js         Screens: home, settings, lobby, results, rooms
vendor/peerjs.min.js
assets/fonts/       Lilita One and Nunito (SIL Open Font License)
```

Testing aids: `?speed=3` runs games faster; `?peer=host:port` uses a local PeerServer.
