# Git bootstrap — First Light

The repo is pre-configured for git but has never been initialised. Follow
these steps the next time you are ready to put it under version control.

## 1. Install git for Windows

Download from <https://git-scm.com/download/win>. During install, accept
the default "Git from the command line and also from 3rd-party software"
option so PowerShell picks it up without PATH surgery.

Verify:

```powershell
git --version
```

## 2. Initialise the repo

From this folder:

```powershell
cd "C:\Users\SohaibMengal\Documents\First-Light"
git init
git config user.name  "Sohaib Mengal"
git config user.email "you@example.com"   # use the email tied to your GitHub
git add .
git commit -m "chore: initial commit"
```

The `.gitignore` and `.gitattributes` are already in place so node_modules,
.env files, and OS junk stay out of history, and JS/CSS/HTML files commit
with LF line endings regardless of which machine you edit from.

## 3. Push to a private GitHub repo

Create an **empty** private repo on GitHub (do not tick "Add a README"
or it will reject the push). Then:

```powershell
git remote add origin https://github.com/<your-user>/first-light.git
git branch -M main
git push -u origin main
```

## 4. CI

`.github/workflows/test.yml` will start running `npm test` on every push
and every pull request the moment the repo is on GitHub. No extra config
required — the tests are zero-dependency and finish in well under a
second.

## 5. Day-to-day

```powershell
git status              # what changed
git diff                # unstaged changes
git add -p              # stage in chunks (review as you go)
git commit -m "…"       # commit
git push                # push to GitHub
```

If you break something, `git restore <path>` rolls one file back, and
`git reset --hard HEAD` rolls everything back to the last commit.
`git log --oneline -20` shows recent history.

## 6. Suggested branch etiquette

- `main` — deployable at all times.
- Feature branches — `feat/<short-name>` for anything touching `diary.js`
  until modularisation (Code quality #1) ships, so a broken experiment
  cannot bring down production.
