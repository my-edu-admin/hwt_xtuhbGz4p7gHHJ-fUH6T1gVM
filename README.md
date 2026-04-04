<<<<<<< HEAD
DATA-MAIN
=======
# EduData Directory Setup

This repo has two apps:

- `admin/`: local admin panel, reports, expenses, payment tracking, JSON management
- `user/`: public React app for end users

The public app can now read data from GitHub Raw, business details are fetched live on click, and the detail payload is cleared from app state when the detail panel closes.

The intended git workflow can use two separate repositories on the same machine:

- the full source repo for all code and admin data
- a second public-data repo that contains only `basic/` and `detailed/`

## Folder layout

```text
MAIN/
├── backup/
├── .env.example
├── admin/
│   ├── .env.example
│   ├── config/
│   │   └── plan-catalog.json
│   ├── data/
│   │   ├── basic/
│   │   │   └── _cards.json
│   │   ├── detailed/
│   │   ├── expenses.json
│   │   ├── notes.json
│   │   └── payments/
│   ├── public/
│   ├── scripts/
│   ├── package.json
│   └── server.js
├── user/
│   ├── .env.example
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── user_data/
├── user_out/
└── README.md
```

## 1. Create the env files

Create separate env files for admin and user:

```bash
copy admin\.env.example admin\.env
copy user\.env.example user\.env
```

Main settings inside `admin/.env`:

```env
ADMIN_HOST=0.0.0.0
ADMIN_PORT=3000
ADMIN_SERVE_USER_BUILD=true
ADMIN_USER_ROUTE=/user
ADMIN_ALLOW_REMOTE_ACCESS=false
ADMIN_GIT_REPO_PATH=.
ADMIN_GIT_REMOTE=origin
ADMIN_GIT_DEFAULT_BRANCH=
ADMIN_DB_REPO_PATH=
ADMIN_DB_REMOTE=origin
ADMIN_DB_DEFAULT_BRANCH=
ADMIN_DB_BASIC_TARGET=basic
ADMIN_DB_DETAILED_TARGET=detailed
ADMIN_SMTP_HOST=
ADMIN_SMTP_PORT=587
ADMIN_SMTP_SECURE=false
ADMIN_SMTP_USER=
ADMIN_SMTP_PASS=
ADMIN_EMAIL_FROM_NAME=EduData Nepal
ADMIN_EMAIL_FROM_ADDRESS=
ADMIN_EMAIL_REPLY_TO=
```

Main settings inside `user/.env`:

```env
VITE_ADMIN_API_ORIGIN=http://localhost:3000
VITE_DEV_HOST=0.0.0.0
VITE_DEV_PORT=5173
VITE_USER_BASE=/user/
VITE_PUBLIC_DATA_ROOT=
```

What these do:

- `ADMIN_PORT`: admin server port
- `ADMIN_USER_ROUTE`: where the built user app is served from the admin server
- `ADMIN_ALLOW_REMOTE_ACCESS`: keep `false` to make the admin desktop and private admin APIs localhost-only while leaving `/user` and `/api/public/*` public
- `ADMIN_GIT_*`: repo settings used by the `Source App` for the full source repository
- `ADMIN_DB_*`: repo settings used by the `DB Manager` for a second local repository that mirrors only `admin/data/basic` and `admin/data/detailed`
- `ADMIN_SMTP_*` / `ADMIN_EMAIL_*`: Mail Center delivery settings for one-click sending to businesses and staff
- `VITE_ADMIN_API_ORIGIN`: API target for the user app in local dev
- `VITE_USER_BASE`: build base path for the deployed user app
- `VITE_PUBLIC_DATA_ROOT`: GitHub Raw base URL for public content

The root [`.env.example`](d:/SCHOOL_DND/MAIN/.env.example) is now only a pointer. Runtime config is split cleanly between [admin/.env.example](d:/SCHOOL_DND/MAIN/admin/.env.example) and [user/.env.example](d:/SCHOOL_DND/MAIN/user/.env.example).

### Recommended two-repo folder layout

If you want one repo for the full project and another repo for only public business data, keep both clones beside each other:

```text
SCHOOL_DND/
├── MAIN/
└── school-dnd-public-data/
```

Then a practical `admin/.env` looks like this:

```env
ADMIN_GIT_REPO_PATH=.
ADMIN_GIT_REMOTE=origin
ADMIN_GIT_DEFAULT_BRANCH=main

ADMIN_DB_REPO_PATH=../school-dnd-public-data
ADMIN_DB_REMOTE=origin
ADMIN_DB_DEFAULT_BRANCH=main
ADMIN_DB_BASIC_TARGET=basic
ADMIN_DB_DETAILED_TARGET=detailed
```

Important:

- `ADMIN_GIT_REPO_PATH` points to the full source repo that contains everything
- `ADMIN_DB_REPO_PATH` points to the second cloned repo on your PC
- the second repo can belong to a different GitHub account; git reads the remote and credentials from that repo itself

## 2. Install and run the admin app

From `admin/`:

```bash
npm install
npm start
```

Default URL:

```text
http://localhost:3000
```

The admin app manages:

- `basic/_cards.json`
- `detailed/*.json`
- `payments/<slug>/*.json`
- `expenses.json`
- `notes.json`
- `backup/*` snapshot manifests and restore points

## 3. Install and run the user app

From `user/`:

```bash
npm install
npm run dev
```

Default local URL:

```text
http://localhost:5173
```

Production build:

```bash
npm run build
```

If `ADMIN_SERVE_USER_BUILD=true`, the admin server will also serve the built user app from:

```text
http://localhost:3000/user
```

With `ADMIN_ALLOW_REMOTE_ACCESS=false`, remote visitors can still open the public user app and `/api/public/*`, but the admin desktop at `/` plus private admin APIs stay blocked unless the request comes from the same machine.

### About the user app

The public app is designed as a fast directory browser for phones and desktop screens:

- sticky search and filter bar so discovery controls stay visible while scrolling
- compact mobile layout with reduced card height and icon-based quick actions
- local browser cache for:
  - directory snapshots
  - saved institutes
  - listing rotation state
- live detail fetch on card open so the full record is only loaded when needed
- local API mode for development and GitHub Raw mode for standalone deployments

### User app configuration

The public app is configured from `user/.env`.

Most important values:

- `VITE_ADMIN_API_ORIGIN`: where the local dev app proxies API requests
- `VITE_DEV_HOST`: host used by the Vite dev server
- `VITE_DEV_PORT`: port used by the Vite dev server
- `VITE_USER_BASE`: base path used when building the public app
- `VITE_PUBLIC_DATA_ROOT`: GitHub Raw base URL for standalone hosting

Behavior rules:

- if `VITE_PUBLIC_DATA_ROOT` is empty, the public app uses the local admin API
- if `VITE_PUBLIC_DATA_ROOT` is set, the public app reads `basic/` and `detailed/` data from that remote source
- after changing `VITE_PUBLIC_DATA_ROOT` or `VITE_USER_BASE`, rebuild the user app

The current public app footer is also controlled in code from:

- `user/src/App.jsx`

That is where the `Azaseros` branding block and optional public contact links are defined.

## 4. Plans and future price changes

Plans are controlled from:

- `admin/config/plan-catalog.json`

Current catalog:

- `Annual`: 12 months at the standard monthly rate
- `Yearly`: 12 months, 10% discount
- `6 Months`: 6 months, 5% discount

Current base monthly rate:

- `base_monthly_rate: 100`

### How to change the rate later

If you later change:

```json
"base_monthly_rate": 100
```

to:

```json
"base_monthly_rate": 200
```

then the behavior is now:

- old paid records stay unchanged in `admin/data/payments/<slug>/*.json`
- the current active subscription amount stays as it was until the next renewal cycle
- the next new renewal uses the latest catalog amount by default
- editing an old payment record keeps that old stored amount unless you manually change it

This means past payments do not conflict with future pricing.

### Where the old amount is preserved

Historical payment snapshots are stored per payment file:

- `admin/data/payments/<business-slug>/<payment-id>.json`

So reports always read the real paid amount from the saved payment history.

## 5. Reports, analytics, and expenses

The Reports app now includes:

- monthly and yearly views
- a console-style focus panel so the selected scope is explicit
- timeframe-aware filters:
  - yearly mode: choose a year
  - monthly mode: choose a year and then a month
- box-grid performance graph for revenue, expenses, and net
- add / edit / delete expense management
- staff salary payments included in expense and net calculations
- payroll entries visible in the expense ledger
- CSV export with report-friendly structure

Expense storage file:

- `admin/data/expenses.json`

Every expense record contains:

- title
- category
- amount
- currency
- incurred date
- notes

Use the Reports window to:

- start from the analytics summary cards
- switch between `Monthly` and `Yearly`
- in `Yearly`, compare full years and focus one selected year
- in `Monthly`, load one selected year and focus one selected month
- add a new expense
- edit an existing expense
- delete an expense
- review payroll expenses together with manual expenses
- export the current report as CSV

Yearly CSV export now includes:

- the selected year summary
- a monthly breakdown for that same year
- all 12 months even when a month has no data

## 6. Mail Center setup and one-click sending

Mail Center can send to both businesses and staff from the admin desktop once SMTP is configured.

Required `admin/.env` values:

```env
ADMIN_SMTP_HOST=smtp.gmail.com
ADMIN_SMTP_PORT=587
ADMIN_SMTP_SECURE=false
ADMIN_SMTP_USER=your-smtp-user
ADMIN_SMTP_PASS=your-app-password
ADMIN_EMAIL_FROM_NAME=EduData Nepal
ADMIN_EMAIL_FROM_ADDRESS=no-reply@example.com
ADMIN_EMAIL_REPLY_TO=reply@example.com
```

Setup flow:

- open `Config App`
- fill the `Email Delivery` fields in `Admin Env`
- save the admin env
- restart the admin server
- open `Mail Center`
- choose businesses, staff, or both
- press `Send Email`

Available merge tags now include both business and staff values:

- `{{recipient_name}}`
- `{{business_name}}`
- `{{district}}`
- `{{website_ready}}`
- `{{staff_name}}`
- `{{staff_role}}`
- `{{staff_department}}`

Shortcuts:

- the business selection bar can open Mail Center with the selected business prefilled
- Staff Manager can open Mail Center with the selected staff member prefilled
- after SMTP is configured, sending from Mail Center is a one-click action inside the admin app

### Business confirmation and ID card email

The same SMTP setup is now used for:

- business registration confirmation mail when a new business is saved
- business ID card email from `ID Manager`
- manual one-click mail from `Mail Center`

Recommended simple setup for Gmail:

- turn on 2-step verification for the Gmail account
- create an App Password in Google Account security
- use that app password in `ADMIN_SMTP_PASS`

Example:

```env
ADMIN_SMTP_HOST=smtp.gmail.com
ADMIN_SMTP_PORT=587
ADMIN_SMTP_SECURE=false
ADMIN_SMTP_USER=yourgmail@gmail.com
ADMIN_SMTP_PASS=your-16-char-app-password
ADMIN_EMAIL_FROM_NAME=EduData Nepal
ADMIN_EMAIL_FROM_ADDRESS=yourgmail@gmail.com
ADMIN_EMAIL_REPLY_TO=yourgmail@gmail.com
```

Business save flow:

- open `Add Business`
- save the business to generate the business ID
- keep `Send confirmation email after save` checked if you want the email to go immediately
- keep `Include ID card in confirmation email` checked if you want the default card included
- use `ID Manager` later if you want to refine the institution-head card and resend it

### Backup Vault and git ignore

`Backup Vault` creates restore points inside `backup/` and those snapshots are ignored by git.

Generated output in `user_out/` is also ignored by git now, so generated websites and APK output stay local unless you copy them somewhere intentionally.

## 7. Two-repo publishing and GitHub Raw setup

There are two separate admin desktop apps for git work:

- `Source App`: pull, stage, commit, and push the full project repository
- `DB Manager`: mirror only `admin/data/basic` and `admin/data/detailed` into a second repository

That means you can keep:

- all code, payments, expenses, and notes in the main repo
- only public business JSON in the public-data repo

If you created another GitHub repo for public data, upload only:

- `basic/`
- `detailed/`

You do not need to upload:

- `payments/`
- `expenses.json`
- `notes.json`

### Public data repo structure

Option A:

```text
your-data-repo/
├── basic/
│   └── _cards.json
└── detailed/
    ├── business-1.json
    └── business-2.json
```

Then in `user/.env`:

```env
VITE_PUBLIC_DATA_ROOT=https://raw.githubusercontent.com/<github-username>/<repo-name>/<branch>
```

Do not use the GitHub repository page URL:

```text
https://github.com/<github-username>/<repo-name>/tree/<branch>
```

Option B:

```text
your-data-repo/
└── data/
    ├── basic/
    │   └── _cards.json
    └── detailed/
        ├── business-1.json
        └── business-2.json
```

Then in `user/.env`:

```env
VITE_PUBLIC_DATA_ROOT=https://raw.githubusercontent.com/<github-username>/<repo-name>/<branch>/data
```

Do not use:

```text
https://github.com/<github-username>/<repo-name>/tree/<branch>/data
```

After changing `user/.env`, restart the user dev server or rebuild the user app.

### Which repo should each app use?

Use these defaults when the full project is this repo and the public data is a second clone:

```env
ADMIN_GIT_REPO_PATH=.
ADMIN_GIT_REMOTE=origin
ADMIN_GIT_DEFAULT_BRANCH=main

ADMIN_DB_REPO_PATH=../your-public-data-repo
ADMIN_DB_REMOTE=origin
ADMIN_DB_DEFAULT_BRANCH=main
ADMIN_DB_BASIC_TARGET=basic
ADMIN_DB_DETAILED_TARGET=detailed
```

This means:

- `Source App` pushes the entire `MAIN/` repository
- `DB Manager` pushes only mirrored files into `../your-public-data-repo`

### DB Manager env setup

Use the admin home `DB Manager` app to mirror business files into a second repository.

Recommended `admin/.env` values:

```env
ADMIN_DB_REPO_PATH=../your-public-data-repo
ADMIN_DB_REMOTE=origin
ADMIN_DB_DEFAULT_BRANCH=main
ADMIN_DB_BASIC_TARGET=basic
ADMIN_DB_DETAILED_TARGET=detailed
```

What DB Manager does:

- mirrors `admin/data/basic/*.json` into the target repo `basic/`
- mirrors `admin/data/detailed/*.json` into the target repo `detailed/`
- stages, commits, pulls, and pushes from the GUI
- keeps `payments`, `expenses`, and `notes` out of the public data repo

### Working with a second GitHub account

The second repo does not need to use the same GitHub account as the main repo.

What matters is this:

- the public-data repo is cloned locally on your PC
- its own `origin` remote points to the correct GitHub repository
- your git credentials for that repo are already working in normal command-line git

Example local setup:

```text
D:\SCHOOL_DND\MAIN
D:\SCHOOL_DND\school-dnd-public-data
```

```env
ADMIN_GIT_REPO_PATH=.
ADMIN_DB_REPO_PATH=../school-dnd-public-data
```

Example clone commands with two different accounts:

```bash
git clone https://github.com/your-main-account/MAIN.git MAIN
git clone https://github.com/other-account/school-dnd-public-data.git school-dnd-public-data
```

If you prefer SSH and each repo belongs to a different account, configure separate SSH aliases in your SSH config, then clone each repo with its matching alias. The admin app does not manage credentials itself; it just runs git inside the repo path you configured.

Typical DB Manager flow:

1. Set `ADMIN_DB_REPO_PATH` to the cloned public data repository on your PC.
2. Open `DB Manager` from the admin desktop.
3. Click `Mirror Data`.
4. Click `Stage All`, `Commit`, and `Push`, or use `Quick Publish`.

Common mistakes:

- pointing `ADMIN_DB_REPO_PATH` at the same repo as `ADMIN_GIT_REPO_PATH`
- forgetting to clone the public-data repo locally before opening `DB Manager`
- pushing `payments/`, `expenses.json`, or `notes.json` to the public-data repo
- setting `VITE_PUBLIC_DATA_ROOT` to the wrong folder depth for your raw GitHub structure
- changing `admin/.env` or `user/.env` and not restarting or rebuilding the relevant app afterward

## 7. Public app behavior

The public app now works like this:

- list page fetch: `basic/_cards.json`
- detail fetch on click: `detailed/<slug>.json`
- fetch mode: live with `no-store`
- detail close behavior: detail data is removed from state and fetched again next time
- saved businesses: stored only in browser local storage
- business list fallback cache: stored in the browser so the last successful directory can still be shown if live fetch fails

Only businesses with active subscriptions are shown publicly.

## 8. Certification and public listing order

Featured promotion has been removed from both admin and user apps.

Use this field instead:

- `is_certified`

How certification works now:

- certification is manual
- the admin form includes a `Physically certified` checkbox
- existing featured records are not auto-converted into certified records
- the user app only shows certification as a compact certified badge on listing cards

How public listing order works now:

- the user app rotates business exposure on each refresh instead of always showing the same fixed order
- filtered results are also rotated
- the rotation profile is cached in the browser so ordering stays stable during a session but changes across refresh cycles

## 9. How to modify things later

### Change plan prices, duration, or discount

Edit:

- `admin/config/plan-catalog.json`

### Change business content

Use the admin panel, or directly edit:

- `admin/data/basic/_cards.json`
- `admin/data/detailed/*.json`

### Change payment history

Edit payment files inside:

- `admin/data/payments/<slug>/`

### Change expenses

Use the Reports expense manager, or edit:

- `admin/data/expenses.json`

### Change the GitHub Raw source

Edit:

- `user/.env`

Then change:

- `VITE_PUBLIC_DATA_ROOT`

### Change the DB mirror target repo or folders

Edit:

- `admin/.env`

Then change:

- `ADMIN_DB_REPO_PATH`
- `ADMIN_DB_BASIC_TARGET`
- `ADMIN_DB_DETAILED_TARGET`

### Change where the user build is served

Edit:

- `admin/.env`
- `user/.env`

Then change:

- `ADMIN_USER_ROUTE`
- `VITE_USER_BASE`

## 10. Recommended workflow

1. Update businesses in the admin app.
2. Renew subscriptions in Payment Center.
3. Add expenses in Reports.
4. Use `Source App` when you want to commit and push the full project repo.
5. Use `DB Manager` to mirror and push only `basic/` and `detailed/` to the public data repo.
6. Build and deploy the user app.

## 11. Demo data

If you want to regenerate the sample data after changing the plan catalog:

```bash
cd admin
node scripts/generate-dummy-data.js
```

Do this only for demo/sample data, because it overwrites the generated dummy dataset.

The dummy-data generator now creates businesses with `is_certified: false` by default so certification remains a manual admin decision.

command to launch the app : edudata-admin

add generated files to be seen in generator studio so the data and output don't be duplicate , show file generated and non generated section. 
>>>>>>> 810247e (Update directory data 2026-04-04)
