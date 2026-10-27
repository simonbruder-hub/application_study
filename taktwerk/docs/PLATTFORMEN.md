# Plattformen: Code-Signing (Windows), Android, iPhone

Stand: Oktober 2026. Preise und Bedingungen ändern sich, vor dem Kauf auf den verlinkten Seiten prüfen.

## Windows: SmartScreen-Warnung und Code-Signing

Ohne Signatur zeigt Windows beim ersten Start «Der Computer wurde durch Windows geschützt». Mit Signatur zeigt der
Installer den Herausgeber; die Warnung verschwindet, sobald der Herausgeber genug Ruf hat (Downloads ohne Probleme).
Seit 2024 überspringen auch teure EV-Zertifikate diesen Aufbau des Rufs nicht mehr.

| Möglichkeit | Kosten | Bedingungen | Passt? |
|---|---|---|---|
| [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) (früher Trusted Signing) | ab 9.99 USD pro Monat | Einzelpersonen nur aus den USA und Kanada; Organisationen (Firma) auch aus der Schweiz | Erst mit eigener Firma |
| [SignPath Foundation](https://signpath.org/) | gratis | Open-Source-Lizenz (OSI), Build vollautomatisch aus dem Repository (GitHub Actions passt), Projekt aktiv gepflegt | Ja, wenn das Repository eine Lizenz bekommt (z. B. MIT) |
| [Certum](https://shop.certum.eu/code-signing.html) Code Signing (Cloud, SimplySign) | ca. 50 bis 170 EUR pro Jahr | Ausweisprüfung, Schlüssel in der Cloud oder auf Token; Signieren in GitHub Actions nur umständlich | Möglich, aber Handarbeit |
| Nichts tun | 0 | Einmal «Trotzdem ausführen», Updates danach laufen über den eigenen Updater ohne Warnung | Für den Eigengebrauch genügend |

**Empfehlung:** Vorerst ohne Zertifikat. Die Warnung kommt nur bei der ersten Installation, Updates installiert die App
selbst (signiert mit dem eigenen Updater-Schlüssel). Sobald die App weitergegeben wird: Repository unter eine
Open-Source-Lizenz stellen und bei SignPath Foundation bewerben; im Workflow kommt dann nach `tauri build` ein
Signierschritt für `Taktwerk-Setup.exe` dazu.

## Android

| Weg | Was es ist | Timer im Hintergrund | Aufwand |
|---|---|---|---|
| PWA (heute) | In Chrome «App installieren» | Hintergrund-Modus mit stiller Audiospur, Benachrichtigung nur solange die App lebt | keiner |
| TWA (Trusted Web Activity, z. B. mit PWABuilder) | Dieselbe PWA als Play-Store-App | wie PWA, keine echten Wecker | klein, Play-Konto 25 USD einmalig |
| Capacitor | Web-App in nativer Hülle, Plugins für Benachrichtigungen | geplante lokale Benachrichtigung (AlarmManager), klingelt auch bei geschlossener App | mittel, zweites Werkzeug neben Tauri |
| **Tauri 2 Android** | Dieselbe Hülle wie am Laptop, `tauri android build` | geplante lokale Benachrichtigung über `tauri-plugin-notification` (Schedule), klingelt auch bei geschlossener App | mittel, nutzt den vorhandenen Desktop-Code |

**Empfehlung:** Tauri 2 Android. Die App, `src/app/desktop.ts` und die Rust-Seite sind schon da; statt des Weckers
im eigenen Thread plant Android eine Benachrichtigung zum Phasenende. Verteilen als APK über GitHub Releases
(oder später Play Store). Bis dahin bleibt die PWA mit Hintergrund-Modus.

## iPhone

Als PWA (Safari → Teilen → «Zum Home-Bildschirm») laufen Oberfläche, Offline-Speicher und Sync. Grenzen: Sobald die
App im Hintergrund ist oder das Handy gesperrt, hält iOS das JavaScript an. Kein Ton zum Phasenende, keine geplanten
lokalen Benachrichtigungen. Benachrichtigungen gehen nur als Web Push vom Server (seit iOS 16.4, nur für Apps auf dem
Home-Bildschirm).

| Weg | Phasenende bei gesperrtem iPhone | Aufwand |
|---|---|---|
| PWA wie heute | nein | keiner |
| PWA + Web Push über Supabase | ja, als Push vom Server (Supabase plant den Versand zum Phasenende) | mittel, Server-Teil nötig |
| Native App (Tauri 2 iOS oder Capacitor) | ja, lokale Benachrichtigung | gross: Apple-Entwicklerkonto 99 USD pro Jahr, Mac oder macOS-Runner zum Bauen, TestFlight |

**Empfehlung:** PWA beibehalten und später Web Push über Supabase ergänzen (hilft auch, wenn der Laptop zu ist).
Eine native iPhone-App lohnt sich erst, wenn die App veröffentlicht wird.
