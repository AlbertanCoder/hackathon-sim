# Edmonton Tech Academy: a free course from zero to employable in tech

The course was earlier called Hackathon Sim; the web address still uses the old name.

**Open it:** https://albertancoder.github.io/hackathon-sim/

A free, no-account course that runs in your browser (one HTML file, nothing to install). It aims to take a busy beginner toward junior tech work, leaning to AI: the terminal, git, Python, data structures, how the internet works, web and JavaScript, databases and deploying, building with the Claude API, how LLMs work, software engineering, getting hired, and classic machine learning with containers and the cloud.

It does **not** promise a job, an income or any outcome. It teaches skills and ends each level with a portfolio project and a timed test.

## What is in it
- **Levels 1-3:** terminal basics, git, directing Claude Code, Claude Code power use, and reading Python (the Python lessons run on the public practice repo [gold-bot-practice](https://github.com/AlbertanCoder/gold-bot-practice)).
- **Levels 4-12:** data structures and algorithms; how computers and the internet work; web and JavaScript; data, databases and deploying; building with the Claude API; how LLMs work; software engineering; getting hired; classic machine learning, containers and the cloud (plus an optional TypeScript lesson). Each level has lessons, a practice project and a timed final test.
- **Optional hackathon track:** a rehearsal game and drills for Canada's Defence Tech Hackathon in Edmonton. The event was set for 14-15 November 2026 and has been postponed to 2027, new date to be announced. Nothing in the track is needed to get hired.

## Honest status
- Levels 4-12 have **not** been tried by real beginners yet. The code, outputs and numbers in the lessons were re-run by machine; the explanations were read by one reviewer.
- Code you write in a lesson: JavaScript steps and most Python steps (65 of them) are run in your browser against the lesson's own examples, like freeCodeCamp (Python runs on Pyodide, served from this site, about 12 MB downloaded the first time a Python step is reached). SQL, TypeScript and the few Python steps that need extra libraries cannot run in the page: for those you compare your code with the model answer and tick what you covered. The final tests use only auto-marked questions.
- Facts about fast-moving things (model names, prices, docs pages) were checked on 23 October 2026 and will age.
- A quality audit on 23 October 2026 found problems; fixes are being applied in the open in this repo's history.

## Privacy
Your progress is saved in your own browser (localStorage). There is no account, no server and no tracking, and the page makes no request to any other site while you learn. Fonts are embedded. The optional AI helpers only switch on if you paste your own DeepSeek or OpenRouter key in Settings; the key stays in your browser and is sent only to that provider.

## Run it yourself
Open the web address above. To run it locally, serve this folder (`python -m http.server`): the page is `index.html` and the Python runner is the `pyodide/` folder next to it (opened as a plain file, Python steps fall back to comparing with the model answer). The course source and its checks are in `dev/`.

## Checks
`dev/check/` holds the checks (GitHub Actions runs them on every push, and re-runs every lesson example and link once a month): `node check/lessons-audit.mjs`, `levels.mjs`, `pyrun.mjs` and the rest, from inside `dev/`.

## Licence
MIT, see `LICENSE`. Free to copy and adapt with the notice kept.
