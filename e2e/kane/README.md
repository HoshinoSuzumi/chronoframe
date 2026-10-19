# End-to-end (e2e) tests for web

Browser tests written in plain English for [Kane CLI](https://www.testmuai.com/kane-cli/).

| Test | What it covers |
|---|---|
| `setup_test.md` | The setup wizard: admin account, site info, local storage, map service and the dashboard |
| `album_test.md` | Setup, then creating an album and finding it on the Albums page |

## Run

Start a fresh instance on port 4830:

```bash
docker run -d --name chronoframe-e2e -p 4830:3000 -e NUXT_SESSION_PASSWORD=e2e-session-password-at-least-32-chars ghcr.io/hoshinosuzumi/chronoframe:latest
npm install -g @testmuai/kane-cli
kane-cli login
kane-cli testmd run e2e/kane/setup_test.md
kane-cli testmd run e2e/kane/album_test.md
```

Both tests start from the setup wizard, so recreate the container before each run.
