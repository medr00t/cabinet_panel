# Cabinet Panel — Centre Dentaire Riad El Ansari

Desktop app (Tauri + React) for the clinic's reception and doctor: patient files modelled on the paper
card (N° Billet, couverture médicale, R.C., devis), the acts / quotes / payments ledger, a tooth chart
(odontogramme) with per-tooth state and remarks, the official CNSS dental care sheet (prefilled, editable,
printable and saved in the dossier), appointments and the daily cash register. All laptops share one MySQL
database; the doctor's machine also writes a daily Excel backup after each login.

Roles: **doctor** (everything) and **reception** (no deleting patients, acts or payments; limited
appointment actions).

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
