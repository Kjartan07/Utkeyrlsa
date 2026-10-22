# LEIÐ — Sendingastjórn (fyrsta útgáfa)

Vefforrit fyrir sendibílstjóra: bæta sendingum við, sjá þær á korti, breyta röð og merkja afhentar.

## 1. Opna með VS Code og Live Server

1. Afþjappaðu ZIP-skránni.
2. Opnaðu **möppuna** `sendingakort_verkefni` í VS Code.
3. Opnaðu `index.html` og veldu **Open with Live Server**.
4. Vafri opnast (yfirleitt `http://127.0.0.1:5500/index.html`).
5. Þegar spurt er „Viltu bæta heimilisfangi við listann?“ velurðu **Já**.
6. Prófaðu t.d. götuheiti, húsnúmer og bæjarfélag. Smelltu á **Skrá heimilisfang**.

**Þú þarft nettengingu** til að hlaða kortinu og finna heimilisföng.

## 2. Keyra Python-útgáfuna (valfrjálst)

Python 3.9+ er nóg; engin pip-uppsetning nauðsynleg.

Opnaðu Terminal inni í verkefnismöppunni:

```bash
python server.py
```

Opnaðu síðan `http://127.0.0.1:5000` í vafra. Python sér þá um heimilisfangaleitina í gegnum `/api/geocode`. Í Live Server er hún unnin af JavaScript.

## 3. Eiginleikar

- Velkomin spurning um hvort eigi að bæta heimilisfangi við.
- Heimilisfang breytt í kortapinna (geocoding).
- Skráning stuttrar athugasemdar við sendingu.
- Sendingar birtast sem númeraðir pinnar á korti.
- Færa sendingar upp/niður eða draga til í listanum.
- „Raða“ flokkar óafhentar sendingar með einfaldri nearest-neighbor reiknireglu.
- Velja upphafsstað á kortinu; notað í sjálfvirkri röðun.
- „Setja pinna“ gerir kleift að skrá stað handvirkt án heimilisfangaleitar.
- Merkja sendingu afhenta, fela afhentar og eyða sendingum.
- Vista sjálfvirkt í `localStorage` í vafranum.
- Aðlögun fyrir minni skjái.

**Mikilvægt:** Tengilína á korti er bein lína á milli áfangastaða, **ekki alvöru akstursleið**. Sjálfvirk röðun tekur ekki tillit til vega, umferðar, lokana eða aksturstíma.

## 4. Hvað gera skrárnar?

| Skrá | Hlutverk |
|---|---|
| `index.html` | Uppbygging síðunnar: form, listi, kort, gluggar |
| `style.css` | Litir, stærðir, útlit og farsímasnið |
| `app.js` | Viðbrögð við smellum, pinnar, röðun, gögn |
| `server.py` | Valfrjáls Python-þjónn fyrir vefsíðu og leit |
| `README.md` | Þessar leiðbeiningar |

## 5. Hvar breyti ég?

- **Útlit:** `style.css`, efst eru helstu litir; flestir stílar eru þar.
- **Textar / form:** `index.html`.
- **Röðun sendinga:** `sortByNearest()` í `app.js`.
- **Map og miðja:** `DEFAULT_VIEW` / `DEFAULT_ZOOM` í `app.js`.
- **Kortaveita / heimilisfangaleit:** `CONFIG` í `app.js`, `GEOCODER` í `server.py`.

## 6. Takmarkanir áður en fyrirtæki tekur kerfið í notkun

Þetta er **prufugrunnur**, ekki fullbúið kerfi fyrir fyrirtæki. Það vantar innskráningu,
notendareikninga, miðlægan gagnagrunn, heimildir, afritun, raunverulega leiðsögn og
viðeigandi rekstrarsamninga fyrir korta- og heimilisfangaþjónustu.

Heimilisföng og athugasemdir eru geymd **eingöngu í vafranum sem þau eru skráð í**.
Þau samstillast ekki milli bílstjóra eða tækja. Hreinsun vafragagna getur eytt þeim.
Gætið þess að setja ekki viðkvæmar persónuupplýsingar í opinbera prufuþjónustu.

Til að prófa notast verkefnið við **Leaflet**, kortaflísar frá OpenStreetMap og opinbera
**Nominatim** heimilisfangaleit. Nominatim leyfir að hámarki **1 beiðni á sekúndu**,
heimilar ekki autocomplete og er ekki hentugur grunnur fyrir rekstur fyrirtækis í stærri skala.
Fyrir alvöru rekstur þarf að velja viðeigandi korta-/geocoding-veitu og fylgja skilmálum hennar.

Stefnur:
- https://operations.osmfoundation.org/policies/nominatim/
- https://operations.osmfoundation.org/policies/tiles/
- https://leafletjs.com/

## 7. Hugsanleg næstu skref

1. Setja upp sameiginlegan gagnagrunn og aðgang fyrir marga bílstjóra.
2. Velja akstursleiðir eftir raunverulegum vegum og aksturstíma.
3. Innflutningur á sendingum úr Excel/CSV.
4. Velja bíl og úthluta sendingum á mismunandi bílstjóra.
5. Vista afhendingartíma, viðtakandastaðfestingar og stöðu.
