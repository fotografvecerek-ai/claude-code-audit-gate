---
name: secret-management
description: Bezpečné ukládání a čtení API klíčů, tokenů a hesel v projektu — úložiště tajemství operačního systému (Windows Credential Manager, macOS Keychain, Linux Secret Service), nikdy .env, chat ani argument příkazu. Použij, když projekt potřebuje nové tajemství nebo s ním pracuje.
user-invocable: true
---

# Tajemství v projektu — úložiště operačního systému

## Pravidla (bez výjimky)
- Tajemství (API klíč, token, heslo, connection string) **nikdy** do `.env` v repu, kódu, commitu, chatu, logu ani jako **argument příkazu**
  (argumenty vidí výpis procesů a chybové hlášky). Cokoliv projde kontextem agenta, zůstane v historii session.
- Hodnotu **zadává člověk ve svém terminálu**; agent ji nikdy nevidí — ověřuje jen, že existuje (prvních pár znaků).
- Do programu jde tajemství přes **proměnnou prostředí** nebo čtením z úložiště za běhu (`env=` u podprocesu, ne argv).
- Produkční tajemství patří do nastavení hostingu (env proměnné platformy), ne do souboru.
- Volání služby s tajemstvím obal ošetřením chyb **bez** vypsání syrové výjimky (umí vytisknout URL/hlavičku s tokenem).
- Před commitem sken tajemství v diffu (gitleaks nebo vzory `Bearer`, `sk-`, `AKIA`, connection string s heslem); failnutý sken se neobchází.
- Agent nikdy nespouští okno pro zadání hesla na stroji, kde nikdo nesedí — visí navždy.

## Uložení (spustí ČLOVĚK, hodnota se nevypisuje)
Všechny systémy (Python 3 + `pip install keyring`):
```
python -c "import keyring,getpass; keyring.set_password('<sluzba>','<uzivatel>', getpass.getpass('Hodnota: '))"
```
Bez Pythonu — macOS: `security add-generic-password -s <sluzba> -a <uzivatel> -w` (zeptá se na hodnotu) ·
Linux: `secret-tool store --label=<sluzba> service <sluzba> user <uzivatel>` (zeptá se na hodnotu) ·
Windows: Správce pověření → Obecná pověření → Přidat (síťová adresa = `<sluzba>`).

## Ověření (smí agent — jen prefix)
```
python -c "import keyring; k=keyring.get_password('<sluzba>','<uzivatel>'); print('prefix:', k[:4] if k else 'CHYBI')"
```

## Čtení v kódu
```python
import keyring, os
key = keyring.get_password("<sluzba>", "<uzivatel>") or os.environ.get("<NAZEV_ENV>")
if not key: raise SystemExit("tajemství chybí — uloží ho vlastník (viz skill secret-management)")
```
Node: čti z `process.env` a proměnnou naplň spouštěčem z úložiště (`keyring` / `security find-generic-password -s <sluzba> -w` /
`secret-tool lookup service <sluzba>`), ne ze souboru v repu.

## Rotace a únik
Uniklé tajemství = **nejdřív zneplatnit u poskytovatele**, pak uložit nové stejným postupem (stejná dvojice služba + uživatel) a
ověřit prefixem. Smazání z gitu nestačí — historie a kopie ho drží dál.
