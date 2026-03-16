# Simulator

## Fáze 1: Vymezení hřiště (Spatial Context)

Nemůžeme generovat data pro celou Plzeň najednou, to by trvalo věčnost a mapa by byla nepřehledná.

* **Strategie:** Vybereme "Bounding Box" (např. širší centrum Plzně: od Náměstí Republiky po Jižní Předměstí).
* **Vstup:** Generátor si z PostGISu (z tabulky `edges`) vytáhne všechny segmenty silnic, které do tohoto boxu spadají. Známe jejich geometrii (Linestring) a ideálně i typ (OSM `highway` class - residential, primary atd.).

## Fáze 2: Modelování trajektorií (The "Virtual Fleet")

Senzor SITu neskáče, ale jede. Generátor proto nesmí tvořit izolované body, ale **trasy**.

* **Strategie:** Nasimulujeme virtuální průjezdy. Generátor vybere náhodný startovací bod A a náhodný cílový bod B v našem Bounding Boxu.
* **Provedení:** Pomocí `pgRouting` (nebo OSMnx) si nechá spočítat reálnou trasu (posloupnost hran).
* **Vzorkování (Sampling):** Virtuální auto "pojede" po této trase a každých $X$ metrů (např. každé 2 metry) "odplivne" datový bod (souřadnici interpolovanou přímo na linii silnice). K tomu přidá realistický `timestamp` (časový posun podle odhadované rychlosti).

## Fáze 3: Fyzikální model senzoru (Noise & Base Width)

Reálný LiDAR nemá 100% přesnost. Pokud by auto jelo ulicí a všechny body měly přesně `3.50 m`, vypadá to uměle.

* **Základní šířka:** Odvodíme ji od typu ulice. `primary` (hlavní tah) dostane default např. 6.5 m. `residential` (rezidenční v centru) dostane 3.5 m.
* **Gaussovský šum:** Na každý vygenerovaný bod aplikujeme statistický šum. Místo `3.50` senzor nahlásí hodnoty z normálního rozdělení: `3.48`, `3.52`, `3.55`, `3.45`.
* **GPS šum (Jitter):** Ten bod nesmí ležet matematicky naprosto přesně na ose ulice. Aplikujeme drobný rozptyl (např. $\pm$ 0.5 metru kolmo na osu ulice), aby data tvořila ten typický "mrak bodů" (Point Cloud), se kterým si pak DBSCAN musí poradit.

## Fáze 4: Injekce anomálií (Ground Truth Generation)

Tohle je **nejdůležitější krok pro tvou obhajobu**. Potřebujeme, aby na mapě vznikla ta krásná červená a oranžová "úzká hrdla".

* **Strategie:** Nenecháme generování překážek náhodě. Explicitně do generátoru naprogramujeme "Seedy" (zárodky).
* **Provedení:** Vybereme konkrétní segmenty v databázi (např. v ulici Kollárova řekneme: "na staničení 50m až 70m je špatně zaparkovaná dodávka").
* **Override:** Když virtuální auto projíždí tímto injektovaným úsekem, generátor ignoruje Fázi 3 a "natvrdo" tam vygeneruje mrak bodů s šířkou např. `2.4 m`. Tím zaručíme 100% spolehlivou testovací sadu – přesně víme, kde anomálie jsou, a můžeme ověřit, jestli je tvůj backendový DBSCAN správně našel.

## Fáze 5: Data Pipeline a Výkon (Bulk Inserts)

Pokud vygenerujeme 50 virtuálních průjezdů městem, bavíme se o desítkách až stovkách tisíc bodů.

* **Strategie:** Pokud by generátor posílal do databáze každý bod zvlášť (v cyklu přes `INSERT INTO`), skript poběží hodinu.
* **Provedení:** Vše se musí držet v paměti (např. v Pandas DataFrame nebo listu slovníků) a do PostGISu to musíme poslat v "dávkách" (Bulk Insert / `COPY` příkaz / `executemany`), např. po 10 000 záznamech.

---

## Shrnutí plánu

Díky tomuto přístupu získáš:

1. **Vizuální "Wow" efekt:** Heatmapa bude plná reálných čar (trajektorií), ne rozsypaného čaje.
2. **Validaci pro DBSCAN:** Získáš referenční data. Víš, že jsi injektoval 5 překážek. Tvůj algoritmus musí najít přesně těch 5 překážek. (To se mimochodem skvěle píše do diplomky do kapitoly Testování!).
