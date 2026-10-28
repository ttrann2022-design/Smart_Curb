# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Company console

A second app built from this repo for the vendor: customers, quote requests and
where the system is deployed. It shares the design system, sign-in and the
Live/Simulation switch, but its bundle has none of the customer dashboard (and the
dashboard's has none of it); `scripts/check-build.mjs` checks both directions.

- `npm run dev:console`: run it locally (`.env.console` sets `VITE_APP_MODE=console`).
- `npm run build:console`: builds into `dist-console/`; `npm run check:console` checks it.
- Deploy: `firebase deploy --only hosting --config firebase.console.json`.

`firebase.console.json` deploys to the hosting site `smartcurb-console`, a
placeholder. Create the site first (`firebase hosting:sites:create <id>`) and, if
that ID was taken, put the one you got in `"site"`.

Access: after sign-in the console reads `platformAdmins/<uid>`, which is set to
`true` by hand in the Firebase console. The database rules are what actually
restrict `sites/`, `leads/` and `lots/<id>/siteId` to platform admins.
