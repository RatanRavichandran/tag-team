# Tag Team

**How far can you stretch a fandom?**

Tag Team is a browser-based word-chain game built on top of [Archive of Our Own (AO3)](https://archiveofourown.org/). You start with a freeform tag — like *Slow Burn* or *Enemies to Lovers* — and try to build the longest chain of tags that co-occur on actual AO3 works. Each new tag you add has to appear alongside your most recent tags in real fics. It's basically Six Degrees of Kevin Bacon, but for fanfic tropes.

## How It Works

1. Pick (or randomize) a starting tag.
2. Type a new freeform tag. The game checks AO3 in real time to see if it co-occurs with your last 3 tags.
3. If enough works exist with those tags together (based on your difficulty), the tag gets added to your chain.
4. Each tag can only be used once.
5. Keep going until you get stuck — then see your stats and share your chain.

### Difficulty Levels

| Difficulty | Min. Co-occurring Works |
|------------|------------------------|
| Casual     | 100+                   |
| Normal     | 500+                   |
| Hard       | 2,000+                 |
| Unhinged   | 5,000+                 |

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS, styled to look like AO3 (the classic serif + red accent aesthetic)
- **Backend:** Two serverless Edge functions (deployed on Vercel) that proxy requests to AO3:
  - `/api/autocomplete` — tag autocomplete via AO3's freeform search
  - `/api/cooccurrence` — checks how many works are tagged with a given set of tags
- **Local dev:** A simple Node.js server (`dev-server.js`) that serves the frontend and handles the API proxying locally

## Running Locally

```bash
node dev-server.js
```

Then open [http://localhost:3000](http://localhost:3000). No dependencies to install — it's just vanilla Node.

## Deploying

The project is set up for [Vercel](https://vercel.com/). Just connect the repo and deploy — the `vercel.json` config handles routing API calls to the serverless functions and serving the `public/` directory as static files.

## Project Structure

```
ao3/
├── api/
│   ├── autocomplete.js      # Edge function — proxies AO3 tag autocomplete
│   └── cooccurrence.js      # Edge function — checks tag co-occurrence counts
├── public/
│   ├── index.html            # Game UI (start, play, end screens)
│   ├── script.js             # All game logic, AO3 API calls, autocomplete UX
│   ├── style.css             # AO3-inspired styling
│   └── tagData.js            # Curated list of suggested starting tags
├── dev-server.js             # Local dev server (Node, no deps)
├── vercel.json               # Vercel deployment config
└── package.json
```

## Notes

- All tag validation happens live against AO3 — there's no static dataset. This means the game reflects whatever's actually on AO3 right now.
- The API functions include basic caching headers to be polite to AO3's servers.
- AO3 can rate-limit requests; the game handles 429s gracefully and shows a retry message.

## License

Do whatever you want with it.
