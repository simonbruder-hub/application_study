# Supabase einrichten – Synchronisation zwischen Laptop und Handy

Taktwerk speichert alles zuerst lokal auf dem Gerät und funktioniert auch ohne Internet.
Damit Laptop und Handy dieselben Daten sehen und der laufende Timer auf beiden Geräten erscheint,
synchronisiert die App mit einem eigenen, kostenlosen Supabase-Projekt (PostgreSQL-Datenbank,
Anmeldung und Realtime).

Einmaliger Aufwand: etwa 15 Minuten. Du brauchst ein GitHub- oder E-Mail-Konto für Supabase.

| Datei | Zweck |
|---|---|
| [`schema.sql`](schema.sql) | Tabellen, Trigger, Rechte und Realtime – im SQL-Editor ausführen |
| [`test/run.sh`](test/run.sh) | prüft das Schema lokal gegen eine Wegwerf-Datenbank (`npm run db:test`) |

> Die Bezeichnungen im Supabase-Dashboard ändern sich gelegentlich. Wenn ein Menüpunkt anders heisst,
> hilft die Suche im Dashboard (Taste `⌘K` bzw. `Ctrl+K`).

---

## 1. Supabase-Projekt anlegen (Free Tier)

1. Auf [supabase.com](https://supabase.com) mit «Start your project» ein Konto anlegen.
2. **New project** wählen:
   - **Name:** z. B. `taktwerk`
   - **Database Password:** «Generate a password» und in deinem Passwort-Manager speichern.
     Die App braucht es nicht, du aber für spätere Wartung.
   - **Region:** *Central EU (Zurich)*, sonst *Central EU (Frankfurt)*.
   - **Plan:** *Free*.
3. **Create new project** – nach ein bis zwei Minuten ist die Datenbank bereit.

## 2. Schema einspielen

1. Im Projekt links **SQL Editor** öffnen → **New query**.
2. Den gesamten Inhalt von [`schema.sql`](schema.sql) einfügen und **Run** klicken
   (bei einer Warnung zu «destructive operations» bestätigen: Das Skript löscht keine Daten,
   es ersetzt nur Policies und Trigger durch dieselbe aktuelle Fassung).
3. Erwartetes Ergebnis: *Success. No rows returned.*

Das Skript ist **idempotent**: Du kannst es jederzeit erneut ausführen, z. B. nach einem Update der App.
Bestehende Daten bleiben erhalten.

Angelegt werden die Tabellen `projects`, `milestones`, `work_packages`, `tasks`, `time_logs`,
`planned_blocks`, `active_timer_state` und `user_settings` – alle mit Row-Level-Security (RLS).
Im **Table Editor** erscheinen sie im Schema `public`, jeweils ohne den Hinweis «RLS disabled».

## 3. Anmeldung per 6-stelligem E-Mail-Code (OTP)

### 3.1 E-Mail-Anmeldung einschalten

**Authentication → Sign In / Providers → Email**

- **Enable Email provider:** an
- **Confirm email:** an
- **Email OTP Length:** `6`
- **Email OTP Expiration:** z. B. `3600` Sekunden (Code eine Stunde gültig)
- **Allow new users to sign up:** für die erste Anmeldung an lassen (siehe Tipp unten)

### 3.2 E-Mail-Vorlagen auf Code umstellen

**Authentication → Emails → Templates**. Ändere **beide** Vorlagen, denn Supabase verwendet bei der
allerersten Anmeldung «Confirm signup» und danach «Magic Link»:

- **Confirm signup**
- **Magic Link**

Entscheidend ist der Platzhalter `{{ .Token }}` – nur dann enthält die Mail einen Code statt
nur eines Links. Vorschlag für beide Vorlagen:

*Subject:* `Dein Anmeldecode für Taktwerk`

```html
<h2>Dein Anmeldecode</h2>
<p>Gib diesen Code in der Taktwerk-App ein:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;font-family:monospace">{{ .Token }}</p>
<p>Der Code ist eine Stunde gültig und kann nur einmal verwendet werden.</p>
<p>Falls du dich nicht anmelden wolltest, kannst du diese E-Mail ignorieren.</p>
```

Den Link (`{{ .ConfirmationURL }}`) lässt du am besten ganz weg, damit niemand versehentlich darauf tippt.

### 3.3 Warum ein Code statt eines Login-Links?

- **Installierte App auf Android:** Ein Link aus der Mail öffnet sich im Browser oder im eingebauten
  Browser der Mail-App, nicht in der installierten App. Die Anmeldung landet dann im falschen Fenster,
  und die App selbst bleibt abgemeldet. Den Code tippst du direkt in der App ein, die Anmeldung
  passiert genau dort, wo sie gebraucht wird.
- **Geräteübergreifend:** Mail auf dem Handy lesen, Code am Laptop eingeben – funktioniert.
- **Kein «verbrauchter» Link:** Manche Mail-Dienste öffnen Links zur Virenprüfung vorab und machen
  Einmal-Links dadurch ungültig. Einen Code kann niemand vorab «anklicken».

In der App: E-Mail-Adresse eingeben → «Code senden» → 6-stelligen Code eingeben → angemeldet.
Technisch: `supabase.auth.signInWithOtp({ email })` und danach
`supabase.auth.verifyOtp({ email, token, type: 'email' })`.

> **Tipp:** Wenn du dich auf allen Geräten angemeldet hast, kannst du **Allow new users to sign up**
> ausschalten. Dann kann niemand sonst ein Konto in deinem Projekt anlegen. Deine eigene Anmeldung
> per Code funktioniert weiterhin.

## 4. Site-URL und Redirect-URLs

**Authentication → URL Configuration**

- **Site URL:** `https://simonbruder-hub.github.io/apps/taktwerk/app/`
- **Redirect URLs** (mit «Add URL»):
  - `https://simonbruder-hub.github.io/apps/taktwerk/**`
  - für die Entwicklung zusätzlich `http://localhost:5173/**` (Vite) und `http://localhost:4173/**` (Vorschau)

Mit Codes werden diese Adressen kaum gebraucht. Supabase lehnt aber Anfragen ab, deren
Rücksprungadresse nicht in dieser Liste steht, deshalb sollten sie trotzdem stimmen.

## 5. Projekt-URL und anon key in die App eintragen

**Project Settings → API Keys** (bzw. **Data API**) zeigt die zwei Werte, die die App braucht:

| Wert | Beispiel | Wo eintragen |
|---|---|---|
| **Project URL** | `https://abcdefghijkl.supabase.co` | App → Einstellungen → Sync & Konto, Feld «Supabase-URL» |
| **Publishable key** `sb_publishable_…` (oder älterer *anon public key* `eyJhbGciOi…`) | `sb_publishable_…` | App → Einstellungen → Sync & Konto, Feld «Anon-Key (public)» |

Besser: als GitHub-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` hinterlegen (Repository → Settings → Secrets and variables → Actions → Variables). Dann ist die Verbindung in der veröffentlichten App auf allen Geräten schon vorbelegt. Beim Selbst-Bauen können die Werte auch in `taktwerk/.env.local` stehen:

```
VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi…
```

**Niemals** den `service_role`-Key bzw. *Secret key* (`sb_secret_…`) oder das Datenbank-Passwort
in die App oder ins Repository eintragen – diese umgehen jede Sicherheitsregel.

## 6. Realtime prüfen

Das Schema meldet alle acht Tabellen bei Realtime an. Kontrolle:

- **Database → Publications → `supabase_realtime`**: Alle acht Tabellen sind eingeschaltet.
- oder im SQL-Editor:

  ```sql
  select tablename from pg_publication_tables
   where pubname = 'supabase_realtime' order by tablename;
  ```

  Erwartet: `active_timer_state`, `milestones`, `planned_blocks`, `projects`, `tasks`,
  `time_logs`, `user_settings`, `work_packages`.

Praxistest: App auf Laptop und Handy öffnen und mit derselben E-Mail anmelden. Startest du den Timer
auf dem Laptop, erscheint er nach etwa einer Sekunde auf dem Handy und lässt sich dort pausieren.

Realtime beachtet dieselben Regeln wie die Datenbank: Jedes Gerät erhält nur Änderungen an
den eigenen Zeilen.

## 7. Kontrolle im SQL-Editor (optional)

```sql
-- RLS auf allen Tabellen aktiv? (erwartet: 8 Zeilen, alle true)
select relname, relrowsecurity from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;

-- Nach der ersten Anmeldung: deine Daten
select count(*) from public.projects;
select * from public.user_settings;
```

Hinweis: Im SQL-Editor arbeitest du als Administrator, RLS gilt dort nicht. Willst du dort Daten
korrigieren, erhöhe bei jeder Änderung `updated_at` so:

```sql
update public.tasks
   set title = 'Neuer Titel',
       updated_at = greatest(now(), updated_at + interval '1 millisecond')
 where id = '…';
```

Warum genau so:

- Die Geräte übernehmen eine Zeile vom Server nur, wenn ihr `updated_at` (bei Gleichstand
  `updated_by`) grösser ist als das ihrer eigenen Fassung. Ohne Erhöhung speichert der Server die
  Änderung zwar, die Geräte ignorieren sie aber und überschreiben sie bei der nächsten eigenen
  Änderung wieder.
- `updated_at = now()` allein reicht nicht immer: Ging die Uhr eines Geräts vor, liegen die
  Zeitstempel der App vor der Serverzeit. Dann gilt `now()` als älter, und der
  Last-Writer-Wins-Schutz verwirft die Änderung still.
- `+ 1 millisecond` statt einer kleineren Stufe, weil die App Zeitstempel auf Millisekunden genau
  vergleicht.

Lösche Zeilen nicht physisch, sondern setze `is_deleted = true` (mit derselben Erhöhung von
`updated_at`) – nur so erfahren die anderen Geräte von der Löschung. Zugehörige Einträge
(z. B. die Aufgaben eines Projekts) werden dabei nicht mitgelöscht; ganze Projekte löschst du
deshalb besser in der App.

## 8. Free Tier – was du wissen solltest

Stand 2025, Details auf [supabase.com/pricing](https://supabase.com/pricing):

- **Pausierung nach Inaktivität:** Ein Free-Projekt wird pausiert, wenn rund eine Woche lang keine
  Anfragen kommen. Die App läuft dann einfach lokal weiter (Sync-Status «Offline – lokal gespeichert»).
  Reaktivieren: Dashboard öffnen → **Restore project**, nach wenigen Minuten synchronisiert die App
  alles Ausstehende. Wer die App regelmässig nutzt, merkt davon nichts.
- **Grenzen:** 2 aktive Free-Projekte je Konto, 500 MB Datenbank, 5 GB Datenverkehr pro Monat,
  50'000 aktive Nutzer pro Monat, Realtime mit 200 gleichzeitigen Verbindungen und 2 Mio. Nachrichten
  pro Monat. Für eine Person mit mehreren Geräten reicht das um ein Vielfaches.
- **E-Mail-Versand:** Der eingebaute Mail-Versand ist nur für kleine Mengen gedacht (wenige Mails pro
  Stunde, je nach Stand nur an Adressen von Mitgliedern deiner Supabase-Organisation). Für dich
  allein genügt das. Kommt kein Code an: Spam-Ordner prüfen, ein paar Minuten warten. Für weitere
  Nutzer einen eigenen SMTP-Dienst eintragen (**Authentication → Emails → SMTP Settings**).
- **Backups:** Im Free Tier gibt es keine herunterladbaren automatischen Backups. Exportiere deine
  Daten ab und zu über die Excel-Funktion der App.

## 9. Warum der anon key öffentlich sein darf

Der anon key steckt in jeder ausgelieferten Web-App und ist damit für jeden sichtbar – das ist so
vorgesehen. Er sagt nur «diese Anfrage gehört zu diesem Projekt» und gibt die Rolle `anon`.
Geschützt sind die Daten durch die Datenbank selbst:

1. Die Rolle `anon` (nicht angemeldet) hat auf keiner Tabelle irgendein Recht.
2. Nach der Anmeldung schickt die App zusätzlich ein persönliches, signiertes Token (JWT) mit
   deiner Nutzer-ID. Damit gilt die Rolle `authenticated`.
3. **Row-Level-Security** erlaubt dieser Rolle nur Zeilen mit `user_id = auth.uid()` – also
   ausschliesslich deine eigenen. Fremde Zeilen sind weder lesbar noch änderbar noch per
   Fremdschlüssel referenzierbar.
4. Physisches Löschen ist über die API gar nicht möglich, nur Soft-Delete.

Wer deinen anon key kennt, kann sich höchstens ein eigenes Konto anlegen (abschaltbar, siehe Tipp in
Abschnitt 3) und sieht dann nur seine eigenen, leeren Tabellen. Geheim bleiben müssen nur der
`service_role`-/Secret key und das Datenbank-Passwort.

## 10. Schema aktualisieren und lokal testen

- **Aktualisieren:** Neue Fassung von `schema.sql` einfach erneut im SQL-Editor ausführen.
- **Lokal testen** (ohne Supabase, ohne Internet): Mit installiertem PostgreSQL 16
  (`sudo apt install postgresql-16`) im Ordner `taktwerk/`

  ```bash
  npm run db:test        # entspricht: bash supabase/test/run.sh
  ```

  Das Skript startet eine Wegwerf-Datenbank, bildet die nötigen Teile von Supabase nach
  (`test/stubs.sql`), lädt `schema.sql` zweimal (Idempotenz) und prüft mit `test/tests.sql` unter
  anderem RLS zwischen zwei Nutzern, Last-Writer-Wins, den Sync-Cursor, eindeutige Codes,
  Fremdschlüssel, CHECK-Regeln und die Realtime-Anmeldung. Danach wird alles wieder gelöscht.

## 11. Fehlerbehebung

| Meldung / Symptom | Ursache und Lösung |
|---|---|
| `permission denied for table …` | Nicht angemeldet (Rolle `anon`). In der App anmelden. |
| `new row violates row-level security policy` | Zeile gehört einem anderen Nutzer oder die Sitzung ist abgelaufen. Ab- und wieder anmelden. |
| `duplicate key value violates unique constraint "projects_project_code_uidx"` | Derselbe Projekt-Code ist schon vergeben (z. B. offline auf zwei Geräten angelegt). Die App benennt um und meldet das; sonst Code ändern. |
| `violates foreign key constraint …` | Ein Eintrag verweist auf ein Projekt/Paket, das (noch) nicht auf dem Server ist. Wird beim nächsten Sync automatisch nachgeholt. |
| Es kommt eine Mail mit Link, aber ohne Code | Vorlage enthält kein `{{ .Token }}` – Abschnitt 3.2, **beide** Vorlagen. |
| Kein Code kommt an | Spam-Ordner, Mail-Limit des Free Tiers (Abschnitt 8), Adresse vertippt. |
| App meldet dauerhaft «Offline», obwohl Internet da ist | Projekt pausiert → Dashboard → **Restore project**. |
| Änderung im SQL-Editor «verschwindet» | `updated_at` wurde nicht oder nicht genug erhöht – `greatest(now(), updated_at + interval '1 millisecond')` verwenden (Abschnitt 7). |
