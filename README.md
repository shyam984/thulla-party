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
- Run out of cards and you're safe. The **last player holding cards is the Bhabhi**.

## Coins

- Everyone starts with **2,500 coins**. Coins are saved in the player's browser.
- Bets are 100 / 250 / 500 / 1,000 / 2,500. Everyone who gets out safe wins **2× their bet**. The Bhabhi loses their bet.
- **Free coins:** +100 every minute, stored for up to an hour, collected from the home screen.
- No ads and no real-money purchases.

## Friend rooms

The host taps **Create Room** and shares the 5-letter code or invite link. Friends tap **Join Room**. The host can add computer players, set the bet and start. If a friend disconnects mid-game, a computer player takes over their seat.

Rooms use direct browser-to-browser connections (WebRTC via [PeerJS](https://peerjs.com), MIT licence). The free PeerJS service only introduces the browsers to each other, and the host's browser runs the game. The host needs to keep the game open while playing. A few very strict networks, such as some school or office Wi-Fi, block these direct connections.

## Files

```
index.html          App page
styles/main.css     All styles and animations
src/engine.js       Rules (shared by host, bots and tests)
src/bot.js          Computer players
src/match.js        Runs a game and sends events to each seat
src/net.js          Room codes and connections (PeerJS)
src/store.js        Profile, coins and free coins
src/audio.js        Synthesised sound effects
src/ui/table.js     Game table and animations
src/ui/cards.js     Card artwork (SVG)
src/ui/fx.js        Confetti, sparks and coin showers
src/main.js         Screens: home, lobby, results
vendor/peerjs.min.js
assets/fonts/       Lilita One and Nunito (SIL Open Font License)
```
