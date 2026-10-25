# Cabinet Panel — Centre Dentaire Riad El Ansari

Desktop app (Tauri + React) for the clinic's reception and doctor: patient files modelled on the paper
card (N° Billet, couverture médicale, R.C., devis), the acts / quotes / payments ledger, a tooth chart
(odontogramme) with per-tooth state and remarks, the official CNSS dental care sheet (prefilled, editable,
printable and saved in the dossier), appointments and the daily cash register. All laptops share one MySQL
database; the doctor's machine also keeps an Excel backup up to date after each login (one workbook per
month, one sheet per day, one sheet for the month's new clients).

Roles: **doctor** (everything) and **reception** (no deleting patients, acts or payments; limited
appointment actions).

## CNSS dental sheet

The sheet is the official CNSS form (ref. 610-1-04, `cnssPage.pdf`, identical to the file on cnss.ma): one A4 sheet in
landscape, folded in half, so two sides with two A5 panels each. The app fills the two right-hand panels (front: insured,
beneficiary, INP, type of care, signatures; back: acts table and tooth diagram, with treated teeth circled).
**Ouvrir en PDF** produces the two landscape A4 pages; print them double-sided (flip on the short edge), then fold.
In the preview, click any mark to remove it (it stays blank to be written by hand); click its dotted outline to put it back.
Untick "Imprimer avec le formulaire" to print only the data on an already printed official form.

## Run it

```
npm install
npm run tauri dev          # real app (needs Rust, a reachable MySQL and cabinet_config.json)
npm run dev                # UI only, in a browser, against an in-memory mock backend
```

Server (database) setup, the config file and the network discovery are described in
[LAN_SETUP.md](LAN_SETUP.md). The database runs in Docker: `cd server && docker compose up -d`.

## Test it

```
cd server && docker compose up -d
cd ../src-tauri && cargo test -- --include-ignored --test-threads=1
```

The integration tests run the backend commands against the real MySQL (roles and privileges, ledger
rules, concurrent payments, discovery).

## Upgrading an existing database

Fresh installs get everything from `database/schema.sql` automatically. A database created earlier needs the
missing migrations, once each and in order:

- `database/migrations_001_ledger.sql` — acts and payments ledger, N° billet, couverture médicale
- `database/migrations_002_teeth.sql` — tooth chart (per-tooth state and remarks)
- `database/migrations_003_cnss.sql` — CNSS sheets and clinic settings (dentist INP number, city)

```
docker exec -i cabinet-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" cabinet' < database/migrations_002_teeth.sql
```
